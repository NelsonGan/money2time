import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { withEntryStamp } from '~/features/sharedLedgers/lib/entryStamp';
import { owedToPayer } from '~/features/transactions/lib/splitPayer';
import { getDb, getSQLite } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { transactionsTable } from '~/lib/db/schema';
import type {
  Transaction,
  TransactionFilters,
  TransactionSentiment,
  TransactionSplit,
  TransactionSplitsSummary,
  TransactionType,
  TransactionWithRelations,
} from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { escapeLike, rankNoteSuggestions } from '~/utils/noteSuggestions';
import { perfSpan } from '~/utils/perfTrace';
import { sortTransactions } from '~/utils/transactionSorting';

import {
  createTransactionAssembler,
  toTransaction,
  TRANSACTION_COMMON_COLUMNS_SQL,
  TRANSACTION_SPARSE_COLUMNS_SQL,
  TRANSACTION_SPARSE_FILTER_SQL,
  type TransactionRelationLookups,
  transactionRelations,
} from './mappers';
import { transactionSplitsRepository } from './transactionSplitsRepository';

/**
 * A new entry naming an account or category the open ledger does not have:
 * the ledger it was drafted in is gone while its editor was open (deleted on
 * another phone, or replaced by a reset or a cloud copy), and the default one
 * opened. Saving it would mix the two or leave dangling references.
 */
export class EntryLedgerGoneError extends Error {
  constructor() {
    super('entry_ledger_gone');
    this.name = 'EntryLedgerGoneError';
  }
}

/** Throws `EntryLedgerGoneError` unless every account and category `input` names is the open ledger's. */
export function assertInOpenLedger(input: CreateTransactionInput): void {
  const refs: [string, string | null | undefined][] = [
    ['accounts', input.accountId],
    ['accounts', input.fromAccountId],
    ['accounts', input.toAccountId],
    ['categories', input.categoryId],
  ];
  for (const [table, refId] of refs) {
    if (!refId) continue;
    const row = getSQLite().getFirstSync<{ ledger_id: string }>(
      `SELECT ledger_id FROM ${table} WHERE id = ?`,
      [refId],
    );
    if (row?.ledger_id !== getActiveLedgerId()) throw new EntryLedgerGoneError();
  }
}

export interface CreateTransactionInput {
  type: TransactionType;
  amount: number;
  currency: string;
  /** Frozen reporting-currency snapshot (computed by AppContext at write time). */
  reportingCurrency?: string | null;
  reportingAmount?: number | null;
  fxRate?: number | null;
  /** Credited amount in the to-account's currency for cross-currency transfers. */
  toAmount?: number | null;
  /** Frozen value in the account's currency when the entered currency differs. */
  accountAmount?: number | null;
  date: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  /** Longer free-text note kept beside `note`. */
  details?: string | null;
  /** Relative path of an attached receipt image, e.g. `receipts/9f3c.jpg`. */
  receiptUri?: string | null;
  sentiment?: TransactionSentiment;
  /** Marks an expense as one someone else will pay back. */
  reimbursable?: boolean;
  reimbursedAt?: string | null;
  reimbursementAccountId?: string | null;
  reimbursementTransactionId?: string | null;
  /** Set on the income row written for a refund; points at the expense. */
  reimbursementOfId?: string | null;
  /**
   * Marks a transfer as one the user asked to be counted as spending (a loan
   * repayment). Analytics only; see `utils/spending.ts`.
   */
  countsAsExpense?: boolean;
  /** Set on a transfer fee's expense row; points at the transfer it was charged on. */
  feeOfId?: string | null;
  /** Written by a drag reorder only; a new row always starts unordered. */
  dayOrder?: number | null;
  /** Instalment plan payments only: the plan and which payment (0 = payoff). */
  instalmentRuleId?: string | null;
  instalmentNumber?: number | null;
  /**
   * Shared ledgers: who added the entry and whose it is (Cloud Sync account
   * ids, null = the ledger's owner). Left out, a new entry is stamped with
   * this phone's account when it is a member of the open ledger
   * (`withEntryStamp`). `createdBy` is never changed after the insert.
   */
  createdBy?: string | null;
  memberId?: string | null;
}

/** Ids per `IN (…)` lookup, under SQLite's bound-parameter limit. */
const ID_LOOKUP_CHUNK = 900;
/** Ids per soft-delete statement (each bound twice, well under SQLite's limit). */
const SOFT_DELETE_CHUNK = 5000;

const DEFAULT_TRANSACTION_QUERY: TransactionFilters = {
  search: '',
  dateRange: null,
  accountId: null,
  excludedAccountIds: [],
  type: 'all',
  incomeCategoryId: null,
  expenseCategoryId: null,
  excludedIncomeCategoryIds: [],
  excludedExpenseCategoryIds: [],
  categoryId: null,
  minAmount: null,
  maxAmount: null,
  sortBy: 'date_desc',
};

function normalizeTransactionFilters(
  filters: Partial<TransactionFilters> = {},
): TransactionFilters {
  return {
    ...DEFAULT_TRANSACTION_QUERY,
    ...filters,
  };
}

function normalizeTransactionInput<T extends Partial<CreateTransactionInput>>(input: T): T {
  if (input.amount === undefined) return input;
  return {
    ...input,
    amount: normalizeMoneyAmount(input.amount),
  };
}

/** Who added an entry is fixed at its insert: an update never carries it. */
function withoutCreator<T extends Partial<CreateTransactionInput>>(input: T): T {
  if (!('createdBy' in input)) return input;
  const copy = { ...input };
  delete copy.createdBy;
  return copy;
}

export function summarizeSplits(splits: TransactionSplit[]): TransactionSplitsSummary {
  // A bill a friend paid has one share to settle: the user's own, owed to the
  // payer. The other friends on it owe the payer, not the user.
  const owed = owedToPayer(splits, 0);
  if (owed) {
    const unpaid = owed.owed > 0;
    return {
      count: 1,
      paidCount: unpaid ? 0 : 1,
      unpaidAmount: owed.owed,
      totalOwed: owed.total,
      youOwe: true,
    };
  }
  let count = 0;
  let paidCount = 0;
  let unpaidAmount = 0;
  let totalOwed = 0;
  for (const split of splits) {
    if (split.isSelf) continue;
    count += 1;
    totalOwed += split.amount;
    // A row that owes nothing is settled, the same rule as Settle Up and
    // countUnpaidSplitBills (amount > 0): Split evenly can leave a friend who
    // already paid back their part on an unpaid 0 row, and the list's "still
    // owes" badge must not count it.
    if (split.paidAt || !(split.amount > 0)) {
      paidCount += 1;
    } else {
      unpaidAmount += split.amount;
    }
  }
  return { count, paidCount, unpaidAmount, totalOwed, youOwe: false };
}

// Above this count, a `WHERE id IN (…)` clause carries so many bound parameters
// that preparing the statement costs more than scanning the splits table once
// and grouping in JS. The full scan returns a superset that the per-transaction
// map lookups below filter, so the result is identical either way.
const IN_CLAUSE_SCAN_THRESHOLD = 900;

function attachSplits(transactions: TransactionWithRelations[]): void {
  if (transactions.length === 0) return;
  const ids = transactions.map((t) => t.id);
  const grouped =
    ids.length > IN_CLAUSE_SCAN_THRESHOLD
      ? transactionSplitsRepository.listAllActiveGrouped()
      : transactionSplitsRepository.listByTransactionIds(ids);
  for (const transaction of transactions) {
    const splits = grouped.get(transaction.id);
    if (splits && splits.length > 0) {
      transaction.splits = splits;
      transaction.splitsSummary = summarizeSplits(splits);
    }
  }
}

type RawValue = string | number | null;

/** Every row of `query`, as arrays of values in column order. */
function rawRows(query: string, params: (string | number)[] = []): RawValue[][] {
  const statement = getSQLite().prepareSync(query);
  try {
    return statement.executeForRawResultSync(params).getAllSync() as RawValue[][];
  } finally {
    statement.finalizeSync();
  }
}

/**
 * The names a transaction shows for its accounts, category and instalment
 * plan. These tables are tiny next to the transactions, so each is read once
 * per load and looked up per row, which is what every load path does
 * ({@link transactionRelations}): an account that was deleted gives no name,
 * a deleted category still gives its own, and a category with no icon of its
 * own shows its parent's.
 */
function loadRelationLookups(): TransactionRelationLookups {
  const accountNames = new Map<string, string>();
  const categories = new Map<
    string,
    { name: string | null; icon: string | null; parentId: string | null; parentName: string | null }
  >();
  const instalmentCounts = new Map<string, number>();
  // One query for the three, tagged by table: each call into SQLite costs
  // more than these few rows do, and `getById` runs this for a single row.
  for (const [table, id, name, icon, parentId, parentName] of rawRows(
    `SELECT 'account', id, name, NULL, NULL, NULL FROM accounts WHERE deleted_at IS NULL
     UNION ALL
     SELECT 'category', c.id, c.name,
         COALESCE(NULLIF(TRIM(c.icon), ''), NULLIF(TRIM(p.icon), '')), c.parent_id, p.name
       FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
     UNION ALL
     SELECT 'plan', id, instalment_count, NULL, NULL, NULL FROM recurring_rules
       WHERE deleted_at IS NULL AND instalment_count IS NOT NULL`,
  )) {
    if (table === 'account') {
      accountNames.set(id as string, name as string);
    } else if (table === 'category') {
      categories.set(id as string, {
        name: name as string | null,
        icon: icon as string | null,
        parentId: parentId as string | null,
        parentName: parentName as string | null,
      });
    } else {
      instalmentCounts.set(id as string, name as number);
    }
  }
  return { accountNames, categories, instalmentCounts };
}

/**
 * Every live transaction of the open ledger with its relation names, newest
 * first, which leaves `sortTransactions` little or nothing to do. This is the
 * launch load (and the reload after an edit), so it is kept lean. Rows are
 * read as plain value arrays and built into objects in one pass: a Drizzle
 * select, `toTransaction` and a relations query built three objects per row
 * and read the table twice, the best part of a second on a five-year history
 * on Android. And what crosses into JavaScript is kept small, since each value
 * costs about the same there whatever it holds: the fifteen columns every row
 * uses, the sparse columns only for the rows that set one, and no joined names
 * (see `TRANSACTION_SPARSE_DEFAULTS` in the mappers).
 */
function loadAllWithRelations(): TransactionWithRelations[] {
  const ledgerId = getActiveLedgerId();
  const sparseById = new Map<string, RawValue[]>();
  for (const row of rawRows(
    `SELECT ${TRANSACTION_SPARSE_COLUMNS_SQL} FROM transactions t
      WHERE t.deleted_at IS NULL AND t.ledger_id = ? AND (${TRANSACTION_SPARSE_FILTER_SQL})`,
    [ledgerId],
  )) {
    sparseById.set(row[0] as string, row);
  }
  const rows = perfSpan('tx_rows', () =>
    rawRows(
      `SELECT ${TRANSACTION_COMMON_COLUMNS_SQL} FROM transactions t
        WHERE t.deleted_at IS NULL AND t.ledger_id = ?
        ORDER BY t.date DESC, t.created_at DESC, t.id DESC`,
      [ledgerId],
    ),
  );
  return perfSpan('tx_build', () => {
    const assemble = createTransactionAssembler(loadRelationLookups(), sparseById);
    const transactions = new Array<TransactionWithRelations>(rows.length);
    for (let index = 0; index < rows.length; index += 1) {
      transactions[index] = assemble(rows[index] ?? []);
    }
    return transactions;
  });
}

/** Adds the relation names to transactions read without them. */
function attachRelations(transactions: Transaction[]): TransactionWithRelations[] {
  if (transactions.length === 0) return [];
  const lookups = loadRelationLookups();
  return transactions.map((transaction) => ({
    ...transaction,
    ...transactionRelations(transaction, lookups),
  }));
}

function matchesExcludedCategory(
  transaction: TransactionWithRelations,
  excludedCategoryIdSet: ReadonlySet<string>,
) {
  if (!transaction.categoryId) return false;
  return (
    excludedCategoryIdSet.has(transaction.categoryId) ||
    (!!transaction.categoryParentId && excludedCategoryIdSet.has(transaction.categoryParentId))
  );
}

// Selecting a parent category includes its child sub-categories: a transaction
// matches when it is filed directly under the selected category or under one of
// its children (i.e. its category's parent is the selected category).
function matchesIncludedCategory(transaction: TransactionWithRelations, categoryId: string) {
  return transaction.categoryId === categoryId || transaction.categoryParentId === categoryId;
}

function buildSqlPredicates(normalized: TransactionFilters) {
  const predicates = [
    isNull(transactionsTable.deletedAt),
    inActiveLedger(transactionsTable),
    normalized.type === 'balance_adjustment'
      ? or(eq(transactionsTable.type, 'balance_adjustment'), eq(transactionsTable.type, 'transfer'))
      : normalized.type === 'transfer'
        ? eq(transactionsTable.type, 'transfer')
        : normalized.type !== 'all'
          ? eq(transactionsTable.type, normalized.type)
          : undefined,
    normalized.dateRange ? gte(transactionsTable.date, normalized.dateRange.start) : undefined,
    normalized.dateRange ? lte(transactionsTable.date, normalized.dateRange.end) : undefined,
    normalized.accountId
      ? or(
          eq(transactionsTable.accountId, normalized.accountId),
          eq(transactionsTable.fromAccountId, normalized.accountId),
          eq(transactionsTable.toAccountId, normalized.accountId),
        )
      : undefined,
    normalized.minAmount !== null ? gte(transactionsTable.amount, normalized.minAmount) : undefined,
    normalized.maxAmount !== null ? lte(transactionsTable.amount, normalized.maxAmount) : undefined,
  ];

  if (normalized.search.trim()) {
    const term = `%${normalized.search.trim().toLowerCase()}%`;
    predicates.push(
      or(
        sql`lower(coalesce(${transactionsTable.note}, '')) like ${term}`,
        sql`lower(coalesce(${transactionsTable.details}, '')) like ${term}`,
      ),
    );
  }

  return predicates;
}

/** The predicates `buildSqlPredicates` always adds: not deleted, in the open ledger. */
const ALWAYS_ON_PREDICATES = 2;

class TransactionsRepository {
  // Plain rows matching the SQL-level filters only: no relation names and no
  // splits. For aggregations that read amount, type, date and category and
  // never touch those, so the lookups in `list()` would be pure waste.
  listForSummary(filters: Partial<TransactionFilters> = {}): Transaction[] {
    const db = getDb();
    const normalized = normalizeTransactionFilters(filters);
    return db
      .select()
      .from(transactionsTable)
      .where(and(...buildSqlPredicates(normalized)))
      .all()
      .map(toTransaction);
  }

  list(filters: Partial<TransactionFilters> = {}): TransactionWithRelations[] {
    const normalized = normalizeTransactionFilters(filters);
    const predicates = buildSqlPredicates(normalized);

    // The soft-delete and ledger checks are always there. With nothing else
    // narrowing the query every live row of the ledger is wanted, which the
    // one-query loader reads fastest.
    const transactions =
      predicates.filter(Boolean).length > ALWAYS_ON_PREDICATES
        ? attachRelations(
            getDb()
              .select()
              .from(transactionsTable)
              .where(and(...predicates))
              .all()
              .map(toTransaction),
          )
        : loadAllWithRelations();
    attachSplits(transactions);
    const excludedAccountIdSet = new Set(normalized.excludedAccountIds);
    const excludedIncomeCategoryIdSet = new Set(normalized.excludedIncomeCategoryIds);
    const excludedExpenseCategoryIdSet = new Set(normalized.excludedExpenseCategoryIds);
    const hasIncomeCategoryFilter = normalized.incomeCategoryId !== null;
    const hasExpenseCategoryFilter = normalized.expenseCategoryId !== null;
    const hasCategoryFilter = normalized.categoryId !== null;
    const hasExcludedAccountFilter = excludedAccountIdSet.size > 0;
    const hasExcludedIncomeCategoryFilter = excludedIncomeCategoryIdSet.size > 0;
    const hasExcludedExpenseCategoryFilter = excludedExpenseCategoryIdSet.size > 0;
    const requiresLegacyTransferTypeCheck =
      normalized.type === 'transfer' || normalized.type === 'balance_adjustment';

    const filtered = transactions.filter((transaction) => {
      const isLegacyBalanceAdjustmentTransfer =
        requiresLegacyTransferTypeCheck &&
        transaction.type === 'transfer' &&
        !!transaction.accountId &&
        !transaction.fromAccountId &&
        !transaction.toAccountId;

      const matchesType =
        normalized.type === 'all'
          ? true
          : normalized.type === 'balance_adjustment'
            ? transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer
            : normalized.type === 'transfer'
              ? transaction.type === 'transfer' && !isLegacyBalanceAdjustmentTransfer
              : transaction.type === normalized.type;
      if (!matchesType) return false;

      if (hasExcludedAccountFilter) {
        if (
          (transaction.accountId && excludedAccountIdSet.has(transaction.accountId)) ||
          (transaction.fromAccountId && excludedAccountIdSet.has(transaction.fromAccountId)) ||
          (transaction.toAccountId && excludedAccountIdSet.has(transaction.toAccountId))
        ) {
          return false;
        }
      }

      if (transaction.type === 'income' && hasIncomeCategoryFilter) {
        if (!matchesIncludedCategory(transaction, normalized.incomeCategoryId as string)) {
          return false;
        }
      }
      if (transaction.type === 'expense' && hasExpenseCategoryFilter) {
        if (!matchesIncludedCategory(transaction, normalized.expenseCategoryId as string)) {
          return false;
        }
      }
      if (
        !hasIncomeCategoryFilter &&
        !hasExpenseCategoryFilter &&
        hasCategoryFilter &&
        (transaction.type === 'income' || transaction.type === 'expense') &&
        !matchesIncludedCategory(transaction, normalized.categoryId as string)
      ) {
        return false;
      }
      if (
        transaction.type === 'income' &&
        hasExcludedIncomeCategoryFilter &&
        matchesExcludedCategory(transaction, excludedIncomeCategoryIdSet)
      ) {
        return false;
      }
      if (
        transaction.type === 'expense' &&
        hasExcludedExpenseCategoryFilter &&
        matchesExcludedCategory(transaction, excludedExpenseCategoryIdSet)
      ) {
        return false;
      }
      return true;
    });

    return perfSpan('tx_sort', () => sortTransactions(filtered, normalized.sortBy));
  }

  /**
   * Re-denominate an account into `toCurrency` by applying `rate`
   * (1 old-currency = `rate` toCurrency) when the user changes the account's
   * currency.
   *
   * Income/expense/adjustment rows keep their original amount AND currency —
   * they simply become foreign entries in the new account currency, with their
   * frozen account-currency value (`account_amount`) scaled so the account
   * balance is denominated in `toCurrency`. (A row recorded in MYR stays MYR
   * even after the account flips to USD, exactly like entering MYR into a USD
   * account.) Their reporting snapshot is untouched (their own currency didn't
   * change). Transfer legs, whose amount is intrinsically the account's
   * currency, are converted in place.
   */
  redenominateAccount(accountId: string, toCurrency: string, rate: number): void {
    const sqlite = getSQLite();
    const now = nowIso();
    sqlite.execSync('BEGIN');
    try {
      // Income/expense/adjustment rows: freeze their value in the new account
      // currency without touching the entered amount/currency. COALESCE handles
      // both native rows (no account_amount yet) and existing foreign rows.
      sqlite.runSync(
        `UPDATE transactions
           SET account_amount = COALESCE(account_amount, amount) * ?, updated_at = ?
         WHERE deleted_at IS NULL AND account_id = ?
           AND type IN ('income','expense','balance_adjustment')`,
        [rate, now, accountId],
      );
      // Transfers out of this account (amount is in the from-currency). A
      // previously same-currency transfer becomes cross-currency, so freeze the
      // destination's value before scaling the sent amount.
      sqlite.runSync(
        `UPDATE transactions SET to_amount = amount
         WHERE deleted_at IS NULL AND from_account_id = ? AND type = 'transfer' AND to_amount IS NULL`,
        [accountId],
      );
      sqlite.runSync(
        `UPDATE transactions SET amount = amount * ?, currency = ?, updated_at = ?
         WHERE deleted_at IS NULL AND from_account_id = ? AND type = 'transfer'`,
        [rate, toCurrency, now, accountId],
      );
      // Transfers into this account (to_amount is in this account's currency).
      sqlite.runSync(
        `UPDATE transactions SET to_amount = to_amount * ?, updated_at = ?
         WHERE deleted_at IS NULL AND to_account_id = ? AND type = 'transfer' AND to_amount IS NOT NULL`,
        [rate, now, accountId],
      );
      sqlite.runSync(
        `UPDATE transactions SET to_amount = amount * ?, updated_at = ?
         WHERE deleted_at IS NULL AND to_account_id = ? AND type = 'transfer' AND to_amount IS NULL`,
        [rate, now, accountId],
      );
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  getById(id: string): TransactionWithRelations | null {
    const db = getDb();
    const row = db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.id, id),
          isNull(transactionsTable.deletedAt),
          inActiveLedger(transactionsTable),
        ),
      )
      .get();

    if (!row) return null;
    const withRelations = attachRelations([toTransaction(row)]);
    attachSplits(withRelations);
    return withRelations[0] ?? null;
  }

  /**
   * Loads many transactions (with relations + splits) in a fixed number of
   * queries via batched IN lookups, instead of N per-id round trips. Order is
   * not preserved — callers that need ordering should sort the result.
   */
  listByIds(ids: string[]): TransactionWithRelations[] {
    if (ids.length === 0) return [];
    const db = getDb();
    const rows = db
      .select()
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.id, ids),
          isNull(transactionsTable.deletedAt),
          inActiveLedger(transactionsTable),
        ),
      )
      .all();
    const withRelations = attachRelations(rows.map(toTransaction));
    attachSplits(withRelations);
    return withRelations;
  }

  /**
   * Which of `ids` are expenses with a refund row written for them. One query
   * for a whole edit, so the edit only has to look closer at those.
   */
  idsWithRefund(ids: string[]): string[] {
    const found: string[] = [];
    for (let start = 0; start < ids.length; start += ID_LOOKUP_CHUNK) {
      const chunk = ids.slice(start, start + ID_LOOKUP_CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      for (const [id] of rawRows(
        `SELECT id FROM transactions
          WHERE id IN (${placeholders}) AND deleted_at IS NULL
            AND reimbursement_transaction_id IS NOT NULL`,
        chunk,
      )) {
        found.push(id as string);
      }
    }
    return found;
  }

  create(input: CreateTransactionInput): string {
    const id = newId();
    this.createWithId(id, input);
    return id;
  }

  /**
   * `now` stamps createdAt/updatedAt. A caller that already rendered the row
   * optimistically passes the stamp it used, so the stored row matches it and
   * the reconcile after the write has nothing to change. `createdAt` places
   * the row among its day's rows when it differs (a transfer's fee sits a
   * millisecond under its transfer); `updatedAt` is always `now`.
   */
  createWithId(
    id: string,
    input: CreateTransactionInput,
    now: string = nowIso(),
    createdAt: string = now,
  ) {
    const db = getDb();
    const ledgerId = getActiveLedgerId();
    const normalizedInput = withEntryStamp(normalizeTransactionInput(input), ledgerId);

    db.insert(transactionsTable)
      .values({
        id,
        ledgerId,
        type: normalizedInput.type,
        amount: normalizedInput.amount,
        currency: normalizedInput.currency,
        reportingCurrency: normalizedInput.reportingCurrency ?? null,
        reportingAmount: normalizedInput.reportingAmount ?? null,
        fxRate: normalizedInput.fxRate ?? null,
        toAmount: normalizedInput.toAmount ?? null,
        accountAmount: normalizedInput.accountAmount ?? null,
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: normalizedInput.fromAccountId ?? null,
        toAccountId: normalizedInput.toAccountId ?? null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
        details: normalizedInput.details ?? null,
        receiptUri: normalizedInput.receiptUri ?? null,
        sentiment: normalizedInput.sentiment ?? 'neutral',
        reimbursable: normalizedInput.reimbursable ?? false,
        reimbursedAt: normalizedInput.reimbursedAt ?? null,
        reimbursementAccountId: normalizedInput.reimbursementAccountId ?? null,
        reimbursementTransactionId: normalizedInput.reimbursementTransactionId ?? null,
        reimbursementOfId: normalizedInput.reimbursementOfId ?? null,
        countsAsExpense: normalizedInput.countsAsExpense ?? false,
        feeOfId: normalizedInput.feeOfId ?? null,
        dayOrder: null,
        instalmentRuleId: normalizedInput.instalmentRuleId ?? null,
        instalmentNumber: normalizedInput.instalmentNumber ?? null,
        createdBy: normalizedInput.createdBy,
        memberId: normalizedInput.memberId,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

  update(id: string, updates: Partial<CreateTransactionInput>) {
    const db = getDb();
    const normalizedUpdates = normalizeTransactionInput(withoutCreator(updates));
    db.update(transactionsTable)
      .set({
        ...normalizedUpdates,
        updatedAt: nowIso(),
      })
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .run();
  }

  /**
   * `now` stamps updatedAt. A caller that already rendered the edit
   * optimistically passes the stamp it used, so the stored rows match what is
   * on screen and the reconcile after the write has nothing to change.
   */
  updateMany(
    updates: { id: string; input: Partial<CreateTransactionInput> }[],
    now: string = nowIso(),
  ) {
    if (updates.length === 0) return;
    const sqlite = getSQLite();
    const db = getDb();

    sqlite.execSync('BEGIN');
    try {
      for (let index = 0; index < updates.length; index += 1) {
        const update = updates[index];
        if (!update) continue;
        const { id } = update;
        const input = normalizeTransactionInput(withoutCreator(update.input));
        db.update(transactionsTable)
          .set({
            ...input,
            updatedAt: now,
          })
          .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
          .run();
      }
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Shared ledgers: gives the rows written from an entry (its reimbursement
   * refund, its split payback transfers, a transfer's fee) to the same person as the entry,
   * after `member_id` changed on it. Who added them stays as it was.
   */
  reassignLinked(id: string, memberId: string | null) {
    getSQLite().runSync(
      `UPDATE transactions SET member_id = ?, updated_at = ?
       WHERE deleted_at IS NULL AND member_id IS NOT ? AND (
         id = (SELECT reimbursement_transaction_id FROM transactions WHERE id = ?)
         OR id IN (SELECT paid_transaction_id FROM transaction_splits
                   WHERE transaction_id = ? AND deleted_at IS NULL
                     AND paid_transaction_id IS NOT NULL)
         OR fee_of_id = ?)`,
      [memberId, nowIso(), memberId, id, id, id],
    );
  }

  /** Deletes a row, and the fee charged on it when it is a transfer. */
  softDelete(id: string) {
    this.softDeleteMany([id]);
  }

  /** Deletes the rows, and the fees charged on any of them that are transfers. */
  softDeleteMany(ids: string[]) {
    if (ids.length === 0) return;
    const db = getDb();
    const now = nowIso();
    // Each id is bound twice; chunks keep a large bulk delete under SQLite's
    // bound-parameter limit.
    for (let start = 0; start < ids.length; start += SOFT_DELETE_CHUNK) {
      const chunk = ids.slice(start, start + SOFT_DELETE_CHUNK);
      db.update(transactionsTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            isNull(transactionsTable.deletedAt),
            or(inArray(transactionsTable.id, chunk), inArray(transactionsTable.feeOfId, chunk)),
          ),
        )
        .run();
    }
  }

  /** Moves every non-deleted transaction in `fromCategoryIds` to `toCategoryId`. */
  reassignCategory(fromCategoryIds: string[], toCategoryId: string) {
    if (fromCategoryIds.length === 0) return;
    const db = getDb();
    db.update(transactionsTable)
      .set({ categoryId: toCategoryId, updatedAt: nowIso() })
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          inActiveLedger(transactionsTable),
          inArray(transactionsTable.categoryId, fromCategoryIds),
        ),
      )
      .run();
  }

  softDeleteByAccountId(accountId: string) {
    const db = getDb();
    const now = nowIso();
    db.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          or(
            eq(transactionsTable.accountId, accountId),
            eq(transactionsTable.fromAccountId, accountId),
            eq(transactionsTable.toAccountId, accountId),
          ),
        ),
      )
      .run();
  }
}

export function getDistinctNotesSuggestions(prefix: string): string[] {
  if (!prefix) return [];
  const sqlite = getSQLite();
  // LIKE narrows to notes containing the text anywhere; rankNoteSuggestions
  // then keeps only those where it starts the note or a word, so "burger"
  // finds "Mcd Burger". Notes starting with the text sort first so the cap
  // never drops one of them for a run of recent mid-word hits ("ca" in
  // "Local" pushing out "Cafe").
  const escaped = escapeLike(prefix);
  const rows = sqlite.getAllSync<{ note: string }>(
    "SELECT note, MAX(date) AS latest FROM transactions WHERE note IS NOT NULL AND note LIKE ? ESCAPE '\\' AND deleted_at IS NULL AND ledger_id = ? GROUP BY note ORDER BY note LIKE ? ESCAPE '\\' DESC, latest DESC LIMIT 100",
    [`%${escaped}%`, getActiveLedgerId(), `${escaped}%`],
  );
  return rankNoteSuggestions(
    rows.map((r) => r.note),
    prefix,
  );
}

export function getLatestTransactionFieldsByNote(
  exactNote: string,
): { categoryId: string | null; accountId: string | null; amount: number | null } | null {
  if (!exactNote) return null;
  const sqlite = getSQLite();
  const row = sqlite.getFirstSync<{
    category_id: string | null;
    account_id: string | null;
    amount: number | null;
  }>(
    'SELECT category_id, account_id, amount FROM transactions WHERE note = ? AND deleted_at IS NULL AND ledger_id = ? ORDER BY date DESC, created_at DESC LIMIT 1',
    [exactNote, getActiveLedgerId()],
  );
  if (!row) return null;
  return { categoryId: row.category_id, accountId: row.account_id, amount: row.amount };
}

export const transactionsRepository = new TransactionsRepository();

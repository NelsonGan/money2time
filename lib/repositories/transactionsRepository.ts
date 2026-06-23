import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { transactionsTable } from '~/lib/db/schema';
import type {
  CashflowSummary,
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
import { sortTransactions } from '~/utils/transactionSorting';

import { toTransaction } from './mappers';
import { transactionSplitsRepository } from './transactionSplitsRepository';

type RelationRow = {
  txId: string;
  accountId: string | null;
  accountName: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryParentId: string | null;
  parentCategoryName: string | null;
};

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
  sentiment?: TransactionSentiment;
}

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
const inClausePlaceholdersByCount = new Map<number, string>();

function getInClausePlaceholders(count: number): string {
  const cached = inClausePlaceholdersByCount.get(count);
  if (cached) return cached;
  const placeholders = Array.from({ length: count }, () => '?').join(',');
  inClausePlaceholdersByCount.set(count, placeholders);
  return placeholders;
}

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

export function summarizeSplits(splits: TransactionSplit[]): TransactionSplitsSummary {
  let count = 0;
  let paidCount = 0;
  let unpaidAmount = 0;
  let totalOwed = 0;
  for (const split of splits) {
    if (split.isSelf) continue;
    count += 1;
    totalOwed += split.amount;
    if (split.paidAt) {
      paidCount += 1;
    } else {
      unpaidAmount += split.amount;
    }
  }
  return { count, paidCount, unpaidAmount, totalOwed };
}

function attachSplits(transactions: TransactionWithRelations[]): void {
  if (transactions.length === 0) return;
  const ids = transactions.map((t) => t.id);
  const grouped = transactionSplitsRepository.listByTransactionIds(ids);
  for (const transaction of transactions) {
    const splits = grouped.get(transaction.id);
    if (splits && splits.length > 0) {
      transaction.splits = splits;
      transaction.splitsSummary = summarizeSplits(splits);
    }
  }
}

function attachRelations(transactions: Transaction[]): TransactionWithRelations[] {
  if (transactions.length === 0) return [];

  const txIds: string[] = [];
  transactions.forEach((transaction) => {
    txIds.push(transaction.id);
  });
  const sqlite = getSQLite();
  const inClausePlaceholders = getInClausePlaceholders(txIds.length);

  const rows = sqlite.getAllSync<{
    txId: string;
    accountId: string | null;
    accountName: string | null;
    fromAccountId: string | null;
    fromAccountName: string | null;
    toAccountId: string | null;
    toAccountName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    categoryIcon: string | null;
    categoryParentId: string | null;
    parentCategoryName: string | null;
  }>(
    `
    SELECT
      t.id as txId,
      t.account_id as accountId,
      a.name as accountName,
      t.from_account_id as fromAccountId,
      fa.name as fromAccountName,
      t.to_account_id as toAccountId,
      ta.name as toAccountName,
      t.category_id as categoryId,
      c.name as categoryName,
      COALESCE(NULLIF(TRIM(c.icon), ''), NULLIF(TRIM(p.icon), '')) as categoryIcon,
      c.parent_id as categoryParentId,
      p.name as parentCategoryName
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
    LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.deleted_at IS NULL
    LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.deleted_at IS NULL
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE t.id IN (${inClausePlaceholders})
  `,
    txIds,
  );

  const relationMap = new Map<string, RelationRow>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    relationMap.set(row.txId, row);
  }

  const withRelations: TransactionWithRelations[] = [];
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    if (!transaction) continue;
    const rel = relationMap.get(transaction.id);
    withRelations.push({
      ...transaction,
      accountName: rel?.accountName ?? null,
      fromAccountName: rel?.fromAccountName ?? null,
      toAccountName: rel?.toAccountName ?? null,
      categoryName: rel?.categoryName ?? null,
      categoryParentId: rel?.categoryParentId ?? null,
      categoryParentName: rel?.parentCategoryName ?? null,
      categoryIcon: rel?.categoryIcon ?? null,
    });
  }
  return withRelations;
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
    predicates.push(or(sql`lower(coalesce(${transactionsTable.note}, '')) like ${term}`));
  }

  return predicates;
}

class TransactionsRepository {
  // Plain rows matching the SQL-level filters only — no relation JOINs and no
  // splits lookup. Used by aggregations (cashflow, category breakdowns) which
  // read amount/type/date/categoryId and never touch account/category names or
  // splits, so the two extra queries in `list()` are pure waste there.
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
    const db = getDb();
    const normalized = normalizeTransactionFilters(filters);

    const rows = db
      .select()
      .from(transactionsTable)
      .where(and(...buildSqlPredicates(normalized)))
      .all()
      .map(toTransaction);
    const transactions = attachRelations(rows);
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

    return sortTransactions(filtered, normalized.sortBy);
  }

  listByAccount(accountId: string) {
    return this.list({ accountId, sortBy: 'date_desc' });
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
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .get();

    if (!row) return null;
    const withRelations = attachRelations([toTransaction(row)]);
    attachSplits(withRelations);
    return withRelations[0] ?? null;
  }

  create(input: CreateTransactionInput): string {
    const id = newId();
    this.createWithId(id, input);
    return id;
  }

  createWithId(id: string, input: CreateTransactionInput) {
    const db = getDb();
    const now = nowIso();
    const normalizedInput = normalizeTransactionInput(input);

    db.insert(transactionsTable)
      .values({
        id,
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
        sentiment: normalizedInput.sentiment ?? 'neutral',
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

  update(id: string, updates: Partial<CreateTransactionInput>) {
    const db = getDb();
    const normalizedUpdates = normalizeTransactionInput(updates);
    db.update(transactionsTable)
      .set({
        ...normalizedUpdates,
        updatedAt: nowIso(),
      })
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .run();
  }

  updateMany(updates: { id: string; input: Partial<CreateTransactionInput> }[]) {
    if (updates.length === 0) return;
    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      for (let index = 0; index < updates.length; index += 1) {
        const update = updates[index];
        if (!update) continue;
        const { id } = update;
        const input = normalizeTransactionInput(update.input);
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

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .run();
  }

  softDeleteMany(ids: string[]) {
    if (ids.length === 0) return;
    const db = getDb();
    const now = nowIso();
    db.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(isNull(transactionsTable.deletedAt), inArray(transactionsTable.id, ids)))
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

  getCashflowSummary(range: { start: string; end: string }): CashflowSummary {
    const db = getDb();
    const rows = db
      .select()
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          gte(transactionsTable.date, range.start),
          lte(transactionsTable.date, range.end),
          inArray(transactionsTable.type, ['income', 'expense']),
        ),
      )
      .all();

    let income = 0;
    let expense = 0;
    rows.forEach((row) => {
      if (row.type === 'income') {
        income += row.amount;
      } else if (row.type === 'expense') {
        expense += row.amount;
      }
    });

    return { income, expense };
  }

  getTransfersBetweenAccounts(
    fromAccountId: string,
    toAccountId: string,
    start?: string,
    end?: string,
  ): TransactionWithRelations[] {
    const db = getDb();

    const rows = db
      .select()
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'transfer'),
          eq(transactionsTable.fromAccountId, fromAccountId),
          eq(transactionsTable.toAccountId, toAccountId),
          start ? gte(transactionsTable.date, start) : undefined,
          end ? lte(transactionsTable.date, end) : undefined,
        ),
      )
      .all()
      .map(toTransaction);
    const orderedRows = sortTransactions(rows, 'date_desc');
    return attachRelations(orderedRows);
  }
}

export function getDistinctNotesSuggestions(prefix: string): string[] {
  if (!prefix) return [];
  const sqlite = getSQLite();
  const rows = sqlite.getAllSync<{ note: string }>(
    'SELECT note, MAX(date) AS latest FROM transactions WHERE note IS NOT NULL AND note LIKE ? AND deleted_at IS NULL GROUP BY note ORDER BY latest DESC LIMIT 5',
    [`${prefix}%`],
  );
  return rows.map((r) => r.note);
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
    'SELECT category_id, account_id, amount FROM transactions WHERE note = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT 1',
    [exactNote],
  );
  if (!row) return null;
  return { categoryId: row.category_id, accountId: row.account_id, amount: row.amount };
}

export const transactionsRepository = new TransactionsRepository();

import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { CATEGORY_ICON_PLACEHOLDER } from '~/constants/appDefaults';
import { getDb, getSQLite } from '~/lib/db/client';
import { transactionsTable } from '~/lib/db/schema';
import type {
  CashflowSummary,
  Transaction,
  TransactionFilters,
  TransactionSentiment,
  TransactionType,
  TransactionWithRelations,
} from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { sortTransactions } from '~/utils/transactionSorting';

import { toTransaction } from './mappers';

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
      COALESCE(NULLIF(TRIM(c.icon), ''), NULLIF(TRIM(p.icon), ''), '${CATEGORY_ICON_PLACEHOLDER}') as categoryIcon,
      c.parent_id as categoryParentId,
      p.name as parentCategoryName
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
    LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.deleted_at IS NULL
    LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.deleted_at IS NULL
    LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
    LEFT JOIN categories p ON p.id = c.parent_id AND p.deleted_at IS NULL
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

class TransactionsRepository {
  list(filters: Partial<TransactionFilters> = {}): TransactionWithRelations[] {
    const db = getDb();
    const normalized = normalizeTransactionFilters(filters);

    const predicates = [
      isNull(transactionsTable.deletedAt),
      normalized.type === 'balance_adjustment'
        ? or(
            eq(transactionsTable.type, 'balance_adjustment'),
            eq(transactionsTable.type, 'transfer'),
          )
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
      normalized.categoryId ? eq(transactionsTable.categoryId, normalized.categoryId) : undefined,
      normalized.minAmount !== null
        ? gte(transactionsTable.amount, normalized.minAmount)
        : undefined,
      normalized.maxAmount !== null
        ? lte(transactionsTable.amount, normalized.maxAmount)
        : undefined,
    ];

    if (normalized.search.trim()) {
      const term = `%${normalized.search.trim().toLowerCase()}%`;
      predicates.push(or(sql`lower(coalesce(${transactionsTable.note}, '')) like ${term}`));
    }

    const rows = db
      .select()
      .from(transactionsTable)
      .where(and(...predicates))
      .all()
      .map(toTransaction);
    const transactions = attachRelations(rows);
    const excludedAccountIdSet = new Set(normalized.excludedAccountIds);
    const excludedIncomeCategoryIdSet = new Set(normalized.excludedIncomeCategoryIds);
    const excludedExpenseCategoryIdSet = new Set(normalized.excludedExpenseCategoryIds);
    const hasIncomeCategoryFilter = normalized.incomeCategoryId !== null;
    const hasExpenseCategoryFilter = normalized.expenseCategoryId !== null;
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
        if (transaction.categoryId !== normalized.incomeCategoryId) return false;
      }
      if (transaction.type === 'expense' && hasExpenseCategoryFilter) {
        if (transaction.categoryId !== normalized.expenseCategoryId) return false;
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

  getById(id: string): TransactionWithRelations | null {
    const db = getDb();
    const row = db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .get();

    if (!row) return null;
    return attachRelations([toTransaction(row)])[0] ?? null;
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

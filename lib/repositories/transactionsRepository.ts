import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { CATEGORY_ICON_PLACEHOLDER } from '~/constants/appDefaults';
import { getDb, getSQLite } from '~/lib/db/client';
import { transactionsTable } from '~/lib/db/schema';
import type {
  CashflowSummary,
  Transaction,
  TransactionFilters,
  TransactionType,
  TransactionWithRelations,
} from '~/types';
import { sortTransactions } from '~/utils/transactionSorting';
import { newId, nowIso } from '~/utils/id';

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
}

const DEFAULT_TRANSACTION_QUERY: TransactionFilters = {
  search: '',
  dateRange: null,
  accountId: null,
  type: 'all',
  incomeCategoryId: null,
  expenseCategoryId: null,
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
      categoryParentName: rel?.parentCategoryName ?? null,
      categoryIcon: rel?.categoryIcon ?? null,
    });
  }
  return withRelations;
}

class TransactionsRepository {
  list(filters: Partial<TransactionFilters> = {}): TransactionWithRelations[] {
    const db = getDb();
    const normalized = normalizeTransactionFilters(filters);

    const predicates = [
      isNull(transactionsTable.deletedAt),
      normalized.type !== 'all' ? eq(transactionsTable.type, normalized.type) : undefined,
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
    const orderedRows = sortTransactions(rows, normalized.sortBy);
    return attachRelations(orderedRows);
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

    db.insert(transactionsTable)
      .values({
        id,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        date: input.date,
        accountId: input.accountId ?? null,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
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
    db.update(transactionsTable)
      .set({
        ...updates,
        updatedAt: nowIso(),
      })
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
      .run();
  }

  updateMany(updates: Array<{ id: string; input: Partial<CreateTransactionInput> }>) {
    if (updates.length === 0) return;
    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      for (let index = 0; index < updates.length; index += 1) {
        const update = updates[index];
        if (!update) continue;
        const { id, input } = update;
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

export const transactionsRepository = new TransactionsRepository();

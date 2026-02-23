import { and, desc, eq, gte, inArray, isNull, lte, or, sql, asc } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { accountsTable, categoriesTable, transactionsTable } from '~/lib/db/schema';
import type {
  CashflowSummary,
  Transaction,
  TransactionFilters,
  TransactionType,
  TransactionWithRelations,
} from '~/types';
import { newId, nowIso } from '~/utils/id';
import { toTransaction } from './mappers';

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

function buildSort(sortBy: TransactionFilters['sortBy']) {
  switch (sortBy) {
    case 'date_asc':
      return [asc(transactionsTable.date)];
    case 'amount_desc':
      return [desc(transactionsTable.amount)];
    case 'amount_asc':
      return [asc(transactionsTable.amount)];
    default:
      return [desc(transactionsTable.date), desc(transactionsTable.createdAt)];
  }
}

function attachRelations(transactions: Transaction[]): TransactionWithRelations[] {
  if (transactions.length === 0) return [];
  const db = getDb();
  const accountIds = Array.from(
    new Set(
      transactions.flatMap(
        (t) => [t.accountId, t.fromAccountId, t.toAccountId].filter(Boolean) as string[],
      ),
    ),
  );
  const categoryIds = Array.from(
    new Set(transactions.map((t) => t.categoryId).filter(Boolean) as string[]),
  );

  const accounts = accountIds.length
    ? db.select().from(accountsTable).where(inArray(accountsTable.id, accountIds)).all()
    : [];
  const primaryCategories = categoryIds.length
    ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds)).all()
    : [];
  const parentCategoryIds = Array.from(
    new Set(primaryCategories.map((category) => category.parentId).filter(Boolean) as string[]),
  );
  const parentCategories = parentCategoryIds.length
    ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, parentCategoryIds)).all()
    : [];
  const categories = [...primaryCategories, ...parentCategories];

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return transactions.map((transaction) => {
    const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : undefined;
    const parent = category?.parentId ? categoryMap.get(category.parentId) : undefined;

    return {
      ...transaction,
      accountName: transaction.accountId ? (accountMap.get(transaction.accountId) ?? null) : null,
      fromAccountName: transaction.fromAccountId
        ? (accountMap.get(transaction.fromAccountId) ?? null)
        : null,
      toAccountName: transaction.toAccountId
        ? (accountMap.get(transaction.toAccountId) ?? null)
        : null,
      categoryName: category?.name ?? null,
      categoryParentName: parent?.name ?? null,
      categoryIcon: category?.icon ?? null,
    };
  });
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
      .orderBy(...buildSort(normalized.sortBy))
      .all()
      .map(toTransaction);

    return attachRelations(rows);
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
    const db = getDb();
    const id = newId();
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

    return id;
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

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)))
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
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
      .all()
      .map(toTransaction);

    return attachRelations(rows);
  }
}

export const transactionsRepository = new TransactionsRepository();

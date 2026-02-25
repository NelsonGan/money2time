import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { accountsTable, transactionsTable } from '~/lib/db/schema';
import type { Account, AccountBalance } from '~/types';
import { newId, nowIso } from '~/utils/id';
import { toAccount } from './mappers';

interface CreateAccountInput {
  name: string;
  sortOrder?: number;
  type: Account['type'];
  accountGroup?: string | null;
  creditStatementDay?: number | null;
  creditDueDay?: number | null;
  currency: string;
  icon: string;
  color: string;
  startingBalance: number;
  includeInTotals: boolean;
  deletedAt?: string | null;
}

class AccountsRepository {
  list(): Account[] {
    const db = getDb();
    return db
      .select()
      .from(accountsTable)
      .where(isNull(accountsTable.deletedAt))
      .orderBy(accountsTable.sortOrder, accountsTable.name)
      .all()
      .map(toAccount);
  }

  getById(id: string): Account | null {
    const db = getDb();
    const row = db
      .select()
      .from(accountsTable)
      .where(and(eq(accountsTable.id, id), isNull(accountsTable.deletedAt)))
      .get();
    return row ? toAccount(row) : null;
  }

  create(input: CreateAccountInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const maxSort = db
      .select({ maxSort: sql<number>`coalesce(max(${accountsTable.sortOrder}), -1)` })
      .from(accountsTable)
      .where(isNull(accountsTable.deletedAt))
      .get();
    const nextSortOrder = input.sortOrder ?? (maxSort?.maxSort ?? -1) + 1;

    db.insert(accountsTable)
      .values({
        id,
        ...input,
        sortOrder: nextSortOrder,
        accountGroup: input.accountGroup ?? null,
        creditStatementDay: input.creditStatementDay ?? null,
        creditDueDay: input.creditDueDay ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateAccountInput>) {
    const db = getDb();
    db.update(accountsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(accountsTable.id, id), isNull(accountsTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(accountsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(accountsTable.id, id), isNull(accountsTable.deletedAt)))
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;
    const db = getDb();
    const now = nowIso();
    ids.forEach((id, index) => {
      db.update(accountsTable)
        .set({ sortOrder: index, updatedAt: now })
        .where(and(eq(accountsTable.id, id), isNull(accountsTable.deletedAt)))
        .run();
    });
  }

  getBalances(): AccountBalance[] {
    const db = getDb();
    const accounts = this.list();
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((account) => account.id);
    const txns = db
      .select()
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          or(
            inArray(transactionsTable.accountId, accountIds),
            inArray(transactionsTable.fromAccountId, accountIds),
            inArray(transactionsTable.toAccountId, accountIds),
          ),
        ),
      )
      .all();

    const aggregates = new Map<string, Omit<AccountBalance, 'accountId'> & { adjustments: number }>();
    accounts.forEach((account) => {
      aggregates.set(account.id, {
        balance: account.startingBalance,
        income: 0,
        expense: 0,
        transfersIn: 0,
        transfersOut: 0,
        adjustments: 0,
      });
    });

    txns.forEach((transaction) => {
      const isLegacyBalanceAdjustmentTransfer =
        transaction.type === 'transfer' &&
        !!transaction.accountId &&
        !transaction.fromAccountId &&
        !transaction.toAccountId;

      if (transaction.type === 'income' && transaction.accountId) {
        const current = aggregates.get(transaction.accountId);
        if (current) current.income += transaction.amount;
      }
      if (transaction.type === 'expense' && transaction.accountId) {
        const current = aggregates.get(transaction.accountId);
        if (current) current.expense += transaction.amount;
      }
      if (transaction.type === 'transfer' && !isLegacyBalanceAdjustmentTransfer && transaction.toAccountId) {
        const current = aggregates.get(transaction.toAccountId);
        if (current) current.transfersIn += transaction.amount;
      }
      if (
        transaction.type === 'transfer' &&
        !isLegacyBalanceAdjustmentTransfer &&
        transaction.fromAccountId
      ) {
        const current = aggregates.get(transaction.fromAccountId);
        if (current) current.transfersOut += transaction.amount;
      }
      if (
        (transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer) &&
        transaction.accountId
      ) {
        const current = aggregates.get(transaction.accountId);
        if (current) current.adjustments += transaction.amount;
      }
    });

    return accounts.map((account) => {
      const aggregate = aggregates.get(account.id);
      const income = aggregate?.income ?? 0;
      const expense = aggregate?.expense ?? 0;
      const transfersIn = aggregate?.transfersIn ?? 0;
      const transfersOut = aggregate?.transfersOut ?? 0;
      const adjustments = aggregate?.adjustments ?? 0;
      const balance =
        account.type === 'credit'
          ? account.startingBalance + expense + transfersOut - income - transfersIn + adjustments
          : account.startingBalance + income + transfersIn - expense - transfersOut + adjustments;

      return {
        accountId: account.id,
        balance,
        income,
        expense,
        transfersIn,
        transfersOut,
      };
    });
  }
}

export const accountsRepository = new AccountsRepository();

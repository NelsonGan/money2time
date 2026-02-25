import { and, eq, inArray, isNull, or, sql, sum } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
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

    db.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          or(
            eq(transactionsTable.accountId, id),
            eq(transactionsTable.fromAccountId, id),
            eq(transactionsTable.toAccountId, id),
          ),
        ),
      )
      .run();

    db.update(recurringRulesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          isNull(recurringRulesTable.deletedAt),
          or(
            eq(recurringRulesTable.accountId, id),
            eq(recurringRulesTable.fromAccountId, id),
            eq(recurringRulesTable.toAccountId, id),
          ),
        ),
      )
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;
    const sqlite = getSQLite();
    const now = nowIso();

    const cases = ids.map((id, index) => `WHEN '${id}' THEN ${index}`).join(' ');
    const placeholders = ids.map((id) => `'${id}'`).join(',');
    sqlite.execSync(
      `UPDATE accounts SET sort_order = CASE id ${cases} END, updated_at = '${now}' WHERE id IN (${placeholders})`,
    );
  }

  getBalances(): AccountBalance[] {
    const db = getDb();
    const accounts = this.list();
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((account) => account.id);

    const incomeByAccount = db
      .select({
        accountId: transactionsTable.accountId,
        total: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'income'),
          inArray(transactionsTable.accountId, accountIds),
        ),
      )
      .groupBy(transactionsTable.accountId)
      .all();

    const expenseByAccount = db
      .select({
        accountId: transactionsTable.accountId,
        total: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'expense'),
          inArray(transactionsTable.accountId, accountIds),
        ),
      )
      .groupBy(transactionsTable.accountId)
      .all();

    const transfersInByAccount = db
      .select({
        accountId: transactionsTable.toAccountId,
        total: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'transfer'),
          inArray(transactionsTable.toAccountId, accountIds),
        ),
      )
      .groupBy(transactionsTable.toAccountId)
      .all();

    const transfersOutByAccount = db
      .select({
        accountId: transactionsTable.fromAccountId,
        total: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'transfer'),
          inArray(transactionsTable.fromAccountId, accountIds),
        ),
      )
      .groupBy(transactionsTable.fromAccountId)
      .all();

    const legacyAdjustments = db
      .select({
        accountId: transactionsTable.accountId,
        total: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .where(
        and(
          isNull(transactionsTable.deletedAt),
          eq(transactionsTable.type, 'balance_adjustment'),
          inArray(transactionsTable.accountId, accountIds),
        ),
      )
      .groupBy(transactionsTable.accountId)
      .all();

    const balanceAdjustmentsByAccount = new Map<string, number>();
    legacyAdjustments.forEach((row) => {
      if (row.accountId) {
        const current = Number(row.total) || 0;
        balanceAdjustmentsByAccount.set(row.accountId, current);
      }
    });

    const incomeMap = new Map<string, number>();
    incomeByAccount.forEach((row) => {
      if (row.accountId) incomeMap.set(row.accountId, Number(row.total) || 0);
    });

    const expenseMap = new Map<string, number>();
    expenseByAccount.forEach((row) => {
      if (row.accountId) expenseMap.set(row.accountId, Number(row.total) || 0);
    });

    const transfersInMap = new Map<string, number>();
    transfersInByAccount.forEach((row) => {
      if (row.accountId) transfersInMap.set(row.accountId, Number(row.total) || 0);
    });

    const transfersOutMap = new Map<string, number>();
    transfersOutByAccount.forEach((row) => {
      if (row.accountId) transfersOutMap.set(row.accountId, Number(row.total) || 0);
    });

    return accounts.map((account) => {
      const income = incomeMap.get(account.id) ?? 0;
      const expense = expenseMap.get(account.id) ?? 0;
      const transfersIn = transfersInMap.get(account.id) ?? 0;
      const transfersOut = transfersOutMap.get(account.id) ?? 0;
      const adjustments = balanceAdjustmentsByAccount.get(account.id) ?? 0;
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

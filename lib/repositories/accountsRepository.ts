import { and, eq, isNull, or, sql } from 'drizzle-orm';

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
  logoId?: string | null;
  creditStatementDay?: number | null;
  creditDueDay?: number | null;
  currency: string;
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

  reorder(ids: string[]) {
    if (ids.length === 0) return;

    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      ids.forEach((id, index) => {
        db.update(accountsTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(accountsTable.id, id), isNull(accountsTable.deletedAt)))
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
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

  getBalances(): AccountBalance[] {
    const accounts = this.list();
    if (accounts.length === 0) return [];

    // Single round-trip instead of five separate GROUP BY queries. Each branch
    // hits the partial (type, account) indexes; aggregating in one statement
    // removes four JS-bridge round trips, which is what dominates here since
    // balances recompute on every transaction change.
    const rows = getSQLite().getAllSync<{
      bucket: 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'adjustment';
      accountId: string | null;
      total: number | null;
    }>(`
      SELECT 'income' AS bucket, account_id AS accountId, SUM(COALESCE(account_amount, amount)) AS total
        FROM transactions
        WHERE deleted_at IS NULL AND type = 'income' AND account_id IS NOT NULL
        GROUP BY account_id
      UNION ALL
      SELECT 'expense', account_id, SUM(COALESCE(account_amount, amount))
        FROM transactions
        WHERE deleted_at IS NULL AND type = 'expense' AND account_id IS NOT NULL
        GROUP BY account_id
      UNION ALL
      SELECT 'transfer_in', to_account_id, SUM(COALESCE(to_amount, amount))
        FROM transactions
        WHERE deleted_at IS NULL AND type = 'transfer' AND to_account_id IS NOT NULL
        GROUP BY to_account_id
      UNION ALL
      SELECT 'transfer_out', from_account_id, SUM(amount)
        FROM transactions
        WHERE deleted_at IS NULL AND type = 'transfer' AND from_account_id IS NOT NULL
        GROUP BY from_account_id
      UNION ALL
      SELECT 'adjustment', account_id, SUM(COALESCE(account_amount, amount))
        FROM transactions
        WHERE deleted_at IS NULL AND type = 'balance_adjustment' AND account_id IS NOT NULL
        GROUP BY account_id
    `);

    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    const transfersInMap = new Map<string, number>();
    const transfersOutMap = new Map<string, number>();
    const balanceAdjustmentsByAccount = new Map<string, number>();

    for (const row of rows) {
      if (!row.accountId) continue;
      const total = Number(row.total) || 0;
      switch (row.bucket) {
        case 'income':
          incomeMap.set(row.accountId, total);
          break;
        case 'expense':
          expenseMap.set(row.accountId, total);
          break;
        case 'transfer_in':
          transfersInMap.set(row.accountId, total);
          break;
        case 'transfer_out':
          transfersOutMap.set(row.accountId, total);
          break;
        case 'adjustment':
          balanceAdjustmentsByAccount.set(row.accountId, total);
          break;
      }
    }

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
        currency: account.currency,
        // Conversion to the reporting currency is applied by AppContext, which
        // holds the in-memory rate table.
        convertedBalance: null,
      };
    });
  }
}

export const accountsRepository = new AccountsRepository();

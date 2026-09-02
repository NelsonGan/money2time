import { and, eq, isNull, or, sql } from 'drizzle-orm';

import {
  accrueReducingBalance,
  loanAccrualRatePercent,
  loanAccruesInterest,
  loanLedgerAnchor,
  type LoanLedgerMovement,
  loanRateChangesOf,
  type ReducingBalanceLedger,
} from '~/features/loans/lib/loanMath';
import { getDb, getSQLite } from '~/lib/db/client';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
import type { Account, AccountBalance, LoanInterestModel, LoanRateChange } from '~/types';
import { computeAccountBalance } from '~/utils/accountBalances';
import { dayKeyFromDateLocal } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

import { serializeLoanRateChanges, toAccount } from './mappers';

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
  goalTargetAmount?: number | null;
  goalTargetDate?: string | null;
  goalEmoji?: string | null;
  goalAchievedAt?: string | null;
  goalArchivedAt?: string | null;
  loanInterestModel?: LoanInterestModel | null;
  loanOriginalPrincipal?: number | null;
  loanMonthlyPayment?: number | null;
  loanPaymentDay?: number | null;
  loanInterestRate?: number | null;
  loanTermMonths?: number | null;
  loanTotalRepayable?: number | null;
  loanStartDate?: string | null;
  loanLedgerAnchorDate?: string | null;
  loanRateChanges?: LoanRateChange[] | null;
  loanPaidOffAt?: string | null;
  loanArchivedAt?: string | null;
  loanCountAsExpense?: boolean | null;
  loanPaymentCategoryId?: string | null;
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
    // The rate changes are a domain array; the row holds them as JSON.
    const { loanRateChanges, ...columns } = input;

    db.insert(accountsTable)
      .values({
        id,
        ...columns,
        loanLedgerAnchorDate: input.loanLedgerAnchorDate ?? null,
        loanRateChangesJson: serializeLoanRateChanges(loanRateChanges),
        sortOrder: nextSortOrder,
        accountGroup: input.accountGroup ?? null,
        creditStatementDay: input.creditStatementDay ?? null,
        creditDueDay: input.creditDueDay ?? null,
        goalTargetAmount: input.goalTargetAmount ?? null,
        goalTargetDate: input.goalTargetDate ?? null,
        goalEmoji: input.goalEmoji ?? null,
        goalAchievedAt: input.goalAchievedAt ?? null,
        goalArchivedAt: input.goalArchivedAt ?? null,
        loanInterestModel: input.loanInterestModel ?? null,
        loanOriginalPrincipal: input.loanOriginalPrincipal ?? null,
        loanMonthlyPayment: input.loanMonthlyPayment ?? null,
        loanPaymentDay: input.loanPaymentDay ?? null,
        loanInterestRate: input.loanInterestRate ?? null,
        loanTermMonths: input.loanTermMonths ?? null,
        loanTotalRepayable: input.loanTotalRepayable ?? null,
        loanStartDate: input.loanStartDate ?? null,
        loanPaidOffAt: input.loanPaidOffAt ?? null,
        loanArchivedAt: input.loanArchivedAt ?? null,
        loanCountAsExpense: input.loanCountAsExpense ?? null,
        loanPaymentCategoryId: input.loanPaymentCategoryId ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateAccountInput>) {
    const db = getDb();
    const { loanRateChanges, ...columns } = input;
    db.update(accountsTable)
      .set({
        ...columns,
        // Only when the caller spoke to it: an update that says nothing about
        // the rate changes must not wipe the ones the loan has.
        ...(loanRateChanges !== undefined
          ? { loanRateChangesJson: serializeLoanRateChanges(loanRateChanges) }
          : {}),
        updatedAt: nowIso(),
      })
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

    const accruingLoans = accounts.filter(
      (account) => account.type === 'loan' && loanAccruesInterest(account),
    );
    const interestLedgers = this.interestLedgers(accruingLoans);

    return accounts.map((account) => {
      const income = incomeMap.get(account.id) ?? 0;
      const expense = expenseMap.get(account.id) ?? 0;
      const transfersIn = transfersInMap.get(account.id) ?? 0;
      const transfersOut = transfersOutMap.get(account.id) ?? 0;
      const adjustments = balanceAdjustmentsByAccount.get(account.id) ?? 0;
      const balance = computeAccountBalance({
        type: account.type,
        startingBalance: account.startingBalance,
        income,
        expense,
        transfersIn,
        transfersOut,
        adjustments,
      });

      // A loan's debt is not the sum of its rows: the lender adds interest to
      // it every month, and the instalment only retires what is left after
      // that. The walk replaces the plain balance with the ledger one, here
      // rather than at any display site, so net worth, the account cards, the
      // widgets and the payoff stamp all read the same debt.
      const ledger = interestLedgers.get(account.id);

      return {
        accountId: account.id,
        balance: ledger ? ledger.balance : balance,
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

  /**
   * Walks each interest-bearing loan's dated movements forward through its
   * monthly interest rests, flat and reducing balance alike (see
   * `accrueReducingBalance` for why a flat contract is walked too).
   *
   * Interest is derived rather than posted as rows of its own. Nothing is
   * written, so correcting, backdating or deleting a repayment years later
   * re-derives the right debt instead of leaving a trail of stale charges to
   * reconcile, and a borrower never finds transactions in their history they
   * did not make.
   *
   * The opening balance is dated at the day it describes (`loanLedgerAnchor`):
   * the last instalment already paid for a loan set up from its contract, or
   * the day the account was created for one saved before that was recorded. A
   * loan entered half-way through its life therefore starts accruing from
   * there, on the balance its owner gave, rather than replaying years of
   * interest it has already been charged.
   */
  private interestLedgers(loans: Account[]): Map<string, ReducingBalanceLedger> {
    const ledgers = new Map<string, ReducingBalanceLedger>();
    if (loans.length === 0) return ledgers;

    const todayIso = dayKeyFromDateLocal(new Date());
    const placeholders = loans.map(() => '?').join(', ');
    const ids = loans.map((loan) => loan.id);
    // Signed against the debt, matching computeAccountBalance's liability
    // branch: spending on the loan and transfers out draw it down further,
    // income and transfers in pay it off, adjustments carry their own sign.
    const rows = getSQLite().getAllSync<{
      accountId: string;
      date: string;
      delta: number | null;
    }>(
      `SELECT to_account_id AS accountId, date, -SUM(COALESCE(to_amount, amount)) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'transfer' AND to_account_id IN (${placeholders})
         GROUP BY to_account_id, date
       UNION ALL
       SELECT from_account_id AS accountId, date, SUM(amount) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'transfer' AND from_account_id IN (${placeholders})
         GROUP BY from_account_id, date
       UNION ALL
       SELECT account_id AS accountId, date, SUM(COALESCE(account_amount, amount)) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'expense' AND account_id IN (${placeholders})
         GROUP BY account_id, date
       UNION ALL
       SELECT account_id AS accountId, date, -SUM(COALESCE(account_amount, amount)) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'income' AND account_id IN (${placeholders})
         GROUP BY account_id, date
       UNION ALL
       SELECT account_id AS accountId, date, SUM(COALESCE(account_amount, amount)) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'balance_adjustment' AND account_id IN (${placeholders})
         GROUP BY account_id, date`,
      [...ids, ...ids, ...ids, ...ids, ...ids],
    );

    const movementsByAccount = new Map<string, LoanLedgerMovement[]>();
    for (const row of rows) {
      const delta = Number(row.delta) || 0;
      if (delta === 0) continue;
      const bucket = movementsByAccount.get(row.accountId);
      if (bucket) bucket.push({ date: row.date, delta });
      else movementsByAccount.set(row.accountId, [{ date: row.date, delta }]);
    }

    for (const loan of loans) {
      ledgers.set(
        loan.id,
        accrueReducingBalance({
          openingBalance: loan.startingBalance,
          anchorDate: loanLedgerAnchor(loan, todayIso),
          annualRatePercent: loanAccrualRatePercent(loan),
          rateChanges: loanRateChangesOf(loan),
          movements: movementsByAccount.get(loan.id) ?? [],
          todayIso,
        }),
      );
    }
    return ledgers;
  }
}

export const accountsRepository = new AccountsRepository();

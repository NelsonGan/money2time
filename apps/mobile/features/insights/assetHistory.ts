import {
  accrueReducingBalance,
  loanAccrualRatePercent,
  loanAccruesInterest,
  loanLedgerAnchor,
  type LoanLedgerMovement,
  loanRateChangesOf,
} from '~/features/loans/lib/loanMath';
import type { Account, Transaction } from '~/types';
import { computeAccountBalance, getNetAssetContribution } from '~/utils/accountBalances';
import { normalizeMoneyAmount } from '~/utils/formatters';

/**
 * The Asset History chart's own account choices, keyed by account id: `true`
 * shows an account the Accounts tab leaves out of its totals, `false` hides one
 * it counts.
 *
 * Only departures from "Include in totals" are stored. The chart used to save
 * the full list of hidden accounts, seeded once from "Include in totals", so an
 * account taken out of the totals afterwards stayed on the chart for good and
 * the two net-worth figures stopped agreeing with nothing on screen to say why.
 */
export type AssetHistoryAccountOverrides = Record<string, boolean>;

type AccountVisibility = Pick<Account, 'id' | 'includeInTotals'>;

export function isAssetHistoryAccountExcluded(
  account: AccountVisibility,
  overrides: AssetHistoryAccountOverrides,
): boolean {
  const override = overrides[account.id];
  return override === undefined ? !account.includeInTotals : !override;
}

export function assetHistoryExcludedAccountIds(
  accounts: readonly AccountVisibility[],
  overrides: AssetHistoryAccountOverrides,
): string[] {
  return accounts
    .filter((account) => isAssetHistoryAccountExcluded(account, overrides))
    .map((account) => account.id);
}

/** Flips one account on the chart, forgetting the choice once it matches the default. */
export function toggleAssetHistoryAccount(
  overrides: AssetHistoryAccountOverrides,
  account: AccountVisibility,
): AssetHistoryAccountOverrides {
  const nextIncluded = isAssetHistoryAccountExcluded(account, overrides);
  const next = { ...overrides };
  if (nextIncluded === account.includeInTotals) delete next[account.id];
  else next[account.id] = nextIncluded;
  return next;
}

/** "Exclude none": shows every account, including those left out of the totals. */
export function includeAllAssetHistoryAccounts(
  accounts: readonly AccountVisibility[],
): AssetHistoryAccountOverrides {
  const next: AssetHistoryAccountOverrides = {};
  accounts.forEach((account) => {
    if (!account.includeInTotals) next[account.id] = true;
  });
  return next;
}

/**
 * Shows one account on the chart and hides every other: the first pick of an
 * include filter, where nothing picked meant "all" and one pick means "only this".
 */
export function showOnlyAssetHistoryAccount(
  accounts: readonly AccountVisibility[],
  accountId: string,
): AssetHistoryAccountOverrides {
  const next: AssetHistoryAccountOverrides = {};
  accounts.forEach((account) => {
    const included = account.id === accountId;
    if (included !== account.includeInTotals) next[account.id] = included;
  });
  return next;
}

/**
 * Drops choices for deleted accounts and choices that now match the account's
 * own "Include in totals" (so a later change to that switch reaches the chart).
 * Returns the same object when nothing changed, so it is safe in a state setter.
 */
export function pruneAssetHistoryOverrides(
  overrides: AssetHistoryAccountOverrides,
  accounts: readonly AccountVisibility[],
): AssetHistoryAccountOverrides {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  let changed = false;
  const next: AssetHistoryAccountOverrides = {};
  Object.entries(overrides).forEach(([accountId, included]) => {
    const account = accountById.get(accountId);
    if (!account || included === account.includeInTotals) {
      changed = true;
      return;
    }
    next[accountId] = included;
  });
  return changed ? next : overrides;
}

/**
 * Reads the stored overrides.
 *
 * The retired `excludedAssetHistoryAccountIds` list is deliberately not read.
 * It was seeded from "Include in totals" at first use, so it cannot tell a
 * user's own hide from a copy of a setting that has changed since; migrating
 * its entries would pin exactly that stale copy in place. Dropping it lets
 * every account follow its "Include in totals" again, and a deliberate hide
 * is one tap in the filter to redo.
 */
export function parseAssetHistoryAccountOverrides(
  parsed: Record<string, unknown>,
): AssetHistoryAccountOverrides | null {
  const raw = parsed.assetHistoryAccountOverrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const next: AssetHistoryAccountOverrides = {};
  Object.entries(raw as Record<string, unknown>).forEach(([accountId, included]) => {
    if (accountId && typeof included === 'boolean') next[accountId] = included;
  });
  return next;
}

type LedgerTransaction = Pick<
  Transaction,
  | 'id'
  | 'type'
  | 'amount'
  | 'date'
  | 'accountId'
  | 'fromAccountId'
  | 'toAccountId'
  | 'toAmount'
  | 'accountAmount'
>;

type LedgerAccount = Pick<
  Account,
  | 'id'
  | 'type'
  | 'currency'
  | 'startingBalance'
  | 'createdAt'
  | 'loanOriginalPrincipal'
  | 'loanTotalRepayable'
  | 'loanTermMonths'
  | 'loanInterestRate'
  | 'loanRateChanges'
  | 'loanLedgerAnchorDate'
  | 'loanStartDate'
>;

interface AccountLedger {
  account: LedgerAccount;
  /** Balance change per financial month key, in the account's own terms. */
  deltaByMonth: Map<string, number>;
  /** Present on an interest-bearing loan: debt movements for the accrual walk. */
  loanMovements: (LoanLedgerMovement & { monthKey: string })[] | null;
}

export interface AssetHistoryLedger {
  accounts: AccountLedger[];
}

/**
 * Buckets every movement of the given accounts by month, the same way
 * `accountsRepository.getBalances` totals them for the Accounts tab: in the
 * account's own currency (`accountAmount` / `toAmount` on cross-currency rows),
 * with a liability's signs flipped, and with loan interest left to the ledger
 * walk. A chart point is then that balance as of the end of its month.
 */
export function buildAssetHistoryLedger(input: {
  accounts: readonly LedgerAccount[];
  transactions: readonly LedgerTransaction[];
  monthKeyOf: (transaction: LedgerTransaction) => string;
}): AssetHistoryLedger {
  const ledgerById = new Map<string, AccountLedger>();
  input.accounts.forEach((account) => {
    ledgerById.set(account.id, {
      account,
      deltaByMonth: new Map(),
      loanMovements: account.type === 'loan' && loanAccruesInterest(account) ? [] : null,
    });
  });

  // Each amount goes through computeAccountBalance in its own bucket, so a
  // liability's sign flip comes from the Accounts tab's formula, not a copy.
  const add = (
    accountId: string | null,
    bucket: 'income' | 'expense' | 'transfersIn' | 'transfersOut' | 'adjustments',
    amount: number,
    transaction: LedgerTransaction,
  ) => {
    if (!accountId || !amount) return;
    const ledger = ledgerById.get(accountId);
    if (!ledger) return;
    const monthKey = input.monthKeyOf(transaction);
    const delta = computeAccountBalance({
      type: ledger.account.type,
      startingBalance: 0,
      income: bucket === 'income' ? amount : 0,
      expense: bucket === 'expense' ? amount : 0,
      transfersIn: bucket === 'transfersIn' ? amount : 0,
      transfersOut: bucket === 'transfersOut' ? amount : 0,
      adjustments: bucket === 'adjustments' ? amount : 0,
    });
    ledger.deltaByMonth.set(monthKey, (ledger.deltaByMonth.get(monthKey) ?? 0) + delta);
    ledger.loanMovements?.push({ date: transaction.date, delta, monthKey });
  };

  input.transactions.forEach((transaction) => {
    const accountAmount = transaction.accountAmount ?? transaction.amount;
    switch (transaction.type) {
      case 'income':
        add(transaction.accountId, 'income', accountAmount, transaction);
        break;
      case 'expense':
        add(transaction.accountId, 'expense', accountAmount, transaction);
        break;
      case 'transfer':
        add(
          transaction.toAccountId,
          'transfersIn',
          transaction.toAmount ?? transaction.amount,
          transaction,
        );
        add(transaction.fromAccountId, 'transfersOut', transaction.amount, transaction);
        break;
      case 'balance_adjustment':
        add(transaction.accountId, 'adjustments', accountAmount, transaction);
        break;
    }
  });

  return { accounts: Array.from(ledgerById.values()) };
}

/**
 * Net assets at the end of `monthKey`, in the reporting currency.
 *
 * `monthEndDayKey` is the last day of that financial month; a loan's interest
 * is charged at its rests up to that day, or up to today for a month still
 * running or yet to come, since interest not charged yet is not owed. Each
 * balance is converted with `toReportingCurrency`, which the caller backs with
 * the same rate table the Accounts tab converts with.
 */
export function assetHistoryTotalForMonth(
  ledger: AssetHistoryLedger,
  input: {
    monthKey: string;
    monthEndDayKey: string;
    todayDayKey: string;
    toReportingCurrency: (amount: number, currency: string) => number;
  },
): number {
  const accrueUntil =
    input.monthEndDayKey < input.todayDayKey ? input.monthEndDayKey : input.todayDayKey;
  let total = 0;
  ledger.accounts.forEach(({ account, deltaByMonth, loanMovements }) => {
    let balance: number;
    if (loanMovements) {
      balance = accrueReducingBalance({
        openingBalance: account.startingBalance,
        anchorDate: loanLedgerAnchor(account, input.todayDayKey),
        annualRatePercent: loanAccrualRatePercent(account),
        rateChanges: loanRateChangesOf(account),
        movements: loanMovements.filter((movement) => movement.monthKey <= input.monthKey),
        todayIso: accrueUntil,
      }).balance;
    } else {
      balance = account.startingBalance;
      deltaByMonth.forEach((delta, monthKey) => {
        if (monthKey <= input.monthKey) balance += delta;
      });
    }
    total += getNetAssetContribution(
      account.type,
      input.toReportingCurrency(normalizeMoneyAmount(balance), account.currency),
    );
  });
  return normalizeMoneyAmount(total);
}

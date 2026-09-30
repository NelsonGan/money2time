import {
  assetHistoryExcludedAccountIds,
  assetHistoryTotalForMonth,
  buildAssetHistoryLedger,
  includeAllAssetHistoryAccounts,
  parseAssetHistoryAccountOverrides,
  pruneAssetHistoryOverrides,
  toggleAssetHistoryAccount,
} from '~/features/insights/assetHistory';
import { accrueReducingBalance } from '~/features/loans/lib/loanMath';
import type { Account, AccountType, Transaction } from '~/types';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    name: id,
    type: 'debit' as AccountType,
    accountGroup: null,
    currency: 'MYR',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Account;
}

let txSeq = 0;
function tx(overrides: Partial<Transaction>): Transaction {
  txSeq += 1;
  return {
    id: `t${txSeq}`,
    type: 'expense',
    amount: 0,
    currency: 'MYR',
    reportingCurrency: null,
    reportingAmount: null,
    fxRate: null,
    toAmount: null,
    accountAmount: null,
    date: '2026-01-15T12:00:00.000Z',
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    categoryId: null,
    note: null,
    ...overrides,
  } as Transaction;
}

const monthKeyOf = (transaction: Pick<Transaction, 'date'>) => transaction.date.slice(0, 7);
const identity = (amount: number) => amount;

function totalFor(
  accounts: Account[],
  transactions: Transaction[],
  monthKey: string,
  options: {
    monthEndDayKey?: string;
    todayDayKey?: string;
    toReportingCurrency?: (amount: number, currency: string) => number;
  } = {},
) {
  const ledger = buildAssetHistoryLedger({ accounts, transactions, monthKeyOf });
  return assetHistoryTotalForMonth(ledger, {
    monthKey,
    monthEndDayKey: options.monthEndDayKey ?? `${monthKey}-28`,
    todayDayKey: options.todayDayKey ?? '2026-12-31',
    toReportingCurrency: options.toReportingCurrency ?? identity,
  });
}

describe('asset history account visibility', () => {
  const counted = account('counted');
  const epf = account('epf', { includeInTotals: false });
  const accounts = [counted, epf];

  it('follows "Include in totals" when the user has made no choice', () => {
    expect(assetHistoryExcludedAccountIds(accounts, {})).toEqual(['epf']);
  });

  it('stores only departures from the default, and forgets a choice toggled back', () => {
    const shown = toggleAssetHistoryAccount({}, epf);
    expect(shown).toEqual({ epf: true });
    expect(assetHistoryExcludedAccountIds(accounts, shown)).toEqual([]);
    expect(toggleAssetHistoryAccount(shown, epf)).toEqual({});

    const hidden = toggleAssetHistoryAccount({}, counted);
    expect(hidden).toEqual({ counted: false });
    expect(assetHistoryExcludedAccountIds(accounts, hidden)).toEqual(['counted', 'epf']);
  });

  it('"exclude none" shows the accounts left out of the totals too', () => {
    const overrides = includeAllAssetHistoryAccounts(accounts);
    expect(assetHistoryExcludedAccountIds(accounts, overrides)).toEqual([]);
  });

  it('prunes deleted accounts and choices that now match the default', () => {
    const overrides = { counted: false, epf: false, gone: true };
    expect(pruneAssetHistoryOverrides(overrides, accounts)).toEqual({ counted: false });
    const clean = { counted: false };
    expect(pruneAssetHistoryOverrides(clean, accounts)).toBe(clean);
  });

  it('reads the new shape, and turns the retired hidden list into hides', () => {
    expect(
      parseAssetHistoryAccountOverrides({
        assetHistoryAccountOverrides: { a: true, b: false, c: 'yes' },
      }),
    ).toEqual({ a: true, b: false });
    expect(
      parseAssetHistoryAccountOverrides({ excludedAssetHistoryAccountIds: ['a', 7, ''] }),
    ).toEqual({ a: false });
    // An empty retired list carries no choice, so every account follows its
    // own "Include in totals" setting again.
    expect(parseAssetHistoryAccountOverrides({ excludedAssetHistoryAccountIds: [] })).toEqual({});
    expect(parseAssetHistoryAccountOverrides({})).toBeNull();
  });
});

describe('asset history balances', () => {
  it('matches the Accounts tab arithmetic for assets and credit cards', () => {
    const bank = account('bank', { startingBalance: 1000 });
    const card = account('card', { type: 'credit', startingBalance: 200 });
    const transactions = [
      tx({ type: 'income', amount: 500, accountId: 'bank' }),
      tx({ type: 'expense', amount: 120, accountId: 'bank' }),
      tx({ type: 'expense', amount: 80, accountId: 'card' }),
      tx({ type: 'transfer', amount: 150, fromAccountId: 'bank', toAccountId: 'card' }),
      tx({ type: 'balance_adjustment', amount: 10, accountId: 'bank' }),
      tx({ type: 'balance_adjustment', amount: -30, accountId: 'card' }),
    ];
    // bank: 1000 + 500 - 120 - 150 + 10 = 1240; card owes 200 + 80 - 150 - 30 = 100.
    expect(totalFor([bank, card], transactions, '2026-01')).toBe(1140);
  });

  it('counts a month only up to its own end', () => {
    const bank = account('bank', { startingBalance: 100 });
    const transactions = [
      tx({ type: 'income', amount: 50, accountId: 'bank', date: '2026-01-10T00:00:00.000Z' }),
      tx({ type: 'income', amount: 70, accountId: 'bank', date: '2026-03-10T00:00:00.000Z' }),
    ];
    expect(totalFor([bank], transactions, '2025-12')).toBe(100);
    expect(totalFor([bank], transactions, '2026-02')).toBe(150);
    expect(totalFor([bank], transactions, '2026-03')).toBe(220);
  });

  it('uses the amount in the account currency on cross-currency rows', () => {
    const usd = account('usd', { currency: 'USD' });
    const myr = account('myr', { startingBalance: 1000 });
    const transactions = [
      // A MYR 470 expense paid from the USD account debits USD 100.
      tx({ type: 'expense', amount: 470, accountAmount: 100, accountId: 'usd' }),
      // MYR 470 out of the MYR account lands as USD 100.
      tx({
        type: 'transfer',
        amount: 470,
        toAmount: 100,
        fromAccountId: 'myr',
        toAccountId: 'usd',
      }),
    ];
    expect(totalFor([usd, myr], transactions, '2026-01')).toBe(530);
  });

  it('converts each balance into the reporting currency', () => {
    const usd = account('usd', { currency: 'USD', startingBalance: 10 });
    const myr = account('myr', { startingBalance: 5 });
    const toMyr = (amount: number, currency: string) =>
      currency === 'USD' ? amount * 4.7 : amount;
    expect(totalFor([usd, myr], [], '2026-01', { toReportingCurrency: toMyr })).toBe(52);
  });

  it('walks a loan with interest the way the balance query does', () => {
    const loan = account('loan', {
      type: 'loan',
      startingBalance: 10000,
      loanInterestRate: 6,
      loanLedgerAnchorDate: '2026-01-05',
    });
    const repayments = ['2026-02-05', '2026-03-05', '2026-04-05'].map((date) =>
      tx({ type: 'transfer', amount: 500, toAccountId: 'loan', date: `${date}T09:00:00.000Z` }),
    );
    const expected = (untilDayKey: string, dates: string[]) =>
      -accrueReducingBalance({
        openingBalance: 10000,
        anchorDate: '2026-01-05',
        annualRatePercent: 6,
        movements: dates.map((date) => ({ date: `${date}T09:00:00.000Z`, delta: -500 })),
        todayIso: untilDayKey,
      }).balance;

    // March closes after two rests and two repayments.
    expect(
      totalFor([loan], repayments, '2026-03', {
        monthEndDayKey: '2026-03-31',
        todayDayKey: '2026-09-30',
      }),
    ).toBe(expected('2026-03-31', ['2026-02-05', '2026-03-05']));
    // A month still to come charges no interest beyond today.
    expect(
      totalFor([loan], repayments, '2026-12', {
        monthEndDayKey: '2026-12-31',
        todayDayKey: '2026-04-20',
      }),
    ).toBe(expected('2026-04-20', ['2026-02-05', '2026-03-05', '2026-04-05']));
    // And it really is more debt than the repayments alone would leave.
    expect(
      totalFor([loan], repayments, '2026-04', {
        monthEndDayKey: '2026-04-30',
        todayDayKey: '2026-09-30',
      }),
    ).toBeLessThan(-8500);
  });
});

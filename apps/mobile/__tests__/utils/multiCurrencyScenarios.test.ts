import type { ExchangeRate } from '~/types';
import { buildRateTable, convert, resolveRate } from '~/utils/currency';

/**
 * End-to-end multi-currency math, mirroring production:
 *  - createTransaction freezes `accountAmount` (account currency) when the entry
 *    currency differs, and `reportingAmount` (reporting currency) always.
 *  - account balance = SUM(COALESCE(account_amount, amount))  [account currency]
 *  - reporting totals (cashflow/insights) = SUM(reporting_amount)  [reporting]
 *  - transfer destination = SUM(COALESCE(to_amount, amount))     [to currency]
 *  - redenominateAccount scales COALESCE(account_amount, amount) by the rate.
 *
 * Reporting currency = MYR, sub-currency = USD, 1 MYR = 0.21 USD.
 */
const REPORTING = 'MYR';
const table = buildRateTable(REPORTING, [
  {
    id: 'r1',
    baseCurrency: 'MYR',
    quoteCurrency: 'USD',
    rate: 0.21,
    asOfDate: '2026-06-23',
    source: 'api',
    updatedAt: '2026-06-23T00:00:00.000Z',
  } satisfies ExchangeRate,
]);

// Mirror of AppContext.createTransaction's freeze for income/expense.
function freeze(amount: number, entryCurrency: string, accountCurrency: string) {
  const accountAmount =
    entryCurrency === accountCurrency
      ? null
      : convert(amount, entryCurrency, accountCurrency, table).value;
  const reportingAmount = convert(amount, entryCurrency, REPORTING, table).value;
  return { amount, currency: entryCurrency, accountAmount, reportingAmount };
}

type Txn = ReturnType<typeof freeze>;
const balanceContribution = (t: Txn) => t.accountAmount ?? t.amount; // account currency
const toReporting = (value: number, currency: string) =>
  convert(value, currency, REPORTING, table).value;

describe('multi-currency scenarios (MYR main, USD sub, 1 MYR = 0.21 USD)', () => {
  it('1 USD = 4.7619 MYR via the rate table', () => {
    expect(resolveRate('USD', 'MYR', table)).toBeCloseTo(1 / 0.21, 8);
    expect(convert(100, 'USD', 'MYR', table).value).toBe(476.19);
    expect(convert(100, 'MYR', 'USD', table).value).toBe(21);
  });

  it('USD 100 transaction in a MYR account', () => {
    const t = freeze(100, 'USD', 'MYR');
    expect(t.accountAmount).toBe(476.19); // frozen in account currency (MYR)
    expect(t.reportingAmount).toBe(476.19); // reporting == account currency here
    expect(balanceContribution(t)).toBe(476.19); // MYR account balance += 476.19
    // Account balance converted to reporting must equal the reporting snapshot.
    expect(toReporting(balanceContribution(t), 'MYR')).toBeCloseTo(t.reportingAmount, 2);
  });

  it('USD 100 transaction in a USD account', () => {
    const t = freeze(100, 'USD', 'USD');
    expect(t.accountAmount).toBeNull(); // native — no conversion stored
    expect(balanceContribution(t)).toBe(100); // USD account balance += 100 USD
    expect(t.reportingAmount).toBe(476.19); // reporting total += 476.19 MYR
    expect(toReporting(balanceContribution(t), 'USD')).toBeCloseTo(t.reportingAmount, 2);
  });

  it('MYR 100 transaction in a USD account', () => {
    const t = freeze(100, 'MYR', 'USD');
    expect(t.accountAmount).toBe(21); // frozen in account currency (USD)
    expect(t.reportingAmount).toBe(100); // reporting == entry currency here
    expect(balanceContribution(t)).toBe(21); // USD account balance += 21 USD
    expect(toReporting(balanceContribution(t), 'USD')).toBeCloseTo(t.reportingAmount, 2);
  });

  it('aggregates a mixed USD account correctly (USD-native + MYR-foreign)', () => {
    const native = freeze(100, 'USD', 'USD'); // 100 USD
    const foreign = freeze(100, 'MYR', 'USD'); // entered 100 MYR -> 21 USD
    const usdBalance = balanceContribution(native) + balanceContribution(foreign);
    expect(usdBalance).toBe(121); // 100 + 21 USD
    const reportingTotal = native.reportingAmount + foreign.reportingAmount;
    expect(reportingTotal).toBe(576.19); // 476.19 + 100 MYR
    // Net worth view (USD balance -> MYR) ties out with the reporting total.
    expect(toReporting(usdBalance, 'USD')).toBeCloseTo(reportingTotal, 1);
  });

  it('transfer MYR account -> USD account conserves value', () => {
    const sent = 100; // MYR (from-leg, stored as `amount`)
    const received = convert(sent, 'MYR', 'USD', table).value; // to_amount, USD
    expect(received).toBe(21);
    // from MYR balance: SUM(amount) = 100 MYR out; to USD balance: COALESCE(to_amount) = 21 USD in.
    const netWorthChange = -sent + toReporting(received, 'USD'); // in MYR
    expect(netWorthChange).toBeCloseTo(0, 6); // value conserved across the transfer
  });

  it('changing a MYR account to USD preserves the converted balance', () => {
    // A MYR account holding a native MYR txn and a foreign USD txn.
    const native = freeze(100, 'MYR', 'MYR'); // accountAmount null, balance 100 MYR
    const foreign = freeze(50, 'USD', 'MYR'); // entered 50 USD -> 238.1 MYR
    const myrBalanceBefore = balanceContribution(native) + balanceContribution(foreign);
    expect(myrBalanceBefore).toBe(338.1); // 100 + 238.1 MYR

    // redenominateAccount(MYR -> USD) scales COALESCE(account_amount, amount) by rate.
    const rate = resolveRate('MYR', 'USD', table)!; // 0.21
    const nativeAcctUsd = balanceContribution(native) * rate; // 100 * 0.21 = 21
    const foreignAcctUsd = balanceContribution(foreign) * rate; // 238.1 * 0.21 = 50.001
    const usdBalanceAfter = nativeAcctUsd + foreignAcctUsd;

    // The new USD balance equals the old MYR balance converted — no value lost.
    expect(usdBalanceAfter).toBeCloseTo(myrBalanceBefore * rate, 6);
    expect(usdBalanceAfter).toBeCloseTo(toReporting(myrBalanceBefore, 'MYR') * rate, 6);
  });
});

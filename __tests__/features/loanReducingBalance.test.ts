import {
  accrueReducingBalance,
  computeLoanProgress,
  flatRateForTotalRepayable,
  instalmentForContract,
  type LoanLedgerMovement,
  loanInterestModelOf,
  rateForModel,
  totalRepayableForFlatRate,
  totalRepayableForModel,
} from '~/features/loans/lib/loanMath';

/** Monthly anniversaries of a day key, as the ledger walk charges interest. */
function monthlyDayKeys(anchor: string, count: number): string[] {
  const [year, month, day] = anchor.split('-').map(Number);
  const keys: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(year!, month! - 1 + i, day!);
    keys.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
}

describe('loanInterestModelOf', () => {
  it('reads a loan with no stored model as flat, which is what it used to be', () => {
    expect(loanInterestModelOf({})).toBe('flat');
    expect(loanInterestModelOf({ loanInterestModel: null })).toBe('flat');
    expect(loanInterestModelOf(null)).toBe('flat');
  });

  it('reads a reducing balance loan as one', () => {
    expect(loanInterestModelOf({ loanInterestModel: 'reducing' })).toBe('reducing');
  });
});

describe('flat rate contracts', () => {
  it('charges simple interest on the whole principal for the whole term', () => {
    // RM50,000 at 3% flat over 5 years: 50,000 x 0.03 x 5 = 7,500 interest.
    expect(totalRepayableForFlatRate(50000, 3, 60)).toBe(57500);
  });

  it('round-trips the rate through the total', () => {
    const total = totalRepayableForFlatRate(50000, 3, 60)!;
    expect(flatRateForTotalRepayable(50000, total, 60)).toBe(3);
  });

  it('rejects a total below the amount borrowed', () => {
    expect(flatRateForTotalRepayable(50000, 40000, 60)).toBeNull();
  });

  it('costs far more than the same headline rate on a reducing balance', () => {
    const flat = totalRepayableForModel('flat', 50000, 3, 60)!;
    const reducing = totalRepayableForModel('reducing', 50000, 3, 60)!;
    expect(flat).toBeGreaterThan(reducing);
    // The classic gap: a 3% flat rate is roughly a 5.6% reducing balance rate.
    expect(rateForModel('reducing', 50000, flat, 60)).toBeCloseTo(5.61, 1);
  });
});

describe('accrueReducingBalance', () => {
  const ANCHOR = '2026-01-31';

  it('charges nothing when the loan carries no rate, matching the plain sum', () => {
    const ledger = accrueReducingBalance({
      openingBalance: 10000,
      anchorDate: ANCHOR,
      annualRatePercent: null,
      movements: [{ date: '2026-02-28', delta: -500 }],
      todayIso: '2026-06-30',
    });
    expect(ledger.balance).toBe(9500);
    expect(ledger.interestCharged).toBe(0);
  });

  it('charges one month of interest at each monthly rest', () => {
    const ledger = accrueReducingBalance({
      openingBalance: 100000,
      anchorDate: ANCHOR,
      // 6% a year is 0.5% a month.
      annualRatePercent: 6,
      movements: [],
      todayIso: '2026-03-31',
    });
    // Two rests: 100,000 -> 100,500 -> 101,002.50.
    expect(ledger.balance).toBeCloseTo(101002.5, 2);
    expect(ledger.interestCharged).toBeCloseTo(1002.5, 2);
  });

  it('takes the instalment after that month interest, as a lender does', () => {
    const ledger = accrueReducingBalance({
      openingBalance: 100000,
      anchorDate: ANCHOR,
      annualRatePercent: 6,
      movements: [{ date: '2026-02-28', delta: -1000 }],
      todayIso: '2026-02-28',
    });
    // The rest falls on 2026-02-28 (January 31 clamped into a short month), so
    // interest is charged on the full 100,000 and the payment lands after it.
    expect(ledger.balance).toBeCloseTo(99500, 2);
    expect(ledger.interestCharged).toBeCloseTo(500, 2);
  });

  it('runs an amortizing loan to zero on its final instalment', () => {
    const principal = 30000;
    const term = 36;
    const rate = 5;
    const instalment = instalmentForContract(principal, rate, term)!;
    const movements: LoanLedgerMovement[] = monthlyDayKeys('2026-01-15', term).map((date) => ({
      date,
      delta: -instalment,
    }));
    const ledger = accrueReducingBalance({
      openingBalance: principal,
      anchorDate: '2026-01-15',
      annualRatePercent: rate,
      movements,
      todayIso: monthlyDayKeys('2026-01-15', term)[term - 1]!,
    });
    // Nothing but the lender's own cent-rounding is left.
    expect(Math.abs(ledger.balance)).toBeLessThan(0.5);
    expect(ledger.interestCharged).toBeCloseTo(instalment * term - principal, 0);
  });

  it('holds together over a 30 year mortgage', () => {
    // The long case is the risky one: 360 cent-rounded interest charges could
    // drift a long way from the contract if the rest schedule were wrong.
    const principal = 500000;
    const term = 360;
    const rate = 4.2;
    const instalment = instalmentForContract(principal, rate, term)!;
    const dates = monthlyDayKeys('2026-01-15', term);
    const ledger = accrueReducingBalance({
      openingBalance: principal,
      anchorDate: '2026-01-15',
      annualRatePercent: rate,
      movements: dates.map((date) => ({ date, delta: -instalment })),
      todayIso: dates[term - 1]!,
    });
    // Within a few ringgit on half a million, which is the rounding a lender's
    // own smaller final payment absorbs.
    expect(Math.abs(ledger.balance)).toBeLessThan(10);
  });

  it('makes an extra repayment save interest for the rest of the term', () => {
    const principal = 30000;
    const term = 36;
    const rate = 5;
    const instalment = instalmentForContract(principal, rate, term)!;
    const dates = monthlyDayKeys('2026-01-15', term);
    const onSchedule: LoanLedgerMovement[] = dates.map((date) => ({ date, delta: -instalment }));
    // One 5,000 lump sum in the third month, nothing else changed.
    const withLumpSum: LoanLedgerMovement[] = [...onSchedule, { date: dates[2]!, delta: -5000 }];
    const at = (movements: LoanLedgerMovement[]) =>
      accrueReducingBalance({
        openingBalance: principal,
        anchorDate: '2026-01-15',
        annualRatePercent: rate,
        movements,
        todayIso: dates[term - 1]!,
      });

    const plain = at(onSchedule);
    const early = at(withLumpSum);
    // The lump sum comes off the balance every later rest is charged on, so
    // less interest is charged and the debt ends lower by more than the 5,000.
    expect(early.interestCharged).toBeLessThan(plain.interestCharged);
    expect(plain.balance - early.balance).toBeGreaterThan(5000);
  });

  it('applies a repayment dated before the loan was set up without accruing on it', () => {
    const ledger = accrueReducingBalance({
      openingBalance: 10000,
      anchorDate: '2026-01-31',
      annualRatePercent: 12,
      movements: [{ date: '2025-12-01', delta: -2000 }],
      todayIso: '2026-02-28',
    });
    // One rest on the 8,000 that was left: 8,000 x 1% = 80.
    expect(ledger.balance).toBeCloseTo(8080, 2);
  });

  it('stops charging interest once the loan is settled', () => {
    const ledger = accrueReducingBalance({
      openingBalance: 1000,
      anchorDate: '2026-01-31',
      annualRatePercent: 12,
      movements: [{ date: '2026-02-01', delta: -1000 }],
      todayIso: '2026-12-31',
    });
    expect(ledger.balance).toBe(0);
    expect(ledger.interestCharged).toBe(0);
  });
});

describe('computeLoanProgress: interest model', () => {
  const BASE = {
    balance: 20000,
    originalPrincipal: 30000,
    monthlyPayment: 899.11,
    paymentDay: 15,
    annualRatePercent: 5,
    termMonths: 36,
    totalRepayable: 32367.96,
    todayIso: '2026-06-01',
  };

  it('reads left to pay off the agreement on a flat contract', () => {
    const flat = computeLoanProgress({ ...BASE, interestModel: 'flat' });
    expect(flat.leftToPay).toBeCloseTo(BASE.totalRepayable - (flat.paidSoFar ?? 0), 2);
  });

  it('reads left to pay off the live projection on a reducing balance contract', () => {
    const reducing = computeLoanProgress({ ...BASE, interestModel: 'reducing' });
    expect(reducing.leftToPay).toBe(reducing.remainingWithInterest);
    expect(reducing.leftToPay).toBeGreaterThan(reducing.remaining);
  });

  it('defaults to the flat reading, so an upgraded loan is unchanged', () => {
    expect(computeLoanProgress(BASE).leftToPay).toBe(
      computeLoanProgress({ ...BASE, interestModel: 'flat' }).leftToPay,
    );
  });

  it('reports what paying ahead has saved once the charged interest is known', () => {
    // Well ahead of schedule: only 12,000 left where the schedule says 20,000,
    // and only 700 of interest charged so far.
    const p = computeLoanProgress({
      ...BASE,
      balance: 12000,
      interestModel: 'reducing',
      interestChargedToDate: 700,
    });
    expect(p.interestCharged).toBe(700);
    expect(p.interestSaved).toBeGreaterThan(0);
    expect(p.interestSaved).toBeCloseTo(
      BASE.totalRepayable - BASE.originalPrincipal - 700 - (p.estimatedInterestRemaining ?? 0),
      2,
    );
  });

  it('reports nothing saved without the charged figure', () => {
    expect(computeLoanProgress({ ...BASE, interestModel: 'reducing' }).interestSaved).toBeNull();
    expect(computeLoanProgress({ ...BASE, interestModel: 'reducing' }).interestCharged).toBeNull();
  });

  it('counts a settled loan as saving everything the contract did not charge', () => {
    const p = computeLoanProgress({
      ...BASE,
      balance: 0,
      interestModel: 'reducing',
      interestChargedToDate: 900,
    });
    expect(p.isPaidOff).toBe(true);
    expect(p.interestSaved).toBeCloseTo(BASE.totalRepayable - BASE.originalPrincipal - 900, 2);
  });
});

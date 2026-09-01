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
import { normalizeMoneyAmount } from '~/utils/formatters';

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

  it('refuses a total until a rate has been typed, under either model', () => {
    // Reading a missing rate as zero used to fill the form's total in with the
    // principal, offering a 0% contract nobody had described.
    expect(totalRepayableForModel('reducing', 300000, null, 360)).toBeNull();
    expect(totalRepayableForModel('flat', 300000, null, 360)).toBeNull();
    expect(totalRepayableForModel('reducing', 300000, Number.NaN, 360)).toBeNull();
    // A typed zero is a real interest-free contract and still gets a total.
    // Within the instalment rounding the file's slack already allows for: a
    // level payment of 833.33 over 360 months is 1.20 short of the principal,
    // which a lender's larger final payment absorbs.
    expect(totalRepayableForModel('reducing', 300000, 0, 360)).toBeCloseTo(300000, -1);
  });

  it('refuses a rate for a total that cannot repay the principal', () => {
    // An emptied total field parses as 0. The reducing branch used to answer
    // "0%", which reads as an interest-free loan rather than an unfinished form.
    expect(rateForModel('reducing', 300000, 0, 360)).toBeNull();
    expect(rateForModel('flat', 300000, 0, 360)).toBeNull();
    // A total that only just covers the principal is a real interest-free
    // contract, instalment rounding included, and still yields 0%.
    expect(rateForModel('reducing', 300000, 299998.8, 360)).toBe(0);
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

  it('reports nothing saved on a loan sitting exactly on its schedule', () => {
    // Ten years into a 30 year contract, paid to the letter. The old formula
    // compared against the contract's *lifetime* interest and greeted this
    // borrower with a five figure saving for doing nothing at all.
    const p = computeLoanProgress({
      balance: 236351.88,
      originalPrincipal: 300000,
      monthlyPayment: 1432.25,
      paymentDay: 15,
      annualRatePercent: 4,
      termMonths: 360,
      totalRepayable: 515610,
      interestModel: 'reducing',
      startDate: '2016-08-31',
      todayIso: '2026-08-31',
    });
    // Exactly zero, not merely small: both sides of the comparison run through
    // the same amortization, so instalment rounding cannot leak into it.
    expect(p.interestSaved).toBe(0);
  });

  it('reports a saving once the balance is genuinely ahead of the schedule', () => {
    const at = (balance: number) =>
      computeLoanProgress({
        balance,
        originalPrincipal: 300000,
        monthlyPayment: 1432.25,
        paymentDay: 15,
        annualRatePercent: 4,
        termMonths: 360,
        totalRepayable: 515610,
        interestModel: 'reducing',
        startDate: '2016-08-31',
        todayIso: '2026-08-31',
      });
    // 50,000 knocked off the principal ten years in. The saving is the interest
    // that 50,000 would have gone on accruing for the twenty years left, so it
    // is large, but nothing like the whole contract's interest.
    const saved = at(186351.88).interestSaved!;
    expect(saved).toBeGreaterThan(20000);
    expect(saved).toBeLessThan(60000);
    // And it grows with how far ahead the borrower is.
    expect(saved).toBeGreaterThan(at(216351.88).interestSaved!);
  });

  it('reports nothing saved on a borrower who is behind, rather than a negative', () => {
    const p = computeLoanProgress({
      balance: 260000,
      originalPrincipal: 300000,
      monthlyPayment: 1432.25,
      paymentDay: 15,
      annualRatePercent: 4,
      termMonths: 360,
      totalRepayable: 515610,
      interestModel: 'reducing',
      startDate: '2016-08-31',
      todayIso: '2026-08-31',
    });
    expect(p.interestSaved).toBe(0);
  });

  it('reports nothing on a flat contract, where paying ahead saves no interest', () => {
    expect(
      computeLoanProgress({ ...BASE, interestModel: 'flat', startDate: '2024-06-15' })
        .interestSaved,
    ).toBeNull();
  });

  it('reports nothing without a start date to place the loan in its schedule', () => {
    expect(computeLoanProgress({ ...BASE, interestModel: 'reducing' }).interestSaved).toBeNull();
  });

  it("counts a loan settled early as saving the schedule's remaining interest", () => {
    const p = computeLoanProgress({
      balance: 0,
      originalPrincipal: 300000,
      monthlyPayment: 1432.25,
      paymentDay: 15,
      annualRatePercent: 4,
      termMonths: 360,
      totalRepayable: 515610,
      interestModel: 'reducing',
      startDate: '2016-08-31',
      todayIso: '2026-08-31',
    });
    expect(p.isPaidOff).toBe(true);
    // Everything the remaining 240 instalments would have charged: the cash
    // they represent, less the principal they had to clear. Within a unit or
    // two, since the instalment is rounded to cents.
    expect(p.interestSaved).toBeCloseTo(1432.25 * 240 - 236351.88, -1);
  });

  it('counts a loan that ran its full term as saving nothing', () => {
    const p = computeLoanProgress({
      balance: 0,
      originalPrincipal: 300000,
      monthlyPayment: 1432.25,
      paymentDay: 15,
      annualRatePercent: 4,
      termMonths: 360,
      totalRepayable: 515610,
      interestModel: 'reducing',
      startDate: '1996-08-31',
      todayIso: '2026-08-31',
    });
    expect(p.interestSaved).toBe(0);
  });
});

describe('a reducing balance loan, end to end', () => {
  // A Malaysian house loan: RM500,000 over 30 years at 4.2% on the reducing
  // balance, taken out and tracked from day one.
  const PRINCIPAL = 500000;
  const TERM = 360;
  const RATE = 4.2;
  const START = '2026-01-15';
  const INSTALMENT = instalmentForContract(PRINCIPAL, RATE, TERM)!;
  const DATES = monthlyDayKeys(START, TERM);

  /** The ledger and progress after `months` instalments, paying `extra` once. */
  function after(months: number, extra?: { atMonth: number; amount: number }) {
    const movements: LoanLedgerMovement[] = DATES.slice(0, months).map((date) => ({
      date,
      delta: -INSTALMENT,
    }));
    if (extra) movements.push({ date: DATES[extra.atMonth - 1]!, delta: -extra.amount });
    const todayIso = DATES[months - 1]!;
    const ledger = accrueReducingBalance({
      openingBalance: PRINCIPAL,
      anchorDate: START,
      annualRatePercent: RATE,
      movements,
      todayIso,
    });
    return {
      ledger,
      progress: computeLoanProgress({
        balance: ledger.balance,
        originalPrincipal: PRINCIPAL,
        monthlyPayment: INSTALMENT,
        paymentDay: 15,
        annualRatePercent: RATE,
        termMonths: TERM,
        totalRepayable: normalizeMoneyAmount(INSTALMENT * TERM),
        interestModel: 'reducing',
        startDate: START,
        todayIso,
      }),
    };
  }

  it('tracks the contract schedule after a year of instalments', () => {
    const { ledger, progress } = after(12);
    // Only a fraction of the principal comes off in year one, which is the
    // thing about a mortgage that surprises people: of the 29,341 handed over,
    // 20,838 went on interest and 8,504 on the debt itself.
    expect(ledger.balance).toBeCloseTo(491496.49, 2);
    expect(ledger.interestCharged).toBeCloseTo(20837.57, 2);
    expect(PRINCIPAL - ledger.balance).toBeCloseTo(8503.51, 2);
    expect(progress.instalmentsPaid).toBe(12);
    expect(progress.paymentsRemaining).toBe(TERM - 12);
    expect(progress.isPaidOff).toBe(false);
    // On schedule. Not exactly zero, because paying the cent-rounded 2,445.09
    // instead of the exact annuity payment really does put the borrower a
    // fraction ahead, but far below the whole unit the card needs to show it.
    expect(progress.interestSaved!).toBeLessThan(1);
  });

  it('shows a 50k overpayment as a shorter loan and real interest saved', () => {
    const plain = after(12);
    const early = after(12, { atMonth: 6, amount: 50000 });

    expect(early.ledger.balance).toBeLessThan(plain.ledger.balance - 50000);
    expect(early.ledger.interestCharged).toBeLessThan(plain.ledger.interestCharged);
    // Years come off the term, and the saving is the interest that 50,000
    // would have gone on accruing for the rest of it.
    expect(early.progress.paymentsRemaining!).toBeLessThan(plain.progress.paymentsRemaining! - 60);
    expect(early.progress.interestSaved!).toBeGreaterThan(50000);
    expect(early.progress.leftToPay).toBeLessThan(plain.progress.leftToPay);
  });

  it('reports left to pay as the balance plus the interest still to come', () => {
    const { progress } = after(12);
    expect(progress.leftToPay).toBeCloseTo(
      progress.remaining + progress.estimatedInterestRemaining!,
      2,
    );
    // And is well under the flat reading of the same contract, which would
    // hold the agreement's whole total against it.
    expect(progress.leftToPay).toBeLessThan(INSTALMENT * TERM);
  });

  it('settles on the final instalment and celebrates once', () => {
    const { ledger, progress } = after(TERM);
    expect(Math.abs(ledger.balance)).toBeLessThan(10);
    expect(progress.isPaidOff).toBe(true);
    expect(progress.leftToPay).toBe(0);
    // Ran its full term, so nothing was saved.
    expect(progress.interestSaved).toBe(0);
  });
});

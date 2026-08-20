import {
  computeLoanProgress,
  computeLoanQuote,
  instalmentForContract,
  isContractTrackingRule,
  type LoanMathInput,
  type LoanQuoteInput,
  MAX_LOAN_TERM_MONTHS,
  overdueSince,
  rateForInstalment,
  rateForTotalRepayable,
  totalRepayableFor,
} from '~/features/loans/lib/loanMath';

const BASE: LoanMathInput = {
  balance: 42180,
  originalPrincipal: 80000,
  monthlyPayment: 1250,
  paymentDay: 15,
  annualRatePercent: null,
  todayIso: '2026-03-01',
};

function loan(overrides: Partial<LoanMathInput> = {}) {
  return computeLoanProgress({ ...BASE, ...overrides });
}

describe('computeLoanProgress: progress', () => {
  it('splits the principal into paid and remaining', () => {
    const p = loan();
    expect(p.remaining).toBe(42180);
    expect(p.principal).toBe(80000);
    expect(p.paid).toBe(37820);
    expect(p.paidRatio).toBeCloseTo(0.47275, 5);
  });

  it('floors an overpaid loan at zero rather than reporting a negative debt', () => {
    const p = loan({ balance: -120 });
    expect(p.remaining).toBe(0);
    expect(p.paid).toBe(80000);
    expect(p.paidRatio).toBe(1);
    expect(p.isPaidOff).toBe(true);
  });

  it('clamps paidRatio when the balance exceeds the original principal', () => {
    // Interest charges can push the balance above what was borrowed.
    const p = loan({ balance: 90000 });
    expect(p.paid).toBe(0);
    expect(p.paidRatio).toBe(0);
    expect(p.isPaidOff).toBe(false);
  });

  it('treats a non-positive principal as fully progressed rather than dividing by zero', () => {
    const p = loan({ originalPrincipal: 0 });
    expect(Number.isFinite(p.paidRatio)).toBe(true);
    expect(p.paidRatio).toBe(1);
  });

  it('reports a settled loan that was drawn down again as owing money', () => {
    // The payoff stamp only gates the one-shot celebration; it must never
    // freeze the card into "Paid off" while a balance is outstanding.
    const p = loan({ balance: 500 });
    expect(p.isPaidOff).toBe(false);
    expect(p.remaining).toBe(500);
  });

  it('treats a sub-cent residue as paid off', () => {
    expect(loan({ balance: 0.004 }).isPaidOff).toBe(true);
    expect(loan({ balance: 0.02 }).isPaidOff).toBe(false);
  });
});

describe('computeLoanProgress: projection without interest', () => {
  it('divides the balance by the repayment', () => {
    const p = loan({ balance: 12500, annualRatePercent: null });
    expect(p.paymentsRemaining).toBe(10);
    expect(p.paymentCoversInterest).toBe(true);
    expect(p.estimatedInterestRemaining).toBeNull();
  });

  it('rounds a partial final payment up to a whole payment', () => {
    expect(loan({ balance: 12501 }).paymentsRemaining).toBe(11);
  });

  it('treats a zero rate exactly like no rate', () => {
    expect(loan({ balance: 12500, annualRatePercent: 0 }).paymentsRemaining).toBe(10);
  });
});

describe('computeLoanProgress: projection with interest', () => {
  it('amortizes with the standard formula', () => {
    // 10000 at 12% APR (1%/month) paying 1000: n = -ln(1 - 0.01*10000/1000)/ln(1.01)
    const p = loan({
      balance: 10000,
      originalPrincipal: 10000,
      monthlyPayment: 1000,
      annualRatePercent: 12,
    });
    expect(p.paymentsRemaining).toBe(11); // 10.59 rounded up
    expect(p.paymentCoversInterest).toBe(true);
    // Interest = payments * amount - principal, using the fractional term.
    expect(p.estimatedInterestRemaining).toBeCloseTo(588.64, 1);
  });

  it('takes more payments with interest than without', () => {
    const withRate = loan({ balance: 10000, monthlyPayment: 1000, annualRatePercent: 12 });
    const without = loan({ balance: 10000, monthlyPayment: 1000, annualRatePercent: null });
    expect(withRate.paymentsRemaining!).toBeGreaterThan(without.paymentsRemaining!);
  });

  it('flags a repayment that does not cover the monthly interest', () => {
    // 10000 at 12% APR accrues 100/month; paying 80 never amortizes.
    const p = loan({ balance: 10000, monthlyPayment: 80, annualRatePercent: 12 });
    expect(p.paymentCoversInterest).toBe(false);
    expect(p.paymentsRemaining).toBeNull();
    expect(p.projectedPayoffDate).toBeNull();
    expect(p.estimatedInterestRemaining).toBeNull();
  });

  it('flags a repayment exactly equal to the monthly interest (the divide-by-zero boundary)', () => {
    const p = loan({ balance: 10000, monthlyPayment: 100, annualRatePercent: 12 });
    expect(p.paymentCoversInterest).toBe(false);
    expect(p.paymentsRemaining).toBeNull();
  });
});

describe('computeLoanProgress: degenerate inputs', () => {
  it('returns no projection without a repayment amount', () => {
    const p = loan({ monthlyPayment: 0 });
    expect(p.paymentsRemaining).toBeNull();
    expect(p.projectedPayoffDate).toBeNull();
    // No payment means nothing to compare against interest; not a warning.
    expect(p.paymentCoversInterest).toBe(true);
  });

  it('returns no projection for a paid-off loan', () => {
    const p = loan({ balance: 0 });
    expect(p.paymentsRemaining).toBe(0);
    expect(p.projectedPayoffDate).toBeNull();
    expect(p.nextDueDate).toBeNull();
  });

  it('survives a negative rate without producing NaN', () => {
    const p = loan({ balance: 1000, annualRatePercent: -5 });
    expect(p.paymentsRemaining).not.toBeNaN();
  });
});

describe('computeLoanProgress: dates', () => {
  it('finds the next due date later in the same month', () => {
    expect(loan({ todayIso: '2026-03-01' }).nextDueDate).toBe('2026-03-15');
  });

  it('rolls to next month once the due day has passed', () => {
    expect(loan({ todayIso: '2026-03-15' }).nextDueDate).toBe('2026-04-15');
    expect(loan({ todayIso: '2026-03-20' }).nextDueDate).toBe('2026-04-15');
  });

  it('clamps a day-31 payment day into short months', () => {
    expect(loan({ paymentDay: 31, todayIso: '2026-02-01' }).nextDueDate).toBe('2026-02-28');
  });

  it('returns no dates without a payment day', () => {
    const p = loan({ paymentDay: null });
    expect(p.nextDueDate).toBeNull();
    expect(p.projectedPayoffDate).toBeNull();
  });

  it('projects the payoff as the last scheduled payment', () => {
    // 10 payments left, next due 2026-03-15 -> final payment 2026-12-15.
    expect(loan({ balance: 12500, todayIso: '2026-03-01' }).projectedPayoffDate).toBe('2026-12-15');
  });

  it('clamps the projected payoff day in a short target month', () => {
    // 1 payment left, next due 2026-01-31 -> the payoff is that same payment.
    const p = loan({ balance: 1250, paymentDay: 31, todayIso: '2026-01-01' });
    expect(p.paymentsRemaining).toBe(1);
    expect(p.projectedPayoffDate).toBe('2026-01-31');
  });
});

describe('overdueSince', () => {
  const account = { id: 'loan-1', loanPaymentDay: 15, loanStartDate: '2025-01-15' };
  const paymentOn = (date: string) => ({
    type: 'transfer' as const,
    amount: 1250,
    date,
    toAccountId: 'loan-1',
    fromAccountId: 'bank-1',
  });

  it('reports the due date that was missed, not the next one', () => {
    // The chip reads "Overdue since ...", so this must be in the past.
    expect(
      overdueSince(
        account,
        [paymentOn('2026-02-15T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe('2026-03-15');
  });

  it('is clear once a repayment lands in the current cycle', () => {
    expect(
      overdueSince(
        account,
        [paymentOn('2026-03-16T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('is clear between due dates when the last cycle was paid', () => {
    expect(
      overdueSince(
        account,
        [paymentOn('2026-02-15T00:00:00.000Z')],
        new Date('2026-03-10T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('flags a cycle missed earlier, not only the current one', () => {
    // Mid-March with nothing since January: February went unpaid and should
    // not stay silent until the March due date arrives.
    expect(
      overdueSince(
        account,
        [paymentOn('2026-01-15T00:00:00.000Z')],
        new Date('2026-03-10T12:00:00Z'),
      ),
    ).toBe('2026-02-15');
  });

  it('counts a repayment made exactly on the due day', () => {
    expect(
      overdueSince(
        account,
        [paymentOn('2026-03-15T09:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('counts a repayment made a few days early, within the grace window', () => {
    expect(
      overdueSince(
        account,
        [paymentOn('2026-03-10T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('does not count a repayment older than the grace window', () => {
    expect(
      overdueSince(
        account,
        [paymentOn('2026-03-01T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe('2026-03-15');
  });

  it('ignores spending on the loan account, which is not a repayment', () => {
    const interestCharge = {
      type: 'expense' as const,
      amount: 150,
      date: '2026-03-18T00:00:00.000Z',
      accountId: 'loan-1',
    };
    expect(overdueSince(account, [interestCharge], new Date('2026-03-20T12:00:00Z'))).toBe(
      '2026-03-15',
    );
  });

  it('ignores transfers out of the loan account (a drawdown)', () => {
    const drawdown = {
      type: 'transfer' as const,
      amount: 500,
      date: '2026-03-18T00:00:00.000Z',
      fromAccountId: 'loan-1',
      toAccountId: 'bank-1',
    };
    expect(overdueSince(account, [drawdown], new Date('2026-03-20T12:00:00Z'))).toBe('2026-03-15');
  });

  it('is never overdue without a payment day', () => {
    expect(
      overdueSince({ id: 'loan-1', loanPaymentDay: null }, [], new Date('2026-03-20T12:00:00Z')),
    ).toBeNull();
  });

  it('is clear before the first instalment of a freshly started loan', () => {
    // Taken out on the 5th and added on the 20th: the first instalment is not
    // due until a month after disbursement, so nothing is late yet.
    const fresh = { id: 'loan-1', loanPaymentDay: 5, loanStartDate: '2026-03-05' };
    expect(overdueSince(fresh, [], new Date('2026-03-20T12:00:00Z'))).toBeNull();
  });

  it('starts flagging once the first instalment has passed unpaid', () => {
    const fresh = { id: 'loan-1', loanPaymentDay: 5, loanStartDate: '2026-03-05' };
    expect(overdueSince(fresh, [], new Date('2026-04-20T12:00:00Z'))).toBe('2026-04-05');
  });

  it('does not judge cycles that closed before the loan was added', () => {
    // Entered half-way through its life: the earlier instalments were paid to
    // the lender, the app just never saw them.
    const midLife = {
      id: 'loan-1',
      loanPaymentDay: 15,
      loanStartDate: '2024-01-15',
      createdAt: '2026-03-18T00:00:00.000Z',
    };
    expect(overdueSince(midLife, [], new Date('2026-03-20T12:00:00Z'))).toBeNull();
  });

  it('starts judging the first cycle that closes after the loan was added', () => {
    const midLife = {
      id: 'loan-1',
      loanPaymentDay: 15,
      loanStartDate: '2024-01-15',
      createdAt: '2026-03-18T00:00:00.000Z',
    };
    expect(overdueSince(midLife, [], new Date('2026-04-20T12:00:00Z'))).toBe('2026-04-15');
  });

  it('falls back to the payment day alone when no start date is recorded', () => {
    const untimed = { id: 'loan-1', loanPaymentDay: 15 };
    expect(overdueSince(untimed, [], new Date('2026-03-20T12:00:00Z'))).toBe('2026-03-15');
  });
});

describe('computeLoanQuote', () => {
  const BASE_QUOTE: LoanQuoteInput = {
    principal: 100000,
    annualRatePercent: 4.5,
    termMonths: 60,
    paidPeriods: 0,
    startDate: '2026-01-15',
  };

  const quote = (overrides: Partial<LoanQuoteInput> = {}) =>
    computeLoanQuote({ ...BASE_QUOTE, ...overrides });

  it('derives the monthly instalment from the contract', () => {
    // 100000 at 4.5% p.a. over 60 months amortizes to 1864.30/month.
    expect(quote()!.instalment).toBeCloseTo(1864.3, 2);
  });

  it('divides evenly at a zero rate', () => {
    expect(quote({ principal: 12000, annualRatePercent: 0, termMonths: 24 })!.instalment).toBe(500);
    expect(quote({ principal: 12000, annualRatePercent: null, termMonths: 24 })!.instalment).toBe(
      500,
    );
  });

  it('totals the interest over the full term', () => {
    // From the instalment as it is charged, to the cent: 1864.30 x 60 - 100000.
    expect(quote()!.totalInterest).toBeCloseTo(11858, 2);
  });

  it('opens at the full principal when nothing has been repaid', () => {
    expect(quote({ paidPeriods: 0 })!.openingBalance).toBeCloseTo(100000, 2);
  });

  it('amortizes the opening balance for a loan taken out mid-term', () => {
    expect(quote({ paidPeriods: 12 })!.openingBalance).toBeCloseTo(81755.13, 1);
    expect(quote({ paidPeriods: 24 })!.openingBalance).toBeCloseTo(62672.09, 1);
  });

  it('reduces the opening balance linearly at a zero rate', () => {
    const p = quote({ principal: 12000, annualRatePercent: 0, termMonths: 24, paidPeriods: 6 });
    expect(p!.openingBalance).toBe(9000);
  });

  it('counts the periods still to run', () => {
    expect(quote({ paidPeriods: 0 })!.remainingPeriods).toBe(60);
    expect(quote({ paidPeriods: 24 })!.remainingPeriods).toBe(36);
  });

  it('takes the payment day from the start date', () => {
    expect(quote({ startDate: '2026-01-15' })!.paymentDay).toBe(15);
    expect(quote({ startDate: '2026-03-01' })!.paymentDay).toBe(1);
  });

  it('ends the loan one full term after the start date', () => {
    expect(quote({ startDate: '2026-01-15', termMonths: 60 })!.payoffDate).toBe('2031-01-15');
  });

  it('clamps a payoff date that lands in a short month', () => {
    expect(quote({ startDate: '2026-01-31', termMonths: 1 })!.payoffDate).toBe('2026-02-28');
  });

  it('schedules the first instalment one month after the start date', () => {
    expect(quote({ paidPeriods: 0 })!.firstInstalmentDate).toBe('2026-02-15');
  });

  it('schedules the next instalment after the periods already paid', () => {
    expect(quote({ paidPeriods: 12 })!.firstInstalmentDate).toBe('2027-02-15');
  });

  it('is null when the contract is incomplete', () => {
    expect(quote({ principal: 0 })).toBeNull();
    expect(quote({ termMonths: 0 })).toBeNull();
    expect(quote({ principal: Number.NaN })).toBeNull();
  });

  it('is null when the periods already paid cover the whole term', () => {
    expect(quote({ paidPeriods: 60 })).toBeNull();
    expect(quote({ paidPeriods: 61 })).toBeNull();
  });

  it('rejects a term beyond the supported maximum', () => {
    expect(quote({ termMonths: MAX_LOAN_TERM_MONTHS })).not.toBeNull();
    expect(quote({ termMonths: MAX_LOAN_TERM_MONTHS + 1 })).toBeNull();
  });

  it('ignores a negative rate rather than producing a nonsense instalment', () => {
    const p = quote({ principal: 12000, annualRatePercent: -5, termMonths: 24 });
    expect(p!.instalment).toBe(500);
  });
});

describe('computeLoanQuote: a typed instalment', () => {
  const QUOTE: LoanQuoteInput = {
    // The contract that exposed the round-trip: 133,920 over 60 months is a
    // 2,232.00 instalment, but the rate it implies (4.4053%) shows as 4.41,
    // and re-deriving the payment from that rounded rate gives 2,232.25.
    principal: 120000,
    annualRatePercent: 4.41,
    termMonths: 60,
    paidPeriods: 0,
    startDate: '2026-09-01',
  };

  const quote = (overrides: Partial<LoanQuoteInput> = {}) =>
    computeLoanQuote({ ...QUOTE, ...overrides });

  it('is used exactly, rather than re-derived from the rounded rate', () => {
    expect(quote()!.instalment).toBeCloseTo(2232.25, 2);
    expect(quote({ instalment: 2232 })!.instalment).toBe(2232);
  });

  it('makes the total repayable land on the figure the lender quoted', () => {
    const q = quote({ instalment: 2232 })!;
    expect(q.instalment * 60).toBe(133920);
    expect(q.totalInterest).toBe(13920);
  });

  it('amortizes a mid-term opening balance at the rate the instalment implies', () => {
    // Solved from 2,232 rather than from 4.41, so a borrower who is a year in
    // starts at what they actually owe.
    expect(quote({ instalment: 2232, paidPeriods: 12 })!.openingBalance).toBeCloseTo(98062.97, 1);
  });

  it('falls back to the rate when no instalment is given', () => {
    expect(quote({ instalment: null })!.instalment).toBeCloseTo(2232.25, 2);
    expect(quote({ instalment: 0 })!.instalment).toBeCloseTo(2232.25, 2);
  });

  it('rejects an instalment too small to clear the principal in the term', () => {
    expect(quote({ instalment: 1500 })).toBeNull();
    expect(quote({ instalment: 120000 / 60 - 1 })).toBeNull();
  });

  it('accepts an interest-free instalment the lender rounded down', () => {
    // 10,000 over 12 at 833.33 leaves four cents for the final payment; that is
    // the lender's rounding, not a contract that never repays.
    const q = computeLoanQuote({
      principal: 10000,
      annualRatePercent: null,
      termMonths: 12,
      paidPeriods: 0,
      startDate: '2026-09-01',
      instalment: 833.33,
    });
    expect(q!.instalment).toBe(833.33);
    expect(q!.totalInterest).toBe(0);
  });
});

describe('isContractTrackingRule', () => {
  const rule = (overrides: Record<string, unknown> = {}) => ({
    isActive: true,
    type: 'transfer',
    toAccountId: 'loan-1',
    toAmount: null,
    amount: 1864.3,
    ...overrides,
  });

  it('matches the rule the contract set up', () => {
    expect(isContractTrackingRule(rule(), 'loan-1', 1864.3)).toBe(true);
  });

  it('tolerates a sub-cent difference', () => {
    expect(isContractTrackingRule(rule({ amount: 1864.302 }), 'loan-1', 1864.3)).toBe(true);
  });

  it('leaves a rule the user has taken over alone', () => {
    // Overpaying by 135.70 a month is the user's decision, not stale data.
    expect(isContractTrackingRule(rule({ amount: 2000 }), 'loan-1', 1864.3)).toBe(false);
  });

  it('leaves cross-currency rules to the recurring editor', () => {
    // amount is in the source currency here, so rewriting it would change
    // what actually lands on the loan.
    expect(isContractTrackingRule(rule({ toAmount: 1864.3 }), 'loan-1', 1864.3)).toBe(false);
  });

  it('ignores inactive rules, other accounts and non-transfers', () => {
    expect(isContractTrackingRule(rule({ isActive: false }), 'loan-1', 1864.3)).toBe(false);
    expect(isContractTrackingRule(rule({ toAccountId: 'other' }), 'loan-1', 1864.3)).toBe(false);
    expect(isContractTrackingRule(rule({ type: 'expense' }), 'loan-1', 1864.3)).toBe(false);
  });
});

describe('totalRepayableFor', () => {
  it('multiplies the instalment across the full term', () => {
    // The instalment is charged in whole cents, so the total is a multiple of
    // it rather than of the unrounded annuity payment.
    expect(totalRepayableFor(100000, 4.5, 60)).toBe(111858);
    expect(instalmentForContract(100000, 4.5, 60)).toBe(1864.3);
  });

  it('equals the principal when the loan is interest-free', () => {
    expect(totalRepayableFor(12000, 0, 24)).toBe(12000);
    expect(totalRepayableFor(12000, null, 24)).toBe(12000);
  });

  it('is null when the contract cannot produce one', () => {
    expect(totalRepayableFor(0, 4.5, 60)).toBeNull();
    expect(totalRepayableFor(100000, 4.5, 0)).toBeNull();
    expect(totalRepayableFor(100000, 4.5, MAX_LOAN_TERM_MONTHS + 1)).toBeNull();
  });
});

describe('rateForTotalRepayable', () => {
  it('recovers the rate that produced a total', () => {
    expect(rateForTotalRepayable(100000, 111858.12, 60)).toBeCloseTo(4.5, 2);
  });

  it('round-trips across a range of rates', () => {
    for (const apr of [0.5, 3, 7.25, 18, 36]) {
      const total = totalRepayableFor(250000, apr, 120)!;
      expect(rateForTotalRepayable(250000, total, 120)).toBeCloseTo(apr, 2);
    }
  });

  it('reads a total equal to the principal as interest-free', () => {
    expect(rateForTotalRepayable(12000, 12000, 24)).toBe(0);
  });

  it('floors at zero rather than inventing a negative rate', () => {
    // Repaying less than was borrowed is not a rate this can express.
    expect(rateForTotalRepayable(12000, 9000, 24)).toBe(0);
  });

  it('is null when the contract cannot produce one', () => {
    expect(rateForTotalRepayable(0, 1000, 60)).toBeNull();
    expect(rateForTotalRepayable(100000, 111858, 0)).toBeNull();
  });

  it('is null for a total beyond any representable rate', () => {
    expect(rateForTotalRepayable(1000, 10_000_000_000, 12)).toBeNull();
  });

  it('recovers the same rate from an instalment as from the total it implies', () => {
    expect(rateForInstalment(100000, 111858 / 60, 60)).toBe(
      rateForTotalRepayable(100000, 111858, 60),
    );
  });

  it('agrees with the quote it implies, to the precision the rate is shown at', () => {
    // The recovered rate is rounded to the two decimals the field displays, so
    // the implied total lands near the typed one rather than exactly on it.
    // Anything wider than this would mean the solver, not the display, is off.
    const apr = rateForTotalRepayable(80000, 96000, 72)!;
    const quote = computeLoanQuote({
      principal: 80000,
      annualRatePercent: apr,
      termMonths: 72,
      paidPeriods: 0,
      startDate: '2026-01-15',
    })!;
    const impliedTotal = quote.instalment * 72;
    expect(Math.abs(impliedTotal - 96000) / 96000).toBeLessThan(0.0005);
  });
});

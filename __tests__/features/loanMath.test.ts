import {
  computeLoanProgress,
  isRepaymentOverdue,
  type LoanMathInput,
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

describe('isRepaymentOverdue', () => {
  const account = { id: 'loan-1', loanPaymentDay: 15 };
  const paymentOn = (date: string) => ({
    type: 'transfer' as const,
    amount: 1250,
    date,
    toAccountId: 'loan-1',
    fromAccountId: 'bank-1',
  });

  it('is overdue when the due day has passed with no repayment since', () => {
    expect(
      isRepaymentOverdue(
        account,
        [paymentOn('2026-02-15T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(true);
  });

  it('is not overdue once a repayment lands in the current cycle', () => {
    expect(
      isRepaymentOverdue(
        account,
        [paymentOn('2026-03-16T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(false);
  });

  it('is not overdue before the due day comes round', () => {
    expect(isRepaymentOverdue(account, [], new Date('2026-03-10T12:00:00Z'))).toBe(false);
  });

  it('counts a repayment made exactly on the due day', () => {
    expect(
      isRepaymentOverdue(
        account,
        [paymentOn('2026-03-15T09:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(false);
  });

  it('ignores spending on the loan account, which is not a repayment', () => {
    const interestCharge = {
      type: 'expense' as const,
      amount: 150,
      date: '2026-03-18T00:00:00.000Z',
      accountId: 'loan-1',
    };
    expect(isRepaymentOverdue(account, [interestCharge], new Date('2026-03-20T12:00:00Z'))).toBe(
      true,
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
    expect(isRepaymentOverdue(account, [drawdown], new Date('2026-03-20T12:00:00Z'))).toBe(true);
  });

  it('counts a repayment made a few days early, within the grace window', () => {
    // Due the 15th, paid the 10th: paying ahead must not raise a false alarm.
    expect(
      isRepaymentOverdue(
        account,
        [paymentOn('2026-03-10T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(false);
  });

  it('does not count a repayment older than the grace window', () => {
    // Due the 15th, last paid the 1st: that belongs to the previous cycle.
    expect(
      isRepaymentOverdue(
        account,
        [paymentOn('2026-03-01T00:00:00.000Z')],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(true);
  });

  it('is never overdue without a payment day', () => {
    expect(
      isRepaymentOverdue(
        { id: 'loan-1', loanPaymentDay: null },
        [],
        new Date('2026-03-20T12:00:00Z'),
      ),
    ).toBe(false);
  });
});

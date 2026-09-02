import {
  loanRateHistoryIsStale,
  pendingLoanRateChange,
  totalRepayableFor,
} from '~/features/loans/lib/loanMath';

const TODAY = '2026-09-02';

/** A reducing balance loan of 100,000 over 120 months at `rate`, as its row reads. */
function loan(rate: number, extra: Record<string, unknown> = {}) {
  return {
    type: 'loan',
    loanInterestModel: 'reducing' as const,
    loanOriginalPrincipal: 100000,
    loanTermMonths: 120,
    loanTotalRepayable: totalRepayableFor(100000, rate, 120),
    loanInterestRate: rate,
    createdAt: '2026-01-15T03:00:00.000Z',
    ...extra,
  };
}

/** The same contract as the editor would submit it at `rate`. */
function saveAt(rate: number | null, model: 'reducing' | 'flat' = 'reducing') {
  return {
    loanInterestModel: model,
    loanOriginalPrincipal: 100000,
    loanTermMonths: 120,
    loanTotalRepayable: rate == null ? null : totalRepayableFor(100000, rate, 120),
    loanInterestRate: rate,
  };
}

describe('pendingLoanRateChange', () => {
  it('asks when the rate moves on a loan with interest behind it', () => {
    const decision = pendingLoanRateChange(loan(4.2), saveAt(4.7), TODAY)!;
    expect(decision.previousRatePercent).toBeCloseTo(4.2, 2);
    expect(decision.nextRatePercent).toBeCloseTo(4.7, 2);
    // The old rate is pinned from the anchor, the new one from today.
    expect(decision.changes.map((c) => c.from)).toEqual(['2026-01-15', TODAY]);
    expect(decision.changes[0]!.annualRatePercent).toBeCloseTo(4.2, 2);
    expect(decision.changes[1]!.annualRatePercent).toBeCloseTo(4.7, 2);
  });

  it('says nothing when the rate is unchanged', () => {
    expect(pendingLoanRateChange(loan(4.2), saveAt(4.2), TODAY)).toBeNull();
  });

  it('says nothing on a loan set up today, where both answers are the same', () => {
    expect(
      pendingLoanRateChange(loan(4.2, { createdAt: `${TODAY}T08:00:00.000Z` }), saveAt(4.7), TODAY),
    ).toBeNull();
  });

  it('prefers the recorded anchor over the creation day', () => {
    const decision = pendingLoanRateChange(
      loan(4.2, { loanLedgerAnchorDate: '2025-12-20' }),
      saveAt(4.7),
      TODAY,
    )!;
    expect(decision.changes[0]!.from).toBe('2025-12-20');
  });

  it('never asks on a flat contract, whose rate is fixed at signing', () => {
    expect(
      pendingLoanRateChange(loan(4.2, { loanInterestModel: 'flat' }), saveAt(4.7), TODAY),
    ).toBeNull();
    expect(pendingLoanRateChange(loan(4.2), saveAt(4.7, 'flat'), TODAY)).toBeNull();
    expect(pendingLoanRateChange(loan(4.2, { type: 'credit' }), saveAt(4.7), TODAY)).toBeNull();
  });

  it('treats a loan going interest-free as a rate change to zero', () => {
    // Left unasked, the old history would go on charging a rate the field no
    // longer shows.
    const decision = pendingLoanRateChange(loan(4.2), saveAt(0), TODAY)!;
    expect(decision.nextRatePercent).toBe(0);
    expect(decision.changes[1]).toEqual({ from: TODAY, annualRatePercent: 0 });
    const emptied = pendingLoanRateChange(loan(4.2), saveAt(null), TODAY)!;
    expect(emptied.nextRatePercent).toBe(0);
  });

  it('treats an interest-free loan gaining a rate as a change from zero', () => {
    const decision = pendingLoanRateChange(loan(0), saveAt(3.5), TODAY)!;
    expect(decision.previousRatePercent).toBe(0);
    expect(decision.changes[0]).toEqual({ from: '2026-01-15', annualRatePercent: 0 });
  });

  it('appends to a history the loan already has', () => {
    const decision = pendingLoanRateChange(
      loan(4.7, {
        loanRateChanges: [
          { from: '2026-01-15', annualRatePercent: 4.2 },
          { from: '2026-06-01', annualRatePercent: 4.7 },
        ],
      }),
      saveAt(5.1),
      TODAY,
    )!;
    expect(decision.changes.map((c) => c.from)).toEqual(['2026-01-15', '2026-06-01', TODAY]);
  });

  it('replaces a change recorded earlier today rather than stacking two', () => {
    const decision = pendingLoanRateChange(
      loan(4.7, {
        loanRateChanges: [
          { from: '2026-01-15', annualRatePercent: 4.2 },
          { from: TODAY, annualRatePercent: 4.7 },
        ],
      }),
      saveAt(5.1),
      TODAY,
    )!;
    expect(decision.changes).toHaveLength(2);
    expect(decision.changes[1]!.annualRatePercent).toBeCloseTo(5.1, 2);
  });
});

describe('loanRateHistoryIsStale', () => {
  const withHistory = { loanRateChanges: [{ from: '2026-01-15', annualRatePercent: 4.2 }] };

  it('is stale once the loan is saved as anything but reducing balance', () => {
    expect(loanRateHistoryIsStale(withHistory, 'flat')).toBe(true);
    expect(loanRateHistoryIsStale(withHistory, 'reducing')).toBe(false);
  });

  it('is nothing to clear when there is no history', () => {
    expect(loanRateHistoryIsStale({ loanRateChanges: null }, 'flat')).toBe(false);
  });
});

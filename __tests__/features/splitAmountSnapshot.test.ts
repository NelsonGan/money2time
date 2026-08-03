import { rescaleSplitAdjustedAmounts } from '~/features/transactions/lib/splitAmountSnapshot';

describe('rescaleSplitAdjustedAmounts', () => {
  it('shrinks the reporting snapshot alongside the amount (same-currency bill)', () => {
    // The reported bug: a 500,000 MYR bill split evenly, then marked paid.
    const result = rescaleSplitAdjustedAmounts(
      { amount: 500000, reportingAmount: 500000, accountAmount: null },
      250000,
    );
    expect(result).toEqual({ amount: 250000, reportingAmount: 250000, accountAmount: null });
  });

  it('restores the reporting snapshot when a split is marked unpaid again', () => {
    const paid = rescaleSplitAdjustedAmounts(
      { amount: 500000, reportingAmount: 500000, accountAmount: null },
      250000,
    );
    const unpaid = rescaleSplitAdjustedAmounts(paid, paid.amount + 250000);
    expect(unpaid).toEqual({ amount: 500000, reportingAmount: 500000, accountAmount: null });
  });

  it('keeps the frozen fx rate rather than re-converting at a live rate', () => {
    // 100 EUR frozen at 5.0 MYR. Halving the bill must halve the snapshot using
    // the frozen ratio, never today's rate.
    const result = rescaleSplitAdjustedAmounts(
      { amount: 100, reportingAmount: 500, accountAmount: null },
      50,
    );
    expect(result.reportingAmount).toBe(250);
    expect(result.reportingAmount! / result.amount).toBe(5);
  });

  it('rescales the account-currency snapshot too', () => {
    const result = rescaleSplitAdjustedAmounts(
      { amount: 100, reportingAmount: 500, accountAmount: 480 },
      25,
    );
    expect(result).toEqual({ amount: 25, reportingAmount: 125, accountAmount: 120 });
  });

  it('leaves null snapshots null', () => {
    const result = rescaleSplitAdjustedAmounts(
      { amount: 80, reportingAmount: null, accountAmount: null },
      60,
    );
    expect(result).toEqual({ amount: 60, reportingAmount: null, accountAmount: null });
  });

  it('rounds to cents so repeated paybacks cannot accumulate float drift', () => {
    const result = rescaleSplitAdjustedAmounts(
      { amount: 100, reportingAmount: 100, accountAmount: null },
      33.33,
    );
    expect(result.amount).toBe(33.33);
    expect(result.reportingAmount).toBe(33.33);
  });

  it('holds the snapshot steady across a three-way payback round trip', () => {
    const start = { amount: 90, reportingAmount: 450, accountAmount: null };
    const afterFirst = rescaleSplitAdjustedAmounts(start, start.amount - 30);
    const afterSecond = rescaleSplitAdjustedAmounts(afterFirst, afterFirst.amount - 30);
    expect(afterSecond).toEqual({ amount: 30, reportingAmount: 150, accountAmount: null });
  });

  it('leaves the snapshot alone when the previous amount is zero (no ratio exists)', () => {
    const result = rescaleSplitAdjustedAmounts(
      { amount: 0, reportingAmount: 0, accountAmount: null },
      40,
    );
    expect(result).toEqual({ amount: 40, reportingAmount: 0, accountAmount: null });
  });
});

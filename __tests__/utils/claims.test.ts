import {
  claimStatusForReimbursedAmount,
  clampClaimAmount,
  clampReimbursementAmount,
  isOutstandingClaim,
  isReimbursementInflow,
  outstandingClaimAmount,
} from '~/utils/claims';

describe('claimStatusForReimbursedAmount', () => {
  it('is claimable when nothing is reimbursed', () => {
    expect(claimStatusForReimbursedAmount(100, 0)).toBe('claimable');
  });

  it('preserves submitted state on a zero rewind when flagged', () => {
    expect(claimStatusForReimbursedAmount(100, 0, true)).toBe('submitted');
  });

  it('is partially_reimbursed for an in-between amount', () => {
    expect(claimStatusForReimbursedAmount(100, 40)).toBe('partially_reimbursed');
  });

  it('is reimbursed at exactly the claim amount', () => {
    expect(claimStatusForReimbursedAmount(100, 100)).toBe('reimbursed');
  });

  it('treats sub-cent float noise as fully reimbursed', () => {
    expect(claimStatusForReimbursedAmount(100, 99.999)).toBe('reimbursed');
  });

  it('is none when there is no claim amount', () => {
    expect(claimStatusForReimbursedAmount(0, 0)).toBe('none');
  });
});

describe('outstandingClaimAmount', () => {
  it('returns the unreimbursed remainder', () => {
    expect(
      outstandingClaimAmount({
        claimStatus: 'partially_reimbursed',
        claimAmount: 70,
        reimbursedAmount: 50,
      }),
    ).toBe(20);
  });

  it('is zero for non-claimable rows', () => {
    expect(
      outstandingClaimAmount({ claimStatus: 'none', claimAmount: null, reimbursedAmount: 0 }),
    ).toBe(0);
  });

  it('never goes negative when over-reimbursed', () => {
    expect(
      outstandingClaimAmount({ claimStatus: 'reimbursed', claimAmount: 50, reimbursedAmount: 60 }),
    ).toBe(0);
  });
});

describe('isOutstandingClaim', () => {
  it('flags claimable, submitted and partial as outstanding', () => {
    expect(
      isOutstandingClaim({ claimStatus: 'claimable', claimAmount: 10, reimbursedAmount: 0 }),
    ).toBe(true);
    expect(
      isOutstandingClaim({ claimStatus: 'submitted', claimAmount: 10, reimbursedAmount: 0 }),
    ).toBe(true);
    expect(
      isOutstandingClaim({
        claimStatus: 'partially_reimbursed',
        claimAmount: 10,
        reimbursedAmount: 4,
      }),
    ).toBe(true);
  });

  it('does not flag reimbursed or none as outstanding', () => {
    expect(
      isOutstandingClaim({ claimStatus: 'reimbursed', claimAmount: 10, reimbursedAmount: 10 }),
    ).toBe(false);
    expect(
      isOutstandingClaim({ claimStatus: 'none', claimAmount: null, reimbursedAmount: 0 }),
    ).toBe(false);
  });
});

describe('isReimbursementInflow', () => {
  it('is true only when the back-pointer is set', () => {
    expect(isReimbursementInflow({ reimbursesTransactionId: 'tx1' })).toBe(true);
    expect(isReimbursementInflow({ reimbursesTransactionId: null })).toBe(false);
  });
});

describe('clampClaimAmount', () => {
  it('defaults to the full amount', () => {
    expect(clampClaimAmount(null, 80)).toBe(80);
    expect(clampClaimAmount(undefined, 80)).toBe(80);
  });

  it('caps a partial claim at the amount', () => {
    expect(clampClaimAmount(120, 80)).toBe(80);
  });

  it('keeps a valid partial claim', () => {
    expect(clampClaimAmount(50, 80)).toBe(50);
  });

  it('falls back to full amount for non-positive requests', () => {
    expect(clampClaimAmount(0, 80)).toBe(80);
    expect(clampClaimAmount(-5, 80)).toBe(80);
  });
});

describe('clampReimbursementAmount', () => {
  it('caps at the remaining outstanding', () => {
    // claim 100, already 60 → only 40 can be applied even if 90 requested
    expect(clampReimbursementAmount(90, 100, 60)).toBe(40);
  });

  it('applies the full requested amount when it fits', () => {
    expect(clampReimbursementAmount(30, 100, 60)).toBe(30);
  });

  it('never returns a negative amount', () => {
    expect(clampReimbursementAmount(-10, 100, 0)).toBe(0);
    expect(clampReimbursementAmount(10, 100, 100)).toBe(0);
  });
});

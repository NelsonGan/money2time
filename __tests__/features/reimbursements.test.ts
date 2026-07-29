import {
  aggregatePendingClaimsByPayer,
  aggregateReimbursedClaimsByPayer,
  applyReimbursement,
  clampClaimAmount,
  countPendingClaims,
  grossAmountForClaim,
  isClaimable,
  payerKey,
  recentPayerNames,
  revertReimbursement,
  UNASSIGNED_PAYER_KEY,
} from '~/features/transactions/lib/reimbursements';
import type { TransactionWithRelations } from '~/types';
import { adjustAmountWithReporting, NO_REIMBURSEMENT } from '~/utils/transactions';

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 't1',
    type: 'expense',
    amount: 100,
    currency: 'USD',
    reportingCurrency: 'USD',
    reportingAmount: 100,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    date: '2026-05-14',
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'c1',
    note: null,
    receiptUri: null,
    ...NO_REIMBURSEMENT,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

/** A pending claim for `amount` on an expense of `total`. */
function pending(overrides: Partial<TransactionWithRelations>, claim: number) {
  return makeTx({
    ...overrides,
    reimbursementStatus: 'pending',
    reimbursementAmount: claim,
    reimbursementClaimedAt: '2026-05-14T09:00:00.000Z',
  });
}

const USD = { reportingCurrency: 'USD' };

describe('isClaimable', () => {
  it('accepts a plain positive expense', () => {
    expect(isClaimable(makeTx({}))).toBe(true);
  });

  it('rejects income and transfers', () => {
    expect(isClaimable(makeTx({ type: 'income' }))).toBe(false);
    expect(isClaimable(makeTx({ type: 'transfer' }))).toBe(false);
  });

  it('rejects a zero-amount expense: there is nothing left to claim', () => {
    expect(isClaimable(makeTx({ amount: 0 }))).toBe(false);
  });

  it('rejects an already-reimbursed expense', () => {
    expect(isClaimable(makeTx({ amount: 50, reimbursementStatus: 'reimbursed' }))).toBe(false);
  });
});

describe('clampClaimAmount', () => {
  it('caps the claim at the transaction amount', () => {
    expect(clampClaimAmount(200, 100)).toBe(100);
  });

  it('leaves a partial claim alone', () => {
    expect(clampClaimAmount(60, 100)).toBe(60);
  });

  it('floors non-positive and non-finite input at zero', () => {
    expect(clampClaimAmount(0, 100)).toBe(0);
    expect(clampClaimAmount(-5, 100)).toBe(0);
    expect(clampClaimAmount(Number.NaN, 100)).toBe(0);
  });

  it('rounds to cents', () => {
    expect(clampClaimAmount(33.333, 100)).toBe(33.33);
  });
});

describe('applyReimbursement', () => {
  it('drives a full claim to exactly zero, in both currencies', () => {
    const tx = pending({ amount: 120, reportingAmount: 120 }, 120);
    expect(applyReimbursement(tx)).toEqual({ amount: 0, reportingAmount: 0 });
  });

  it('leaves the unclaimed remainder on a partial claim', () => {
    const tx = pending({ amount: 95, reportingAmount: 95 }, 60);
    expect(applyReimbursement(tx)).toEqual({ amount: 35, reportingAmount: 35 });
  });

  it('scales the reporting snapshot by the frozen fxRate, not a live one', () => {
    // 400 MYR at the rate frozen when it was written: 0.21 USD per MYR.
    const tx = pending(
      { amount: 400, currency: 'MYR', reportingCurrency: 'USD', reportingAmount: 84, fxRate: 0.21 },
      400,
    );
    expect(applyReimbursement(tx)).toEqual({ amount: 0, reportingAmount: 0 });
  });

  it('scales a partial foreign-currency claim proportionally', () => {
    const tx = pending(
      { amount: 400, currency: 'MYR', reportingCurrency: 'USD', reportingAmount: 84, fxRate: 0.21 },
      100,
    );
    expect(applyReimbursement(tx)).toEqual({ amount: 300, reportingAmount: 63 });
  });

  it('never drives the amount negative when the claim outruns the row', () => {
    // A split settled after the claim was attached, shrinking the transaction.
    const tx = pending({ amount: 40, reportingAmount: 40 }, 100);
    expect(applyReimbursement(tx)).toEqual({ amount: 0, reportingAmount: 0 });
  });

  it('is a no-op when there is no pending claim', () => {
    const tx = makeTx({ amount: 100, reportingAmount: 100 });
    expect(applyReimbursement(tx)).toEqual({ amount: 100, reportingAmount: 100 });
  });

  it('leaves a null reporting snapshot null', () => {
    const tx = pending(
      { amount: 100, reportingCurrency: null, reportingAmount: null, fxRate: null },
      100,
    );
    expect(applyReimbursement(tx)).toEqual({ amount: 0, reportingAmount: null });
  });
});

describe('revertReimbursement', () => {
  it('restores the exact prior amount pair', () => {
    const before = { amount: 120, reportingAmount: 120 };
    const cleared = makeTx({
      ...before,
      reimbursementStatus: 'pending',
      reimbursementAmount: 120,
    });
    const after = applyReimbursement(cleared);
    const reimbursed = makeTx({
      ...after,
      fxRate: 1,
      reimbursementStatus: 'reimbursed',
      reimbursementAmount: 120,
    });
    expect(revertReimbursement(reimbursed)).toEqual(before);
  });

  it('round-trips a foreign-currency partial claim', () => {
    const before = { amount: 400, reportingAmount: 84 };
    const cleared = applyReimbursement(
      makeTx({
        ...before,
        currency: 'MYR',
        reportingCurrency: 'USD',
        fxRate: 0.21,
        reimbursementStatus: 'pending',
        reimbursementAmount: 150,
      }),
    );
    const restored = revertReimbursement(
      makeTx({
        ...cleared,
        currency: 'MYR',
        reportingCurrency: 'USD',
        fxRate: 0.21,
        reimbursementStatus: 'reimbursed',
        reimbursementAmount: 150,
      }),
    );
    expect(restored).toEqual(before);
  });

  it('is a no-op on a claim that was never cleared', () => {
    const tx = pending({ amount: 100, reportingAmount: 100 }, 100);
    expect(revertReimbursement(tx)).toEqual({ amount: 100, reportingAmount: 100 });
  });
});

describe('grossAmountForClaim', () => {
  it('is the live amount while pending', () => {
    expect(grossAmountForClaim(pending({ amount: 95 }, 60))).toBe(95);
  });

  it('reconstructs the original total once cleared', () => {
    expect(
      grossAmountForClaim(
        makeTx({ amount: 0, reimbursementStatus: 'reimbursed', reimbursementAmount: 120 }),
      ),
    ).toBe(120);
  });
});

describe('payerKey', () => {
  it('folds case and whitespace so one payer is one group', () => {
    expect(payerKey('  Acme ')).toBe(payerKey('acme'));
  });

  it('collapses blank payers into the unassigned sentinel', () => {
    expect(payerKey(null)).toBe(UNASSIGNED_PAYER_KEY);
    expect(payerKey('   ')).toBe(UNASSIGNED_PAYER_KEY);
  });
});

describe('aggregatePendingClaimsByPayer', () => {
  it('groups by payer and totals in the reporting currency', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending({ id: 't1', reimbursementPayer: 'Acme' }, 100),
        pending({ id: 't2', reimbursementPayer: 'acme', date: '2026-05-20' }, 50),
        pending({ id: 't3', reimbursementPayer: 'BlueCross' }, 30),
      ],
      USD,
    );
    expect(summary.payerCount).toBe(2);
    expect(summary.claimCount).toBe(3);
    expect(summary.totalReporting).toBe(180);
    expect(summary.payers[0]?.name).toBe('acme');
    expect(summary.payers[0]?.totalReporting).toBe(150);
  });

  it('sorts most-owed first', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending({ id: 't1', reimbursementPayer: 'Small' }, 10),
        pending({ id: 't2', reimbursementPayer: 'Big' }, 900),
      ],
      USD,
    );
    expect(summary.payers.map((p) => p.name)).toEqual(['Big', 'Small']);
  });

  it('sinks the unassigned bucket on a tie', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending({ id: 't1', reimbursementPayer: null }, 50),
        pending({ id: 't2', reimbursementPayer: 'Acme' }, 50),
      ],
      USD,
    );
    expect(summary.payers[0]?.key).toBe(payerKey('Acme'));
    expect(summary.payers[1]?.key).toBe(UNASSIGNED_PAYER_KEY);
  });

  it('excludes cleared claims and unclaimed expenses', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending({ id: 't1', reimbursementPayer: 'Acme' }, 100),
        makeTx({ id: 't2' }),
        makeTx({
          id: 't3',
          reimbursementStatus: 'reimbursed',
          reimbursementAmount: 70,
          reimbursementPayer: 'Acme',
        }),
      ],
      USD,
    );
    expect(summary.claimCount).toBe(1);
    expect(summary.totalReporting).toBe(100);
  });

  it('converts foreign claims with the frozen rate and keeps native subtotals', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending(
          {
            id: 't1',
            reimbursementPayer: 'Acme',
            currency: 'MYR',
            reportingCurrency: 'USD',
            reportingAmount: 84,
            fxRate: 0.21,
          },
          400,
        ),
        pending({ id: 't2', reimbursementPayer: 'Acme' }, 16),
      ],
      USD,
    );
    expect(summary.totalReporting).toBe(100);
    expect(summary.payers[0]?.byCurrency).toEqual([
      { currency: 'MYR', amount: 400 },
      { currency: 'USD', amount: 16 },
    ]);
  });

  it('falls back to a live rate only when no snapshot is usable', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending(
          {
            reimbursementPayer: 'Acme',
            currency: 'EUR',
            reportingCurrency: null,
            reportingAmount: null,
            fxRate: null,
          },
          100,
        ),
      ],
      { reportingCurrency: 'USD', rateToReporting: () => 1.1 },
    );
    expect(summary.totalReporting).toBe(110);
  });

  it('counts the native amount rather than dropping a claim it cannot convert', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending(
          {
            reimbursementPayer: 'Acme',
            currency: 'EUR',
            reportingCurrency: null,
            reportingAmount: null,
            fxRate: null,
          },
          100,
        ),
      ],
      { reportingCurrency: 'USD', rateToReporting: () => null },
    );
    expect(summary.claimCount).toBe(1);
    expect(summary.totalReporting).toBe(100);
  });

  it('reports the oldest claim date per payer', () => {
    const summary = aggregatePendingClaimsByPayer(
      [
        pending({ id: 't1', reimbursementPayer: 'Acme', date: '2026-05-20' }, 10),
        pending({ id: 't2', reimbursementPayer: 'Acme', date: '2026-03-02' }, 10),
      ],
      USD,
    );
    expect(summary.payers[0]?.oldestDate).toBe('2026-03-02');
  });

  it('exposes the gross amount so a partial claim is identifiable', () => {
    const summary = aggregatePendingClaimsByPayer(
      [pending({ reimbursementPayer: 'Acme', amount: 95 }, 60)],
      USD,
    );
    const claim = summary.payers[0]?.claims[0];
    expect(claim?.amount).toBe(60);
    expect(claim?.grossAmount).toBe(95);
  });
});

describe('aggregateReimbursedClaimsByPayer', () => {
  it('picks up cleared claims and their pre-reimbursement totals', () => {
    const summary = aggregateReimbursedClaimsByPayer(
      [
        makeTx({
          id: 't1',
          amount: 0,
          reportingAmount: 0,
          reimbursementStatus: 'reimbursed',
          reimbursementAmount: 120,
          reimbursementPayer: 'Acme',
          reimbursedAt: '2026-06-01T00:00:00.000Z',
        }),
        pending({ id: 't2', reimbursementPayer: 'Acme' }, 40),
      ],
      USD,
    );
    expect(summary.claimCount).toBe(1);
    expect(summary.payers[0]?.claims[0]?.grossAmount).toBe(120);
    expect(summary.payers[0]?.claims[0]?.reimbursedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('countPendingClaims', () => {
  it('counts only live claims with a positive amount', () => {
    expect(
      countPendingClaims([
        pending({ id: 't1' }, 100),
        pending({ id: 't2' }, 0),
        makeTx({ id: 't3' }),
        makeTx({ id: 't4', reimbursementStatus: 'reimbursed', reimbursementAmount: 10 }),
      ]),
    ).toBe(1);
  });

  it('agrees with the full aggregation', () => {
    const txs = [
      pending({ id: 't1', reimbursementPayer: 'Acme' }, 10),
      pending({ id: 't2', reimbursementPayer: 'Acme' }, 20),
      pending({ id: 't3', reimbursementPayer: null }, 30),
    ];
    expect(countPendingClaims(txs)).toBe(aggregatePendingClaimsByPayer(txs, USD).claimCount);
  });
});

describe('recentPayerNames', () => {
  it('returns most recently used first, deduped case-insensitively', () => {
    expect(
      recentPayerNames([
        pending({ id: 't1', reimbursementPayer: 'acme', date: '2026-01-01' }, 10),
        pending({ id: 't2', reimbursementPayer: 'Acme', date: '2026-05-01' }, 10),
        pending({ id: 't3', reimbursementPayer: 'BlueCross', date: '2026-03-01' }, 10),
      ]),
    ).toEqual(['Acme', 'BlueCross']);
  });

  it('ignores expenses with no claim at all', () => {
    expect(recentPayerNames([makeTx({ reimbursementPayer: 'Ghost' })])).toEqual([]);
  });

  it('respects the limit', () => {
    const txs = Array.from({ length: 12 }, (_, i) =>
      pending({ id: `t${i}`, reimbursementPayer: `Payer ${i}` }, 10),
    );
    expect(recentPayerNames(txs, 3)).toHaveLength(3);
  });
});

describe('adjustAmountWithReporting', () => {
  it('scales proportionally when a legacy row has no frozen rate', () => {
    const result = adjustAmountWithReporting(
      { amount: 100, reportingAmount: 25, fxRate: null },
      -40,
    );
    expect(result).toEqual({ amount: 60, reportingAmount: 15 });
  });

  it('is the identity for a zero delta', () => {
    expect(
      adjustAmountWithReporting({ amount: 100, reportingAmount: 21, fxRate: 0.21 }, 0),
    ).toEqual({ amount: 100, reportingAmount: 21 });
  });
});

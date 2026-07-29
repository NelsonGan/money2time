import {
  type BulkTransactionSubject,
  buildBulkUpdateInputs,
} from '~/features/transactions/lib/bulkUpdates';

function expense(amount = 100, status: BulkTransactionSubject['reimbursementStatus'] = null) {
  return { type: 'expense' as const, amount, reimbursementStatus: status };
}

const SUBJECTS: Record<string, BulkTransactionSubject> = {
  e1: expense(100),
  e2: expense(60),
  income: { type: 'income', amount: 500, reimbursementStatus: null },
  transfer: { type: 'transfer', amount: 20, reimbursementStatus: null },
  pending: expense(80, 'pending'),
  cleared: expense(0, 'reimbursed'),
};

const resolve = (id: string) => SUBJECTS[id];

describe('buildBulkUpdateInputs: existing fields', () => {
  it('applies date and note to every selected row', () => {
    const updates = buildBulkUpdateInputs(
      ['e1', 'income'],
      { date: '2026-06-01', note: 'Trip' },
      resolve,
    );
    expect(updates).toEqual([
      { id: 'e1', input: { date: '2026-06-01', note: 'Trip' } },
      { id: 'income', input: { date: '2026-06-01', note: 'Trip' } },
    ]);
  });

  it('applies each category only to the matching transaction type', () => {
    const updates = buildBulkUpdateInputs(
      ['e1', 'income', 'transfer'],
      { expenseCategoryId: 'cx', incomeCategoryId: 'ci' },
      resolve,
    );
    expect(updates).toEqual([
      { id: 'e1', input: { categoryId: 'cx' } },
      { id: 'income', input: { categoryId: 'ci' } },
    ]);
  });

  it('emits nothing when there is nothing to change', () => {
    expect(buildBulkUpdateInputs(['e1'], {}, resolve)).toEqual([]);
  });
});

describe('buildBulkUpdateInputs: reimbursement claims', () => {
  it('claims each selected expense at its own full amount', () => {
    const updates = buildBulkUpdateInputs(['e1', 'e2'], { claimPayer: 'Acme' }, resolve);
    expect(updates.map((u) => u.input.reimbursementAmount)).toEqual([100, 60]);
    expect(updates.every((u) => u.input.reimbursementStatus === 'pending')).toBe(true);
    expect(updates.every((u) => u.input.reimbursementPayer === 'Acme')).toBe(true);
  });

  it('stamps claimedAt on a new claim', () => {
    const [update] = buildBulkUpdateInputs(['e1'], { claimPayer: 'Acme' }, resolve);
    expect(update?.input.reimbursementClaimedAt).toEqual(expect.any(String));
  });

  it('keeps the original claimedAt when re-claiming an already-pending row', () => {
    // Re-filing must not restart the "open N days" clock.
    const [update] = buildBulkUpdateInputs(['pending'], { claimPayer: 'Acme' }, resolve);
    expect(update?.input.reimbursementPayer).toBe('Acme');
    expect(update?.input.reimbursementClaimedAt).toBeUndefined();
  });

  it('skips an already-cleared claim rather than re-claiming it', () => {
    // Its amount is already written off; re-claiming would double-count.
    expect(buildBulkUpdateInputs(['cleared'], { claimPayer: 'Acme' }, resolve)).toEqual([]);
  });

  it('skips income and transfers', () => {
    expect(buildBulkUpdateInputs(['income', 'transfer'], { claimPayer: 'Acme' }, resolve)).toEqual(
      [],
    );
  });

  it('allows an unassigned payer', () => {
    const [update] = buildBulkUpdateInputs(['e1'], { claimPayer: null }, resolve);
    expect(update?.input.reimbursementPayer).toBeNull();
    expect(update?.input.reimbursementStatus).toBe('pending');
  });

  it('leaves claims alone when the change set does not mention them', () => {
    const [update] = buildBulkUpdateInputs(['e1'], { note: 'Trip' }, resolve);
    expect(update?.input.reimbursementStatus).toBeUndefined();
    expect(update?.input.reimbursementAmount).toBeUndefined();
  });

  it('ignores an unknown id instead of emitting a partial claim', () => {
    expect(buildBulkUpdateInputs(['ghost'], { claimPayer: 'Acme' }, resolve)).toEqual([]);
  });

  it('combines a claim with other bulk edits on the same row', () => {
    const [update] = buildBulkUpdateInputs(
      ['e1'],
      { note: 'Berlin trip', expenseCategoryId: 'cx', claimPayer: 'Acme' },
      resolve,
    );
    expect(update?.input).toMatchObject({
      note: 'Berlin trip',
      categoryId: 'cx',
      reimbursementStatus: 'pending',
      reimbursementAmount: 100,
    });
  });
});

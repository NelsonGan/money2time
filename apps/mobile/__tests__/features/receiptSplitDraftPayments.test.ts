import {
  draftToSplitInputs,
  paidConflicts,
  type ReceiptSplitDraft,
} from '~/features/transactions/components/receiptSplit/receiptSplitDraft';
import type { ReceiptSplitComputation } from '~/features/transactions/lib/receiptSplitMath';
import type { TransactionSplit } from '~/types';

// Re-editing an itemized bill whose friends paid part of their share.

const draft = {} as ReceiptSplitDraft;
const nameById = new Map([['p-aisha', 'Aisha']]);
const PAID = '2026-11-02T10:00:00.000Z';

function computation(selfTotal: number, aishaTotal: number): ReceiptSplitComputation {
  return {
    perPerson: [
      { personKey: '__me__', isSelf: true, total: selfTotal, lines: [] },
      { personKey: 'p-aisha', isSelf: false, total: aishaTotal, lines: [] },
    ],
    unassignedItemIds: [],
  };
}

function split(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: 's1',
    transactionId: 't1',
    personName: 'Aisha',
    amount: 0,
    isSelf: false,
    paybackAccountId: 'acc-1',
    paidAt: null,
    paidTransactionId: null,
    partOfSplitId: null,
    isPayer: false,
    shareAmount: null,
    memberId: null,
    albumMemberId: null,
    settlementId: null,
    sortOrder: 0,
    createdAt: PAID,
    updatedAt: PAID,
    deletedAt: null,
    ...overrides,
  };
}

const prior = [
  split({ id: 'me', personName: null, isSelf: true, amount: 50 }),
  split({ id: 'a', amount: 70 }),
  split({ id: 'p', amount: 30, paidAt: PAID, paidTransactionId: 'tr', partOfSplitId: 'a' }),
];

describe('draftToSplitInputs with part payments', () => {
  it('keeps the paid part and gives the owed row what the new total leaves', () => {
    const inputs = draftToSplitInputs(draft, computation(40, 110), 'fallback', nameById, prior);
    expect(inputs.map((i) => [i.id, i.amount, !!i.paid])).toEqual([
      ['me', 40, false],
      ['a', 80, false],
      ['p', 30, true],
    ]);
    expect(inputs[2]!.paid).toEqual({ paidAt: PAID, paidTransactionId: 'tr' });
    expect(inputs[1]!.paybackAccountId).toBe('acc-1');
  });

  it('drops the owed row when what is paid now covers the share', () => {
    const inputs = draftToSplitInputs(draft, computation(120, 30), 'fallback', nameById, prior);
    expect(inputs.map((i) => i.id)).toEqual(['me', 'p']);
  });

  it('keeps a fully paid single-row share as it was', () => {
    const paidOnce = [split({ id: 'a', amount: 100, paidAt: PAID })];
    const inputs = draftToSplitInputs(draft, computation(0, 100), null, nameById, paidOnce);
    expect(inputs.map((i) => [i.id, i.amount, !!i.paid])).toEqual([
      [undefined, 0, false],
      ['a', 100, true],
    ]);
  });
});

describe('paidConflicts with part payments', () => {
  it('allows any new total that still covers what was paid', () => {
    expect(paidConflicts(computation(0, 30), prior, nameById)).toEqual([]);
    expect(paidConflicts(computation(0, 500), prior, nameById)).toEqual([]);
  });

  it('blocks a new total below what was already paid', () => {
    expect(paidConflicts(computation(0, 29.99), prior, nameById)).toEqual(['Aisha']);
  });

  it('still blocks a fully paid share whose total changes', () => {
    const paidOnce = [split({ id: 'a', amount: 100, paidAt: PAID })];
    expect(paidConflicts(computation(0, 100), paidOnce, nameById)).toEqual([]);
    expect(paidConflicts(computation(0, 120), paidOnce, nameById)).toEqual(['Aisha']);
  });
});

import {
  foldPaybackRows,
  indexPaybacks,
  type PaybackLink,
  samePaybackIndex,
} from '~/features/transactions/lib/paybackGroups';
import type { TransactionSplit, TransactionWithRelations } from '~/types';

function split(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: 's',
    transactionId: 'bill',
    personName: 'Aisha',
    amount: 100,
    isSelf: false,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    partOfSplitId: null,
    sortOrder: 0,
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const PAID = '2026-11-07T10:00:00.000Z';

describe('indexPaybacks', () => {
  it('maps each payback transfer to its bill and who paid', () => {
    const index = indexPaybacks([
      {
        id: 'bill',
        note: ' Flight to Tokyo ',
        categoryName: 'Transport',
        splits: [
          split({ id: 'a', paidAt: PAID, paidTransactionId: 'tr-a' }),
          split({ id: 'b', personName: 'Ben', paidAt: PAID, paidTransactionId: 'tr-b' }),
          // Same-account payback: no transfer to index.
          split({ id: 'c', personName: 'Chloe', paidAt: PAID }),
          // Unpaid.
          split({ id: 'd', personName: 'Daniel' }),
        ],
      } as unknown as TransactionWithRelations,
      {
        id: 'lunch',
        note: null,
        categoryName: 'Food',
        splits: [],
      } as unknown as TransactionWithRelations,
    ]);
    expect([...index]).toEqual([
      ['tr-a', { billId: 'bill', billTitle: 'Flight to Tokyo', personName: 'Aisha' }],
      ['tr-b', { billId: 'bill', billTitle: 'Flight to Tokyo', personName: 'Ben' }],
    ]);
  });

  it('falls back to the category name for an untitled bill', () => {
    const index = indexPaybacks([
      {
        id: 'bill',
        note: '',
        categoryName: 'Food',
        splits: [split({ paidAt: PAID, paidTransactionId: 'tr' })],
      } as unknown as TransactionWithRelations,
    ]);
    expect(index.get('tr')?.billTitle).toBe('Food');
  });
});

describe('samePaybackIndex', () => {
  it('compares by content', () => {
    const link: PaybackLink = { billId: 'b', billTitle: 'T', personName: 'A' };
    expect(samePaybackIndex(new Map([['x', link]]), new Map([['x', { ...link }]]))).toBe(true);
    expect(
      samePaybackIndex(new Map([['x', link]]), new Map([['x', { ...link, personName: 'B' }]])),
    ).toBe(false);
    expect(samePaybackIndex(new Map([['x', link]]), new Map())).toBe(false);
  });
});

describe('foldPaybackRows', () => {
  const index = new Map<string, PaybackLink>([
    ['p1', { billId: 'flight', billTitle: 'Flight', personName: 'Aisha' }],
    ['p2', { billId: 'flight', billTitle: 'Flight', personName: 'Ben' }],
    ['p3', { billId: 'flight', billTitle: 'Flight', personName: 'Aisha' }],
    ['q1', { billId: 'dinner', billTitle: 'Dinner', personName: 'Chloe' }],
  ]);
  const rows = (...ids: string[]) => ids.map((id) => ({ id }));

  it("folds a bill's paybacks into one entry where the first one was", () => {
    const entries = foldPaybackRows(rows('coffee', 'p1', 'q1', 'p2', 'lunch', 'p3'), index);
    expect(
      entries.map((entry) =>
        entry.kind === 'row'
          ? entry.transaction.id
          : [entry.billId, entry.transactions.map((tx) => tx.id), entry.personNames],
      ),
    ).toEqual(['coffee', ['flight', ['p1', 'p2', 'p3'], ['Aisha', 'Ben']], 'q1', 'lunch']);
  });

  it('leaves a lone payback and other rows as they are', () => {
    expect(foldPaybackRows(rows('q1', 'coffee'), index).map((entry) => entry.kind)).toEqual([
      'row',
      'row',
    ]);
  });
});

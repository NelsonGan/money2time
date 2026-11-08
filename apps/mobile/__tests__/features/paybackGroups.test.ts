import {
  buildPaybackRows,
  foldPaybackRows,
  indexPaybacks,
  isPaybackRow,
  type PaybackLink,
  paybackRowId,
  reusePaybackRows,
  samePaybackIndex,
} from '~/features/transactions/lib/paybackGroups';
import type { RateTable, TransactionSplit, TransactionWithRelations } from '~/types';

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
// 1 MYR = 0.2 EUR.
const RATES: RateTable = { base: 'MYR', rates: { MYR: 1, EUR: 0.2 }, asOfDate: '2026-11-01' };

describe('indexPaybacks', () => {
  it('maps each payback to its bill and who paid, by transfer or payback row', () => {
    const index = indexPaybacks([
      {
        id: 'bill',
        note: ' Flight to Tokyo ',
        categoryName: 'Transport',
        splits: [
          split({ id: 'a', paidAt: PAID, paidTransactionId: 'tr-a' }),
          split({ id: 'b', personName: 'Ben', paidAt: PAID, paidTransactionId: 'tr-b' }),
          // Same-account payback: no transfer, so its payback row.
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
      [paybackRowId('c'), { billId: 'bill', billTitle: 'Flight to Tokyo', personName: 'Chloe' }],
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

function bill(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: 'bill',
    type: 'expense',
    amount: 70,
    currency: 'MYR',
    accountAmount: null,
    accountId: 'maybank',
    accountName: 'Maybank',
    note: 'Dinner',
    categoryName: 'Food',
    createdBy: null,
    memberId: 'member-1',
    date: '2026-11-01',
    updatedAt: '2026-11-01T00:00:00.000Z',
    splits: [],
    ...overrides,
  } as unknown as TransactionWithRelations;
}

describe('buildPaybackRows', () => {
  const currencyOf = (id: string) => ({ maybank: 'MYR', wise: 'EUR' })[id];

  it('shows each payback that wrote no transfer, on the day it was paid', () => {
    const rows = buildPaybackRows(
      [
        bill({
          splits: [
            split({ id: 'same', amount: 30, paidAt: PAID, paybackAccountId: 'maybank' }),
            split({ id: 'moved', paidAt: PAID, paidTransactionId: 'tr' }),
            split({ id: 'owed', personName: 'Ben' }),
            split({ id: 'me', isSelf: true, paidAt: PAID }),
          ],
        }),
      ],
      currencyOf,
      RATES,
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      id: paybackRowId('same'),
      type: 'transfer',
      amount: 30,
      currency: 'MYR',
      date: PAID,
      fromAccountId: 'maybank',
      toAccountId: 'maybank',
      fromAccountName: 'Maybank',
      accountId: null,
      note: 'Aisha: Dinner',
      countsAsExpense: false,
      memberId: 'member-1',
      reportingAmount: null,
    });
    expect(isPaybackRow(row!)).toBe(true);
    expect(isPaybackRow({ id: 'tr' })).toBe(false);
  });

  it("shows a bill with no account's paybacks, named as a payback transfer would be", () => {
    const [row] = buildPaybackRows(
      [bill({ accountId: null, accountName: null, note: null, splits: [split({ paidAt: PAID })] })],
      currencyOf,
      RATES,
    );
    expect(row).toMatchObject({ fromAccountId: null, toAccountId: null, note: 'Aisha' });
  });

  it("shows a foreign bill's payback in the account's currency, at the bill's rate", () => {
    const foreign = bill({
      accountId: 'wise',
      currency: 'MYR',
      amount: 70,
      accountAmount: 14,
      splits: [split({ amount: 30, paidAt: PAID })],
    });
    expect(buildPaybackRows([foreign], currencyOf, RATES)[0]).toMatchObject({
      amount: 6,
      currency: 'EUR',
    });
    // Paid back to 0, there is no rate left on the bill: today's rate.
    expect(
      buildPaybackRows([{ ...foreign, amount: 0, accountAmount: 0 }], currencyOf, RATES)[0],
    ).toMatchObject({ amount: 6, currency: 'EUR' });
    // No account snapshot: the balance counts the bill at face value, so the
    // payback is the share in the account's currency, as a payback transfer.
    expect(
      buildPaybackRows([{ ...foreign, accountAmount: null }], currencyOf, RATES)[0],
    ).toMatchObject({ amount: 30, currency: 'EUR' });
  });

  it('lists them newest first', () => {
    const rows = buildPaybackRows(
      [
        bill({
          splits: [
            split({ id: 'old', paidAt: '2026-11-01T09:00:00.000Z' }),
            split({ id: 'new', paidAt: '2026-11-08T09:00:00.000Z' }),
          ],
        }),
      ],
      currencyOf,
      RATES,
    );
    expect(rows.map((row) => row.id)).toEqual([paybackRowId('new'), paybackRowId('old')]);
  });
});

describe('reusePaybackRows', () => {
  const currencyOf = () => 'MYR';
  const build = (overrides: Partial<TransactionSplit> = {}) =>
    buildPaybackRows(
      [bill({ splits: [split({ paidAt: PAID, ...overrides })] })],
      currencyOf,
      RATES,
    );

  it('keeps the previous rows while nothing they show changed', () => {
    const previous = build();
    expect(reusePaybackRows(previous, build())).toBe(previous);
  });

  it('moves the row with whichever of the bill and the split changed last', () => {
    const paid = split({ paidAt: PAID, updatedAt: '2026-11-07T10:00:00.000Z' });
    const renamed = bill({ note: 'Supper', updatedAt: '2026-11-08T09:00:00.000Z', splits: [paid] });
    const [row] = buildPaybackRows([renamed], currencyOf, RATES);
    expect(row).toMatchObject({ note: 'Aisha: Supper', updatedAt: '2026-11-08T09:00:00.000Z' });
  });

  it('rebuilds when a row changed or went', () => {
    const previous = build();
    const renamed = reusePaybackRows(previous, build({ personName: 'Ben' }));
    expect(renamed).not.toBe(previous);
    expect(renamed[0]?.note).toBe('Ben: Dinner');
    expect(reusePaybackRows(previous, [])).toEqual([]);
  });
});

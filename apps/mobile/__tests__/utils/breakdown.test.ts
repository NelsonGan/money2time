import { aggregateBreakdown, type BreakdownCategory, type BreakdownTxn } from '~/utils/breakdown';

const CATEGORIES: Record<string, BreakdownCategory> = {
  food: { id: 'food', name: 'Food', parentId: null },
  groceries: { id: 'groceries', name: 'Groceries', parentId: 'food' },
  dining: { id: 'dining', name: 'Dining', parentId: 'food' },
  transport: { id: 'transport', name: 'Transport', parentId: null },
};

const resolveCategory = (id: string): BreakdownCategory | undefined => CATEGORIES[id];
const identityValue = (amount: number): number => amount;

function txn(overrides: Partial<BreakdownTxn>): BreakdownTxn {
  return {
    categoryId: overrides.categoryId ?? null,
    amount: overrides.amount ?? 0,
    reportingAmount: overrides.reportingAmount,
    date: overrides.date ?? '2026-06-01',
  };
}

describe('aggregateBreakdown', () => {
  it('groups subcategories under their root when groupByRoot is true', () => {
    const result = aggregateBreakdown(
      [
        txn({ categoryId: 'groceries', amount: 30 }),
        txn({ categoryId: 'dining', amount: 20 }),
        txn({ categoryId: 'transport', amount: 15 }),
      ],
      { resolveCategory, valueOf: identityValue, groupByRoot: true },
    );

    expect(result).toEqual([
      { id: 'food', label: 'Food', parentLabel: undefined, amount: 50 },
      { id: 'transport', label: 'Transport', parentLabel: undefined, amount: 15 },
    ]);
  });

  it('keeps subcategories separate with a parent label when groupByRoot is false', () => {
    const result = aggregateBreakdown(
      [txn({ categoryId: 'groceries', amount: 30 }), txn({ categoryId: 'dining', amount: 20 })],
      { resolveCategory, valueOf: identityValue, groupByRoot: false },
    );

    expect(result).toEqual([
      { id: 'groceries', label: 'Groceries', parentLabel: 'Food', amount: 30 },
      { id: 'dining', label: 'Dining', parentLabel: 'Food', amount: 20 },
    ]);
  });

  it('sums multiple transactions in the same group', () => {
    const result = aggregateBreakdown(
      [txn({ categoryId: 'groceries', amount: 10 }), txn({ categoryId: 'groceries', amount: 5 })],
      { resolveCategory, valueOf: identityValue, groupByRoot: false },
    );

    expect(result).toEqual([
      { id: 'groceries', label: 'Groceries', parentLabel: 'Food', amount: 15 },
    ]);
  });

  it('sorts groups by amount descending', () => {
    const result = aggregateBreakdown(
      [
        txn({ categoryId: 'groceries', amount: 5 }),
        txn({ categoryId: 'transport', amount: 50 }),
        txn({ categoryId: 'dining', amount: 25 }),
      ],
      { resolveCategory, valueOf: identityValue, groupByRoot: false },
    );

    expect(result.map((r) => r.id)).toEqual(['transport', 'dining', 'groceries']);
  });

  it('skips transactions with no category or an unresolvable category', () => {
    const result = aggregateBreakdown(
      [
        txn({ categoryId: null, amount: 100 }),
        txn({ categoryId: 'deleted-cat', amount: 100 }),
        txn({ categoryId: 'transport', amount: 15 }),
      ],
      { resolveCategory, valueOf: identityValue, groupByRoot: true },
    );

    expect(result).toEqual([
      { id: 'transport', label: 'Transport', parentLabel: undefined, amount: 15 },
    ]);
  });

  it('prefers reportingAmount over amount, falling back to amount when null', () => {
    const result = aggregateBreakdown(
      [
        txn({ categoryId: 'transport', amount: 99, reportingAmount: 10 }),
        txn({ categoryId: 'transport', amount: 7, reportingAmount: null }),
      ],
      { resolveCategory, valueOf: identityValue, groupByRoot: false },
    );

    // groupByRoot:false on a root-level category mirrors the original behavior:
    // parentLabel resolves to the category's own (root) name.
    expect(result).toEqual([
      { id: 'transport', label: 'Transport', parentLabel: 'Transport', amount: 17 },
    ]);
  });

  it('applies valueOf so display-mode conversions (e.g. money→time) are honored', () => {
    const halve = (amount: number): number => amount / 2;
    const result = aggregateBreakdown([txn({ categoryId: 'transport', amount: 40 })], {
      resolveCategory,
      valueOf: halve,
      groupByRoot: true,
    });

    expect(result).toEqual([
      { id: 'transport', label: 'Transport', parentLabel: undefined, amount: 20 },
    ]);
  });

  it('returns an empty array when there is nothing to aggregate', () => {
    expect(
      aggregateBreakdown([], { resolveCategory, valueOf: identityValue, groupByRoot: true }),
    ).toEqual([]);
  });
});

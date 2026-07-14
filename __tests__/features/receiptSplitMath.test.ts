import {
  computeReceiptSplit,
  friendLetter,
  itemsSubtotal,
  receiptPersonKey,
  SELF_PERSON_KEY,
  splitQuantityLine,
  type ReceiptItemInput,
  type ReceiptShareInput,
  type ReceiptSplitMathInput,
} from '~/features/transactions/lib/receiptSplitMath';

const me = (weight = 1): ReceiptShareInput => ({
  personKey: SELF_PERSON_KEY,
  isSelf: true,
  weight,
});
const friend = (key: string, weight = 1): ReceiptShareInput => ({
  personKey: key,
  isSelf: false,
  weight,
});

function item(overrides: Partial<ReceiptItemInput> = {}): ReceiptItemInput {
  return { id: 'i1', lineTotal: 10, shares: [friend('a')], ...overrides };
}

function input(overrides: Partial<ReceiptSplitMathInput> = {}): ReceiptSplitMathInput {
  return { items: [item()], ...overrides };
}

const sumTotals = (result: ReturnType<typeof computeReceiptSplit>) =>
  Math.round(result.perPerson.reduce((acc, p) => acc + p.total, 0) * 100);

describe('receiptPersonKey / friendLetter', () => {
  it('folds case and whitespace, and gives self a fixed key', () => {
    expect(receiptPersonKey('  Sarah ', false)).toBe('sarah');
    expect(receiptPersonKey('SARAH', false)).toBe('sarah');
    expect(receiptPersonKey('anything', true)).toBe(SELF_PERSON_KEY);
  });

  it('labels unnamed friends A, B, … and wraps past Z', () => {
    expect(friendLetter(0)).toBe('A');
    expect(friendLetter(1)).toBe('B');
    expect(friendLetter(25)).toBe('Z');
    expect(friendLetter(26)).toBe('AA');
  });
});

describe('itemsSubtotal', () => {
  it('sums line totals in cents', () => {
    expect(itemsSubtotal([{ lineTotal: 0.1 }, { lineTotal: 0.2 }])).toBe(0.3);
  });
});

describe('splitQuantityLine', () => {
  it('explodes an integer quantity into unit rows with the remainder on the last', () => {
    const rows = splitQuantityLine({ quantity: 3, lineTotal: 10 });
    expect(rows).toEqual([
      { quantity: 1, lineTotal: 3.33 },
      { quantity: 1, lineTotal: 3.33 },
      { quantity: 1, lineTotal: 3.34 },
    ]);
    const cents = rows!.reduce((acc, r) => acc + Math.round(r.lineTotal * 100), 0);
    expect(cents).toBe(1000);
  });

  it('refuses fractional and single quantities', () => {
    expect(splitQuantityLine({ quantity: 0.45, lineTotal: 5 })).toBeNull();
    expect(splitQuantityLine({ quantity: 1, lineTotal: 5 })).toBeNull();
  });
});

describe('computeReceiptSplit', () => {
  it('splits a shared item evenly with the odd cent on the self share', () => {
    const result = computeReceiptSplit(
      input({ items: [item({ lineTotal: 10.01, shares: [me(), friend('a')] })] }),
    );
    const self = result.perPerson.find((p) => p.isSelf)!;
    const a = result.perPerson.find((p) => !p.isSelf)!;
    expect(self.total).toBe(5.01);
    expect(a.total).toBe(5.0);
    expect(sumTotals(result)).toBe(1001);
  });

  it('honors portion weights (2-of-3 beers)', () => {
    const result = computeReceiptSplit(
      input({ items: [item({ lineTotal: 9, shares: [friend('bob', 2), me(1)] })] }),
    );
    const bob = result.perPerson.find((p) => p.personKey === 'bob')!;
    const self = result.perPerson.find((p) => p.isSelf)!;
    expect(bob.total).toBe(6);
    expect(self.total).toBe(3);
  });

  it('keeps two unnamed people distinct by their person key', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 8, shares: [friend('p1')] }),
          item({ id: 'b', lineTotal: 12, shares: [friend('p2')] }),
        ],
      }),
    );
    expect(result.perPerson).toHaveLength(2);
    expect(result.perPerson.find((p) => p.personKey === 'p1')!.total).toBe(8);
    expect(result.perPerson.find((p) => p.personKey === 'p2')!.total).toBe(12);
  });

  it('returns unassigned items and excludes them from the math', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 10, shares: [me()] }),
          item({ id: 'b', lineTotal: 5, shares: [] }),
        ],
      }),
    );
    expect(result.unassignedItemIds).toEqual(['b']);
    const self = result.perPerson.find((p) => p.isSelf)!;
    expect(self.total).toBe(10);
  });

  it('treats zero-weight shares as unassigned', () => {
    const result = computeReceiptSplit(input({ items: [item({ shares: [friend('a', 0)] })] }));
    expect(result.unassignedItemIds).toEqual(['i1']);
  });

  it('merges duplicate sharers by summing weights', () => {
    const result = computeReceiptSplit(
      input({ items: [item({ lineTotal: 9, shares: [friend('bob'), friend('bob'), me()] })] }),
    );
    expect(result.perPerson).toHaveLength(2);
    const bob = result.perPerson.find((p) => p.personKey === 'bob')!;
    expect(bob.total).toBe(6);
  });

  it('puts the self share first and tracks per-item lines', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 4, shares: [friend('zoe')] }),
          item({ id: 'b', lineTotal: 6, shares: [me()] }),
        ],
      }),
    );
    expect(result.perPerson[0]!.isSelf).toBe(true);
    expect(result.perPerson[0]!.lines).toEqual([{ itemId: 'b', amount: 6 }]);
    expect(result.perPerson[1]!.lines).toEqual([{ itemId: 'a', amount: 4 }]);
  });

  it('always sums exactly to the item subtotal across awkward amounts and weights', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const keys = ['a', 'b', 'c', 'd'];
    for (let round = 0; round < 50; round += 1) {
      const itemCount = 1 + Math.floor(rand() * 5);
      const items: ReceiptItemInput[] = [];
      let subtotalCents = 0;
      for (let i = 0; i < itemCount; i += 1) {
        const sharerCount = 1 + Math.floor(rand() * 4);
        const shares: ReceiptShareInput[] = [me(1 + Math.floor(rand() * 3))];
        for (let s = 1; s < sharerCount; s += 1) {
          shares.push(friend(keys[Math.floor(rand() * keys.length)]!, 1 + Math.floor(rand() * 3)));
        }
        const lineTotal = Math.round(rand() * 9999) / 100;
        subtotalCents += Math.round(lineTotal * 100);
        items.push({ id: `i${i}`, lineTotal, shares });
      }
      const result = computeReceiptSplit({ items });
      expect(result.unassignedItemIds).toEqual([]);
      expect(sumTotals(result)).toBe(subtotalCents);
    }
  });
});

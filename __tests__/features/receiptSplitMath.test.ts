import {
  computeReceiptSplit,
  itemsSubtotal,
  receiptPersonKey,
  reconcileDelta,
  SELF_PERSON_KEY,
  splitQuantityLine,
  type ReceiptItemInput,
  type ReceiptShareInput,
  type ReceiptSplitMathInput,
} from '~/features/transactions/lib/receiptSplitMath';

function share(overrides: Partial<ReceiptShareInput> = {}): ReceiptShareInput {
  return { personName: 'Sarah', isSelf: false, weight: 1, ...overrides };
}

const me = (weight = 1): ReceiptShareInput => share({ personName: 'Me', isSelf: true, weight });

function item(overrides: Partial<ReceiptItemInput> = {}): ReceiptItemInput {
  return { id: 'i1', lineTotal: 10, shares: [share()], ...overrides };
}

function input(overrides: Partial<ReceiptSplitMathInput> = {}): ReceiptSplitMathInput {
  return {
    items: [item()],
    tax: 0,
    service: 0,
    discount: 0,
    adjustment: 0,
    total: 10,
    ...overrides,
  };
}

const sumTotals = (result: ReturnType<typeof computeReceiptSplit>) =>
  Math.round(result.perPerson.reduce((acc, p) => acc + p.total, 0) * 100);

describe('receiptPersonKey', () => {
  it('folds case and whitespace, and gives self a fixed key', () => {
    expect(receiptPersonKey('  Sarah ', false)).toBe('sarah');
    expect(receiptPersonKey('SARAH', false)).toBe('sarah');
    expect(receiptPersonKey('anything', true)).toBe(SELF_PERSON_KEY);
  });
});

describe('itemsSubtotal / reconcileDelta', () => {
  it('sums line totals in cents', () => {
    expect(itemsSubtotal([{ lineTotal: 0.1 }, { lineTotal: 0.2 }])).toBe(0.3);
  });

  it('reports how far the printed total is from the entered lines', () => {
    const balanced = input({
      items: [item({ lineTotal: 40 })],
      tax: 4,
      service: 2,
      discount: 1,
      adjustment: 0,
      total: 45,
    });
    expect(reconcileDelta(balanced)).toBe(0);
    expect(reconcileDelta({ ...balanced, total: 47.5 })).toBe(2.5);
    expect(reconcileDelta({ ...balanced, total: 44 })).toBe(-1);
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
      input({
        items: [item({ lineTotal: 10.01, shares: [me(), share()] })],
        total: 10.01,
      }),
    );
    const self = result.perPerson.find((p) => p.isSelf)!;
    const sarah = result.perPerson.find((p) => !p.isSelf)!;
    expect(self.total).toBe(5.01);
    expect(sarah.total).toBe(5.0);
    expect(sumTotals(result)).toBe(1001);
  });

  it('honors portion weights (2-of-3 beers)', () => {
    const result = computeReceiptSplit(
      input({
        items: [item({ lineTotal: 9, shares: [share({ personName: 'Bob', weight: 2 }), me(1)] })],
        total: 9,
      }),
    );
    const bob = result.perPerson.find((p) => p.personKey === 'bob')!;
    const self = result.perPerson.find((p) => p.isSelf)!;
    expect(bob.itemsSubtotal).toBe(6);
    expect(self.itemsSubtotal).toBe(3);
  });

  it('prorates the pool proportionally to item subtotals', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 30, shares: [me()] }),
          item({ id: 'b', lineTotal: 10, shares: [share()] }),
        ],
        tax: 4,
        total: 44,
      }),
    );
    const self = result.perPerson.find((p) => p.isSelf)!;
    const sarah = result.perPerson.find((p) => !p.isSelf)!;
    expect(self.proration).toBe(3);
    expect(sarah.proration).toBe(1);
    expect(self.total).toBe(33);
    expect(sarah.total).toBe(11);
    expect(sumTotals(result)).toBe(4400);
  });

  it('handles a negative pool (receipt-level discount)', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 30, shares: [me()] }),
          item({ id: 'b', lineTotal: 10, shares: [share()] }),
        ],
        discount: 4,
        total: 36,
      }),
    );
    const self = result.perPerson.find((p) => p.isSelf)!;
    const sarah = result.perPerson.find((p) => !p.isSelf)!;
    expect(self.proration).toBe(-3);
    expect(sarah.proration).toBe(-1);
    expect(sumTotals(result)).toBe(3600);
  });

  it('sends the whole pool to the self share when nobody has item spend', () => {
    const result = computeReceiptSplit(
      input({
        items: [item({ lineTotal: 0, shares: [me(), share()] })],
        service: 5,
        total: 5,
      }),
    );
    const self = result.perPerson.find((p) => p.isSelf)!;
    const sarah = result.perPerson.find((p) => !p.isSelf)!;
    expect(self.total).toBe(5);
    expect(sarah.total).toBe(0);
  });

  it('returns unassigned items and excludes them from the math', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 10, shares: [me()] }),
          item({ id: 'b', lineTotal: 5, shares: [] }),
        ],
        tax: 1,
        total: 16,
      }),
    );
    expect(result.unassignedItemIds).toEqual(['b']);
    const self = result.perPerson.find((p) => p.isSelf)!;
    // Pool falls back to the entered tax (1), not total − items.
    expect(self.total).toBe(11);
  });

  it('treats zero-weight shares as unassigned', () => {
    const result = computeReceiptSplit(
      input({ items: [item({ shares: [share({ weight: 0 })] })] }),
    );
    expect(result.unassignedItemIds).toEqual(['i1']);
  });

  it('merges duplicate sharers by summing weights and folds name case', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({
            lineTotal: 9,
            shares: [share({ personName: 'Bob' }), share({ personName: ' bob ' }), me()],
          }),
        ],
        total: 9,
      }),
    );
    expect(result.perPerson).toHaveLength(2);
    const bob = result.perPerson.find((p) => p.personKey === 'bob')!;
    expect(bob.itemsSubtotal).toBe(6);
    expect(bob.personName).toBe('Bob');
  });

  it('puts the self share first and tracks per-item lines', () => {
    const result = computeReceiptSplit(
      input({
        items: [
          item({ id: 'a', lineTotal: 4, shares: [share({ personName: 'Zoe' })] }),
          item({ id: 'b', lineTotal: 6, shares: [me()] }),
        ],
        total: 10,
      }),
    );
    expect(result.perPerson[0]!.isSelf).toBe(true);
    expect(result.perPerson[0]!.lines).toEqual([{ itemId: 'b', amount: 6 }]);
    expect(result.perPerson[1]!.lines).toEqual([{ itemId: 'a', amount: 4 }]);
  });

  it('absorbs a one-cent breakdown drift into the pool so totals still match', () => {
    // Entered tax says 1.00 but the printed total implies 1.01 — the printed
    // total wins and the invariant holds.
    const result = computeReceiptSplit(
      input({
        items: [item({ lineTotal: 10, shares: [me()] })],
        tax: 1,
        total: 11.01,
      }),
    );
    expect(sumTotals(result)).toBe(1101);
  });

  it('always sums exactly to the total across awkward amounts and weights', () => {
    // Deterministic pseudo-random sweep (fixed linear congruential seed).
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const people = ['Ann', 'Bob', 'Cat', 'Dee'];
    for (let round = 0; round < 50; round += 1) {
      const itemCount = 1 + Math.floor(rand() * 5);
      const items: ReceiptItemInput[] = [];
      for (let i = 0; i < itemCount; i += 1) {
        const sharerCount = 1 + Math.floor(rand() * 4);
        const shares: ReceiptShareInput[] = [me(1 + Math.floor(rand() * 3))];
        for (let s = 1; s < sharerCount; s += 1) {
          shares.push(
            share({
              personName: people[Math.floor(rand() * people.length)]!,
              weight: 1 + Math.floor(rand() * 3),
            }),
          );
        }
        items.push({ id: `i${i}`, lineTotal: Math.round(rand() * 9999) / 100, shares });
      }
      const tax = Math.round(rand() * 999) / 100;
      const service = Math.round(rand() * 500) / 100;
      const discount = Math.round(rand() * 300) / 100;
      const subtotalCents = items.reduce((acc, it) => acc + Math.round(it.lineTotal * 100), 0);
      const totalCents =
        subtotalCents +
        Math.round(tax * 100) +
        Math.round(service * 100) -
        Math.round(discount * 100);
      const result = computeReceiptSplit({
        items,
        tax,
        service,
        discount,
        adjustment: 0,
        total: totalCents / 100,
      });
      expect(result.unassignedItemIds).toEqual([]);
      expect(sumTotals(result)).toBe(totalCents);
      for (const line of result.perPerson.flatMap((p) => p.lines)) {
        expect(Number.isFinite(line.amount)).toBe(true);
      }
    }
  });
});

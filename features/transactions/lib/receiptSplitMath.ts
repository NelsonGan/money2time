// Pure math for the itemized receipt split ("Split by Item") flow.
// No React Native imports — covered by __tests__/features/receiptSplitMath.test.ts.
//
// All allocation happens in integer cents with largest-remainder rounding so
// per-person totals always sum exactly to the receipt total. Remainder cents
// prefer the user's own ("Me") share — friends never over-owe from rounding.
//
// The bill total is just the sum of the items plus an optional tax/service
// amount applied on top (like Split Bill's "apply %"). Each item is assigned
// to one or more people (a distinct host per item); shares split proportional
// to integer portion weights. People are grouped by an opaque `personKey`
// (the caller's stable person id) so two unnamed people never collide.

/** Person key used for the user's own share, regardless of display name. */
export const SELF_PERSON_KEY = '__self__';

/** Settle-up-compatible person key: trimmed + case-folded name. */
export function receiptPersonKey(personName: string, isSelf: boolean): string {
  if (isSelf) return SELF_PERSON_KEY;
  return personName.trim().toLowerCase();
}

/** Letter label for the Nth unnamed friend: 0 → "A", 1 → "B", … */
export function friendLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  // Beyond Z, fall back to AA, AB… so labels stay unique.
  return friendLetter(Math.floor(index / 26) - 1) + friendLetter(index % 26);
}

export interface ReceiptShareInput {
  /** Stable, opaque grouping key (a person id or a name-key). */
  personKey: string;
  isSelf: boolean;
  /** Integer portion weight; equal shares are weight 1 each. */
  weight: number;
}

export interface ReceiptItemInput {
  id: string;
  lineTotal: number;
  shares: ReceiptShareInput[];
}

export interface ReceiptSplitMathInput {
  items: ReceiptItemInput[];
  /** Absolute tax + service to prorate across everyone by item subtotal. */
  taxServiceAmount: number;
}

export interface PersonItemLine {
  itemId: string;
  amount: number;
}

export interface PersonReceiptShare {
  personKey: string;
  isSelf: boolean;
  itemsSubtotal: number;
  /** This person's prorated slice of the tax/service amount. */
  tax: number;
  total: number;
  lines: PersonItemLine[];
}

export interface ReceiptSplitComputation {
  /** Self share first, then people in first-appearance order. */
  perPerson: PersonReceiptShare[];
  unassignedItemIds: string[];
}

const toCents = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) : 0);

/** Cents-rounded sum of line totals. */
export function itemsSubtotal(items: Array<{ lineTotal: number }>): number {
  let cents = 0;
  for (const item of items) {
    cents += toCents(item.lineTotal);
  }
  return cents / 100;
}

/**
 * Explode an integer-quantity line into unit rows ("3× Beer" → three "1×
 * Beer" rows) so individual units can go to different people. Unit prices
 * are cents-exact with the remainder on the last row. Returns null for
 * quantities that shouldn't explode (non-integer, < 2, or a non-finite
 * line total).
 */
export function splitQuantityLine(item: {
  quantity: number;
  lineTotal: number;
}): Array<{ quantity: number; lineTotal: number }> | null {
  const count = item.quantity;
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 2) return null;
  const totalCents = toCents(item.lineTotal);
  if (totalCents < 0) return null;
  const base = Math.floor(totalCents / count);
  const rows: Array<{ quantity: number; lineTotal: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const cents = isLast ? totalCents - base * (count - 1) : base;
    rows.push({ quantity: 1, lineTotal: cents / 100 });
  }
  return rows;
}

/**
 * Allocate `targetCents` across `weights` proportionally, largest-remainder,
 * ties broken in favor of `preferIndex` then lower index. Handles negative
 * targets by allocating the magnitude and negating. All-zero weights split
 * evenly. Result always sums exactly to `targetCents`.
 */
function allocateCents(weights: number[], targetCents: number, preferIndex: number): number[] {
  if (weights.length === 0) return [];
  if (targetCents < 0) {
    return allocateCents(weights, -targetCents, preferIndex).map((c) => -c);
  }
  const priority = (index: number) => (index === preferIndex ? -1 : index);
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  if (weightSum === 0) {
    const base = Math.floor(targetCents / weights.length);
    let leftover = targetCents - base * weights.length;
    const result = weights.map(() => base);
    const order = weights.map((_, i) => i).sort((a, b) => priority(a) - priority(b));
    for (const index of order) {
      if (leftover <= 0) break;
      result[index] += 1;
      leftover -= 1;
    }
    return result;
  }

  const exact = weights.map((w) => (w * targetCents) / weightSum);
  const floors = exact.map(Math.floor);
  let leftover = targetCents - floors.reduce((acc, c) => acc + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || priority(a.index) - priority(b.index));
  for (const { index } of order) {
    if (leftover <= 0) break;
    floors[index] += 1;
    leftover -= 1;
  }
  return floors;
}

interface PersonAccumulator {
  personKey: string;
  isSelf: boolean;
  itemCents: number;
  lines: Array<{ itemId: string; cents: number }>;
}

/**
 * Compute each person's exact share of an itemized receipt.
 *
 * 1. Each item's line total splits across its sharers proportional to their
 *    integer weights (remainder cents prefer the self share).
 * 2. The tax/service amount is prorated across people proportional to each
 *    person's item subtotal (remainder cents prefer the self share). If
 *    nobody has item spend the whole amount goes to the self share.
 *
 * Invariant: Σ person totals ≡ (Σ assigned item line totals + taxService) in
 * cents. Items with no sharers are returned in `unassignedItemIds` and
 * excluded from the math (callers block save until none remain).
 */
export function computeReceiptSplit(input: ReceiptSplitMathInput): ReceiptSplitComputation {
  const persons = new Map<string, PersonAccumulator>();
  const unassignedItemIds: string[] = [];

  const personFor = (share: ReceiptShareInput): PersonAccumulator => {
    let person = persons.get(share.personKey);
    if (!person) {
      person = { personKey: share.personKey, isSelf: share.isSelf, itemCents: 0, lines: [] };
      persons.set(share.personKey, person);
    }
    return person;
  };

  for (const item of input.items) {
    // Merge duplicate sharers (same person listed twice) by summing weights.
    const merged = new Map<string, { share: ReceiptShareInput; weight: number }>();
    for (const share of item.shares) {
      const weight = Math.max(0, Math.round(share.weight));
      const existing = merged.get(share.personKey);
      if (existing) {
        existing.weight += weight;
      } else {
        merged.set(share.personKey, { share, weight });
      }
    }
    const sharers = [...merged.values()].filter((entry) => entry.weight > 0);
    if (sharers.length === 0) {
      unassignedItemIds.push(item.id);
      continue;
    }

    const lineCents = toCents(item.lineTotal);
    const selfPosition = sharers.findIndex((entry) => entry.share.isSelf);
    const allocated = allocateCents(
      sharers.map((entry) => entry.weight),
      lineCents,
      selfPosition >= 0 ? selfPosition : 0,
    );
    sharers.forEach((entry, position) => {
      const person = personFor(entry.share);
      const cents = allocated[position] ?? 0;
      person.itemCents += cents;
      person.lines.push({ itemId: item.id, cents });
    });
  }

  const orderedPersons = [...persons.values()].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return 0;
  });

  const poolCents = toCents(input.taxServiceAmount);
  let prorations: number[] = orderedPersons.map(() => 0);
  if (orderedPersons.length > 0 && poolCents !== 0) {
    const anyItemSpend = orderedPersons.some((person) => person.itemCents > 0);
    const selfIndex = orderedPersons.findIndex((person) => person.isSelf);
    if (anyItemSpend) {
      prorations = allocateCents(
        orderedPersons.map((person) => person.itemCents),
        poolCents,
        selfIndex >= 0 ? selfIndex : 0,
      );
    } else if (selfIndex >= 0) {
      prorations[selfIndex] = poolCents;
    } else {
      prorations[0] = poolCents;
    }
  }

  const perPerson: PersonReceiptShare[] = orderedPersons.map((person, index) => {
    const taxCents = prorations[index] ?? 0;
    return {
      personKey: person.personKey,
      isSelf: person.isSelf,
      itemsSubtotal: person.itemCents / 100,
      tax: taxCents / 100,
      total: (person.itemCents + taxCents) / 100,
      lines: person.lines.map((line) => ({ itemId: line.itemId, amount: line.cents / 100 })),
    };
  });

  return { perPerson, unassignedItemIds };
}

// Pure math for the itemized receipt split ("Split by Item") flow.
// No React Native imports — covered by __tests__/features/receiptSplitMath.test.ts.
//
// The bill total is just the sum of the items (any tax/service is baked into
// the item amounts by the "apply %" action before this runs). Each item is
// assigned to one or more people (a distinct host per item); shares split
// proportional to integer portion weights. People are grouped by an opaque
// `personKey` (the caller's stable person id) so two unnamed people never
// collide. Allocation is largest-remainder in integer cents so per-person
// totals sum exactly to the receipt total; odd cents prefer the self share.

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
}

export interface PersonItemLine {
  itemId: string;
  amount: number;
}

export interface PersonReceiptShare {
  personKey: string;
  isSelf: boolean;
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
 * ties broken in favor of `preferIndex` then lower index. All-zero weights
 * split evenly. Result always sums exactly to `targetCents`.
 */
function allocateCents(weights: number[], targetCents: number, preferIndex: number): number[] {
  if (weights.length === 0) return [];
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
 * Compute each person's exact share of an itemized receipt: each item's line
 * total splits across its sharers proportional to their integer weights
 * (remainder cents prefer the self share).
 *
 * Invariant: Σ person totals ≡ Σ assigned item line totals in cents. Items
 * with no sharers are returned in `unassignedItemIds` and excluded from the
 * math (callers block save until none remain).
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

  const perPerson: PersonReceiptShare[] = orderedPersons.map((person) => ({
    personKey: person.personKey,
    isSelf: person.isSelf,
    total: person.itemCents / 100,
    lines: person.lines.map((line) => ({ itemId: line.itemId, amount: line.cents / 100 })),
  }));

  return { perPerson, unassignedItemIds };
}

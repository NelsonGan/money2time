// Pure math for the itemized ("split before amount") Split Bill mode.
// No React Native imports — covered by __tests__/features/splitMath.test.ts.

/**
 * Structural view of a split row: enough to rescale amounts without
 * depending on the editor's SplitDraft type. `paid` truthy = settled row,
 * frozen by every operation here.
 */
export interface SplitRowLike {
  amount: string;
  isSelf: boolean;
  paid?: unknown;
}

const toCents = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) : 0);

const parseAmountCents = (amount: string): number => toCents(Number(amount));

/**
 * Index of the next editable (non-paid) row after `current`, scanning forward
 * only. Returns null when there is no editable row past `current` — used to
 * advance the mini-numpad focus to the next amount, or close it at the end.
 */
export function nextEditableAmountIndex(rows: SplitRowLike[], current: number): number | null {
  for (let i = current + 1; i < rows.length; i += 1) {
    if (!rows[i]!.paid) return i;
  }
  return null;
}

/** Cents-rounded sum of unpaid rows; blank/invalid amounts count as 0. */
export function sumUnpaidRows(rows: SplitRowLike[]): number {
  let cents = 0;
  for (const row of rows) {
    if (row.paid) continue;
    cents += parseAmountCents(row.amount);
  }
  return cents / 100;
}

/**
 * Rescale `amounts` proportionally so they sum to exactly `targetTotal`
 * (in cents). Largest-remainder rounding; ties are broken in favor of
 * `preferIndex`, then lower index. When every input is 0 the target is
 * split evenly, with leftover cents starting at `preferIndex`. A negative
 * target returns the input unchanged. Never produces negative values and
 * never mutates the input.
 */
export function scaleToTarget(amounts: number[], targetTotal: number, preferIndex = 0): number[] {
  const target = toCents(targetTotal);
  if (target < 0 || amounts.length === 0) return [...amounts];

  const cents = amounts.map(toCents);
  const inputSum = cents.reduce((acc, c) => acc + c, 0);

  // Tie-break order: preferIndex first, then ascending index.
  const priority = (index: number) => (index === preferIndex ? -1 : index);

  if (inputSum === 0) {
    const base = Math.floor(target / cents.length);
    let leftover = target - base * cents.length;
    const result = cents.map(() => base);
    const order = cents.map((_, i) => i).sort((a, b) => priority(a) - priority(b));
    for (const index of order) {
      if (leftover <= 0) break;
      result[index] += 1;
      leftover -= 1;
    }
    return result.map((c) => c / 100);
  }

  const exact = cents.map((c) => (c * target) / inputSum);
  const floors = exact.map(Math.floor);
  let leftover = target - floors.reduce((acc, c) => acc + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || priority(a.index) - priority(b.index));
  for (const { index } of order) {
    if (leftover <= 0) break;
    floors[index] += 1;
    leftover -= 1;
  }
  return floors.map((c) => c / 100);
}

/**
 * Rescale the unpaid rows of `rows` so they sum to exactly `unpaidTarget`,
 * preferring the unpaid Me row for remainder cents. Paid rows pass through
 * untouched. Amounts are written back as 2-decimal strings on fresh row
 * objects. Returns null when there is nothing to distribute over.
 */
const rescaleUnpaidRows = <T extends SplitRowLike>(rows: T[], unpaidTarget: number): T[] | null => {
  const unpaidIndices = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.paid)
    .map(({ index }) => index);
  if (unpaidIndices.length === 0) return null;

  const mePosition = unpaidIndices.findIndex((index) => rows[index]?.isSelf);
  const scaled = scaleToTarget(
    unpaidIndices.map((index) => Number(rows[index]!.amount) || 0),
    unpaidTarget,
    mePosition >= 0 ? mePosition : 0,
  );

  const next = [...rows];
  unpaidIndices.forEach((rowIndex, position) => {
    next[rowIndex] = { ...next[rowIndex]!, amount: (scaled[position] ?? 0).toFixed(2) };
  });
  return next;
};

/**
 * Itemized "+X%": scale unpaid rows to `unpaidSubtotal * (1 + percent/100)`
 * (cents-rounded). Paid rows are frozen and excluded from the base.
 * Returns null for a non-finite percent, percent <= -100, or an unusable
 * base (no unpaid rows / unpaid subtotal of 0).
 */
export function applyPercent<T extends SplitRowLike>(rows: T[], percent: number): T[] | null {
  if (!Number.isFinite(percent) || percent <= -100) return null;
  const subtotal = sumUnpaidRows(rows);
  if (subtotal <= 0) return null;
  const unpaidTarget = Math.round(subtotal * (1 + percent / 100) * 100) / 100;
  return rescaleUnpaidRows(rows, unpaidTarget);
}

/** Editor split row as consumed when building DB inputs (structural view). */
export interface SplitSourceLike {
  id?: string;
  personName: string;
  amount: string;
  isSelf: boolean;
  /** Marked as a shared item — its cost divides across the unique users. */
  shared?: boolean | null;
  note?: string | null;
  paybackAccountId: string | null;
  paid?: { paidAt: string; paidTransactionId: string | null };
}

/** DB-ready split input (mirrors AppContext's SplitDraftInput). */
export interface SplitInputLike {
  id?: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  note?: string | null;
  paybackAccountId: string | null;
  sortOrder?: number;
  paid?: { paidAt: string; paidTransactionId: string | null };
}

/**
 * Convert editor split rows into DB-ready inputs, expanding "shared" rows: the
 * combined amount of every shared row is divided evenly across the unique users
 * — each distinct assigned person plus Me — and folded in as one extra input
 * per user (never emitted as its own line). Non-shared rows map 1:1. Shared-only
 * people are not users: a shared row is assigned to no one.
 *
 * `formatSharedNote` turns the shared item names (e.g. ["Wine", "Bread"]) into
 * the note stored on each user's shared line (e.g. "Wine, Bread (Shared)"), so
 * the receipt can list the shared items under each person.
 */
export function buildSplitInputs(
  rows: SplitSourceLike[],
  fallbackAccountId: string | null | undefined,
  formatSharedNote?: (itemNames: string[]) => string | null,
): SplitInputLike[] {
  const account = (id: string | null | undefined) => id ?? fallbackAccountId ?? null;
  const nonShared = rows.filter((r) => !r.shared);
  const shared = rows.filter((r) => !!r.shared && !r.paid);

  const base: SplitInputLike[] = nonShared.map((r, idx) => ({
    id: r.id,
    personName: r.personName.trim() || null,
    amount: Number(r.amount) || 0,
    isSelf: r.isSelf,
    note: r.note?.trim() || null,
    paybackAccountId: account(r.paybackAccountId),
    sortOrder: idx,
    paid: r.paid,
  }));

  const sharedTotal = shared.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  if (shared.length === 0 || sharedTotal <= 0) return base;

  // Unique users the shared pool divides across: Me first (always), then each
  // assigned friend. Named friends collapse by name; an UNNAMED friend row
  // ("Someone") is its own distinct user — it still owes a share of the shared
  // items, and the receipt already lists each unnamed row separately.
  const users: { personName: string | null; isSelf: boolean; paybackAccountId: string | null }[] = [
    { personName: null, isSelf: true, paybackAccountId: null },
  ];
  const seen = new Set<string>();
  for (const r of nonShared) {
    if (r.isSelf || r.paid) continue;
    const name = r.personName.trim();
    if (name && seen.has(name.toLowerCase())) continue;
    if (name) seen.add(name.toLowerCase());
    users.push({
      personName: name || null,
      isSelf: false,
      paybackAccountId: account(r.paybackAccountId),
    });
  }

  const sharedNames = shared.map((r) => r.note?.trim()).filter((n): n is string => !!n);
  const sharedNote = formatSharedNote ? formatSharedNote(sharedNames) : null;

  // Even split of the shared pool across the users (largest-remainder cents).
  const portions = scaleToTarget(
    users.map(() => 0),
    sharedTotal,
  );
  const sharedInputs: SplitInputLike[] = users.map((u, i) => ({
    personName: u.personName,
    amount: portions[i] ?? 0,
    isSelf: u.isSelf,
    note: sharedNote?.trim() || null,
    paybackAccountId: u.paybackAccountId,
    sortOrder: base.length + i,
  }));

  return [...base, ...sharedInputs];
}

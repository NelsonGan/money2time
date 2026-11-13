/**
 * Whose spending a trip's breakdown shows, as the app's album Breakdown
 * (features/albums/lib/memberShare.ts). "Everyone" is the trip's entries as
 * they stand. A person is their share of each bill: the user's own entries in
 * full and their Me row of a split bill, or for anyone else their row of each
 * split bill, matched by name. Shares are in the bill's own currency, so the
 * page scales each entry by `share / originalAmount`. No imports but the
 * split-payer rules, so the tests can load it.
 */

import { billPayer, type PayerSplit } from "./split-payer.ts";

/** Who a breakdown is for: the user, or a person by their case-folded name. */
export type TripMember = { kind: "self" } | { kind: "person"; key: string };

/** A person's key: the trimmed, case-folded name with single spaces (the app's `personNameKey`). */
export function personKey(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/** Whether a bill is split with anyone but the user. */
export function isSplitWithOthers(rows: readonly PayerSplit[] | undefined): boolean {
  return !!rows?.some((row) => !row.is_self);
}

/** A member's share of one entry, in its own currency: 0 when it is not theirs. */
export function memberShare(rows: readonly PayerSplit[] | undefined, originalAmount: number, member: TripMember): number {
  const splits = rows ?? [];
  if (member.kind === "self") {
    if (!isSplitWithOthers(splits)) return originalAmount;
    const self = splits.find((row) => !!row.is_self);
    if (self) return self.amount;
    // On a bill a friend paid the expense is the user's share, even with the
    // Me row gone (an older app can remove it).
    return billPayer(splits) !== null ? originalAmount : 0;
  }
  // On a bill a friend paid, the rows under the payer's are the user's own
  // payments to them, not anyone's share.
  const friendPaid = billPayer(splits) !== null;
  let total = 0;
  for (const row of splits) {
    if (row.is_self || personKey(row.person_name) !== member.key) continue;
    if (row.part_of_split_id) {
      if (!friendPaid) total += row.amount;
      continue;
    }
    total += row.share_amount ?? row.amount;
  }
  return total;
}

/**
 * The people a trip's breakdown can be shown for: the names on its split
 * bills, in the order they first appear. Empty while no bill is split.
 */
export function tripPeople(splitsByTx: ReadonlyMap<string, readonly PayerSplit[]>, txIds: readonly string[]): { key: string; name: string }[] {
  const people = new Map<string, string>();
  for (const id of txIds) {
    const rows = splitsByTx.get(id);
    if (!isSplitWithOthers(rows)) continue;
    for (const row of rows!) {
      if (row.is_self || row.part_of_split_id) continue;
      const name = (row.person_name ?? "").trim();
      const key = personKey(name);
      if (key && !people.has(key)) people.set(key, name);
    }
  }
  return [...people].map(([key, name]) => ({ key, name }));
}

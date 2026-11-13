/**
 * Whose spending an album's Breakdown shows. Pure, so the screen and the
 * tests share one set of rules.
 *
 * "Everyone" is the album's entries as they stand. A person is their share of
 * each bill: the user's own entries in full and the Me row of a split bill,
 * or for anyone else their row of each split bill. Shares are in the bill's
 * currency; the screen turns them into the entry's displayed value by the
 * entry's own rate (`displayValue × share / amount`).
 */

import { friendShare, isFriendPaidBill } from '~/features/transactions/lib/splitPayer';
import type { TransactionSplit } from '~/types';

import { type AlbumGroupPerson, personNameKey } from './albumPeople';

/** Who a Breakdown is for: the user, or someone the album's bills are split with. */
export type BreakdownMember =
  | { kind: 'self' }
  /** `id` is the person's `AlbumPerson` or `AlbumMember` id; null for a name only typed on a bill. */
  | { kind: 'person'; id: string | null; name: string };

export interface BreakdownMemberOption {
  key: string;
  name: string;
  member: BreakdownMember;
}

type ShareRow = Pick<
  TransactionSplit,
  'isSelf' | 'amount' | 'shareAmount' | 'personName' | 'albumMemberId' | 'partOfSplitId' | 'isPayer'
>;

interface ShareEntry {
  amount: number;
  splits?: readonly ShareRow[] | null;
}

/** Whether a bill is split with anyone but the user. */
export function isSplitWithOthers(entry: ShareEntry): boolean {
  return !!entry.splits?.some((split) => !split.isSelf);
}

function isPerson(split: ShareRow, member: Extract<BreakdownMember, { kind: 'person' }>): boolean {
  if (split.isSelf) return false;
  // A row written for an album's person carries their id; an older or typed
  // one only their name.
  if (member.id && split.albumMemberId) return split.albumMemberId === member.id;
  return personNameKey(split.personName) === personNameKey(member.name);
}

/** A member's share of one entry, in its currency: 0 when it is not theirs. */
export function memberShare(entry: ShareEntry, member: BreakdownMember): number {
  const splits = entry.splits ?? [];
  if (member.kind === 'self') {
    if (!isSplitWithOthers(entry)) return entry.amount;
    const self = splits.find((split) => split.isSelf);
    if (self) return self.amount;
    // On a bill a friend paid the expense is the user's share, even with the
    // Me row gone (an older app can remove it), as `selfShare` reads it.
    return isFriendPaidBill(splits) ? entry.amount : 0;
  }
  // On a bill a friend paid, the rows under the payer's are the user's own
  // payments to them, not anyone's share.
  const friendPaid = isFriendPaidBill(splits);
  let total = 0;
  for (const split of splits) {
    if (!isPerson(split, member)) continue;
    if (split.partOfSplitId) {
      // A part of a share they paid the user back, cut out of their row.
      if (!friendPaid) total += split.amount;
      continue;
    }
    total += friendShare(split);
  }
  return total;
}

/**
 * The people a Breakdown can be shown for: the user, the album's people, then
 * any other name its split bills carry. Empty while no bill is split, since
 * there is nobody's share to tell apart.
 */
export function breakdownMemberOptions(
  people: readonly AlbumGroupPerson[],
  entries: readonly ShareEntry[],
  selfName: string,
): BreakdownMemberOption[] {
  const split = entries.filter(isSplitWithOthers);
  if (split.length === 0) return [];
  const options: BreakdownMemberOption[] = [
    { key: 'self', name: selfName, member: { kind: 'self' } },
  ];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const person of people) {
    if (person.isSelf) continue;
    if (person.id) ids.add(person.id);
    names.add(personNameKey(person.name));
    options.push({
      key: person.id ?? `name:${personNameKey(person.name)}`,
      name: person.name,
      member: { kind: 'person', id: person.id, name: person.name },
    });
  }
  for (const entry of split) {
    for (const row of entry.splits ?? []) {
      if (row.isSelf || row.partOfSplitId || (row.albumMemberId && ids.has(row.albumMemberId))) {
        continue;
      }
      const name = row.personName?.trim();
      const key = personNameKey(name);
      if (!name || names.has(key)) continue;
      names.add(key);
      options.push({ key: `name:${key}`, name, member: { kind: 'person', id: null, name } });
    }
  }
  return options;
}

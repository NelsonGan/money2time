/**
 * The people an album is split with. Pure, shared by the album screens, the
 * entry editor and the group sync.
 *
 * Only a shared album is split: its people are its group's members
 * (`AlbumMember`), everyone who joined with its link, the user among them. A
 * person has an id, which the shares of the album's bills carry
 * (`TransactionSplit.albumMemberId`), and a name, which is what Balances
 * groups a person by. An album that is not shared has nobody but the user.
 */

import type { AlbumMember } from '~/types';

/** The most people who can join a shared album, its owner aside (the Worker's limit). */
export const MAX_ALBUM_PEOPLE = 20;
const MAX_PERSON_NAME = 40;

/** A typed name as it is kept: single spaces, trimmed, bounded. */
export function cleanPersonName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_PERSON_NAME);
}

/** What two names are compared by: the kept name, case-folded. */
export function personNameKey(name: string | null | undefined): string {
  return cleanPersonName(name ?? '').toLowerCase();
}

/** Why a name was not taken: empty, or someone else's in the album. */
export type PeopleEditError = 'blank' | 'taken';

/** A person of an album, the user included, whichever way the album keeps them. */
export interface AlbumGroupPerson {
  /** The person's `AlbumMember` id; null for the user in an album that is not shared. */
  id: string | null;
  name: string;
  isSelf: boolean;
  /** Shared albums: whether this person has joined with an account. */
  joined: boolean;
}

/** The user's own member in a shared album's group, once they have one. */
export function selfMember(
  members: readonly AlbumMember[],
  userId: string | null | undefined,
): AlbumMember | null {
  if (!userId) return null;
  return members.find((member) => member.userId === userId && !member.deletedAt) ?? null;
}

/**
 * Everyone an album is split between, the user first. `members` are the
 * group's live members when the album is shared, else null: an album that is
 * not shared has nobody but the user.
 */
export function albumPeople(
  members: readonly AlbumMember[] | null,
  userId: string | null | undefined,
  meLabel: string,
): AlbumGroupPerson[] {
  if (!members) return [{ id: null, name: meLabel, isSelf: true, joined: true }];
  const live = members.filter((member) => !member.deletedAt);
  const self = selfMember(live, userId);
  const people: AlbumGroupPerson[] = live.map((member) => ({
    id: member.id,
    name: member.id === self?.id ? meLabel : member.name,
    isSelf: member.id === self?.id,
    joined: member.userId !== null,
  }));
  // The user first, the others as the group lists them.
  return [...people.filter((person) => person.isSelf), ...people.filter((p) => !p.isSelf)];
}

/** The people a new bill starts split with: everyone but the user. */
export function splitWithPeople(
  people: readonly AlbumGroupPerson[],
): { id: string; name: string }[] {
  return people.flatMap((person) =>
    person.isSelf || !person.id ? [] : [{ id: person.id, name: person.name }],
  );
}

/** `base`, or `base 2`, `base 3`… when someone in `members` already has the name. */
export function uniquePersonName(base: string, members: readonly AlbumMember[]): string {
  const taken = new Set(members.map((member) => personNameKey(member.name)));
  let unique = base;
  for (let n = 2; taken.has(personNameKey(unique)); n += 1) {
    // Within the longest name a group keeps, or it reads back as the taken one.
    const suffix = ` ${n}`;
    unique = `${base.slice(0, MAX_PERSON_NAME - suffix.length).trimEnd()}${suffix}`;
  }
  return unique;
}

/**
 * Who a friend's row of a split bill is in a group: the member the row
 * already names, else the one of that name. Null when it is someone new.
 */
export function memberForRow(
  members: readonly AlbumMember[],
  selfId: string,
  row: { albumMemberId?: string | null; personName?: string | null },
): AlbumMember | null {
  const named = row.albumMemberId
    ? members.find((member) => member.id === row.albumMemberId && member.id !== selfId)
    : null;
  return named ?? memberByName(members, row.personName, selfId);
}

/**
 * The member a typed name stands for in a group: the one of that name, the
 * user aside. Names are unique in a group, compared case-folded.
 */
function memberByName(
  members: readonly AlbumMember[],
  name: string | null | undefined,
  selfId: string | null,
): AlbumMember | null {
  const key = personNameKey(name);
  if (!key) return null;
  return (
    members.find(
      (member) => !member.deletedAt && member.id !== selfId && personNameKey(member.name) === key,
    ) ?? null
  );
}

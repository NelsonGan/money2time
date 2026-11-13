/**
 * The people an album is split with. Pure, shared by the album screens, the
 * entry editor and the group sync.
 *
 * An album that is not shared keeps them as names on the album itself
 * (`Album.splitWith`); the user is never listed, they are "Me". A shared
 * album's people are its group's members (`AlbumMember`), the user among
 * them. Either way a person has an id, which the shares of the album's bills
 * carry (`TransactionSplit.albumMemberId`), and a name, which is what
 * Balances groups a person by.
 */

import type { Album, AlbumMember, AlbumPerson } from '~/types';

/** The most people an album is split with, the user aside. */
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

export type PeopleEditError = 'blank' | 'taken' | 'full';

/** `people` with someone added, or why not. */
export function withPersonAdded(
  people: readonly AlbumPerson[],
  name: string,
  id: string,
): AlbumPerson[] | PeopleEditError {
  const cleaned = cleanPersonName(name);
  if (!cleaned) return 'blank';
  if (people.length >= MAX_ALBUM_PEOPLE) return 'full';
  const key = personNameKey(cleaned);
  if (people.some((person) => personNameKey(person.name) === key)) return 'taken';
  return [...people, { id, name: cleaned }];
}

/** `people` with one of them renamed, or why not. */
export function withPersonRenamed(
  people: readonly AlbumPerson[],
  id: string,
  name: string,
): AlbumPerson[] | PeopleEditError {
  const cleaned = cleanPersonName(name);
  if (!cleaned) return 'blank';
  const key = personNameKey(cleaned);
  if (people.some((person) => person.id !== id && personNameKey(person.name) === key)) {
    return 'taken';
  }
  return people.map((person) => (person.id === id ? { ...person, name: cleaned } : person));
}

export function withPersonRemoved(people: readonly AlbumPerson[], id: string): AlbumPerson[] {
  return people.filter((person) => person.id !== id);
}

/** A person of an album, the user included, whichever way the album keeps them. */
export interface AlbumGroupPerson {
  /** The person's id: an `AlbumPerson` or `AlbumMember` id; null for the user in an album that is not shared. */
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
 * group's live members when the album is shared, else null.
 */
export function albumPeople(
  album: Pick<Album, 'splitWith'>,
  members: readonly AlbumMember[] | null,
  userId: string | null | undefined,
  meLabel: string,
): AlbumGroupPerson[] {
  if (!members) {
    return [
      { id: null, name: meLabel, isSelf: true, joined: true },
      ...album.splitWith.map((person) => ({
        id: person.id,
        name: person.name,
        isSelf: false,
        joined: false,
      })),
    ];
  }
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
export function splitWithPeople(people: readonly AlbumGroupPerson[]): AlbumPerson[] {
  return people.flatMap((person) =>
    person.isSelf || !person.id ? [] : [{ id: person.id, name: person.name }],
  );
}

/** `base`, or `base 2`, `base 3`… when someone in `members` already has the name. */
export function uniquePersonName(base: string, members: readonly AlbumMember[]): string {
  const taken = new Set(members.map((member) => personNameKey(member.name)));
  let unique = base;
  for (let n = 2; taken.has(personNameKey(unique)); n += 1) unique = `${base} ${n}`;
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

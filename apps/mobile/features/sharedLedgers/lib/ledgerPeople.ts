// Who added and who owns entries in a shared ledger (README.md > Shared
// ledgers > Who added it). Entries carry a Cloud Sync account id in
// `created_by` and `member_id`, null meaning the ledger's owner; each person's
// name and photo come from `ledger_profiles`, which every phone writes for its
// own account and which syncs with the ledger.

import { useSyncExternalStore } from 'react';

import { getCachedSessionUser } from '~/features/cloudSync/services/sessionUser';
import {
  type SharedLedger,
  sharedLedgerFor,
  subscribeSharedLedgers,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { getSQLite } from '~/lib/db/client';
import { getActiveLedgerId } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';

export interface LedgerPerson {
  /** What an entry of theirs holds in `member_id`: null for the ledger's owner. */
  memberId: string | null;
  /** Their full display name. */
  name: string;
  /** Their Settings photo (a user-asset path), if they set one. */
  avatarUri: string | null;
  role: 'owner' | 'member';
  /** This phone's own account. */
  isSelf: boolean;
  /** Known only from an entry: no profile has synced for them (left, or on an older app). */
  unknown?: boolean;
}

export interface LedgerPeople {
  ledgerId: string;
  /** The owner first, then the members by name. */
  people: LedgerPerson[];
  /** The person behind `member_id` (or `created_by`) on one of the ledger's entries. */
  personFor(memberId: string | null | undefined): LedgerPerson;
}

interface EntryAttribution {
  createdBy?: string | null;
  memberId?: string | null;
}

/**
 * The account a new entry in `ledgerId` is stamped with: this phone's account
 * when it is a member of that shared ledger, else null (the owner, or a ledger
 * that is not shared).
 */
export function selfMemberIdFor(ledgerId: string): string | null {
  const shared = sharedLedgerFor(ledgerId);
  if (!shared || shared.role !== 'member') return null;
  return shared.userId ?? getCachedSessionUser()?.id ?? null;
}

/**
 * `input` with who added it and whose it is filled in, keeping any value the
 * caller set (a recurring run passes its rule's person, the editor its pick).
 * `memberId` defaults to whoever added the entry.
 */
export function withEntryStamp<T extends EntryAttribution>(
  input: T,
  ledgerId: string,
): T & { createdBy: string | null; memberId: string | null } {
  const createdBy = input.createdBy !== undefined ? input.createdBy : selfMemberIdFor(ledgerId);
  const memberId = input.memberId !== undefined ? input.memberId : createdBy;
  return { ...input, createdBy, memberId };
}

/** A person's first name, for the compact line on a transaction row. */
export function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}

// ---------------------------------------------------------------------------
// The store

interface ProfileRow {
  user_id: string;
  role: string;
  name: string | null;
  avatar_uri: string | null;
}

interface OwnProfile {
  name: string | null;
  avatarUri: string | null;
}

let cache: { ledgerId: string; value: LedgerPeople | null } | null = null;
const listeners = new Set<() => void>();

/** Re-reads the people on the next render: after a sync, a switch of ledger, a profile edit. */
export function invalidateLedgerPeople(): void {
  cache = null;
  for (const listener of listeners) listener();
}

subscribeSharedLedgers(invalidateLedgerPeople);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readOwnProfile(): OwnProfile {
  try {
    const row = getSQLite().getFirstSync<{
      profile_name: string | null;
      profile_avatar_uri: string | null;
    }>('SELECT profile_name, profile_avatar_uri FROM settings LIMIT 1');
    return {
      name: row?.profile_name?.trim() || null,
      avatarUri: row?.profile_avatar_uri ?? null,
    };
  } catch {
    return { name: null, avatarUri: null };
  }
}

function readProfiles(ledgerId: string): ProfileRow[] {
  try {
    return getSQLite().getAllSync<ProfileRow>(
      `SELECT user_id, role, name, avatar_uri FROM ledger_profiles
       WHERE ledger_id = ? AND deleted_at IS NULL`,
      [ledgerId],
    );
  } catch {
    // Before migration 079 has run.
    return [];
  }
}

/** The name this phone's account goes by: its Settings name, else its sign-in name. */
function ownName(own: OwnProfile): string | null {
  return own.name ?? (getCachedSessionUser()?.name.trim() || null);
}

/** Pure: the people of one shared ledger, from what the phone has. Exported for tests. */
export function buildLedgerPeople(
  shared: SharedLedger,
  profiles: readonly ProfileRow[],
  own: OwnProfile,
  selfId: string | null,
): LedgerPeople {
  const memberFallback = I18n.t('shared_ledgers.member_fallback');
  const ownerRow = profiles.find((row) => row.role === 'owner');
  const selfIsOwner = shared.role === 'owner';
  const ownerName = selfIsOwner
    ? (own.name ?? ownerRow?.name ?? shared.ownerName)
    : (ownerRow?.name ?? shared.ownerName);
  const owner: LedgerPerson = {
    memberId: null,
    name: ownerName?.trim() || memberFallback,
    avatarUri: selfIsOwner
      ? (own.avatarUri ?? ownerRow?.avatar_uri ?? null)
      : (ownerRow?.avatar_uri ?? null),
    role: 'owner',
    isSelf: selfIsOwner,
  };
  const members = new Map<string, LedgerPerson>();
  for (const row of profiles) {
    if (row.role === 'owner' || row.user_id === ownerRow?.user_id) continue;
    const isSelf = !selfIsOwner && row.user_id === selfId;
    members.set(row.user_id, {
      memberId: row.user_id,
      name: (isSelf ? own.name : null) ?? (row.name?.trim() || memberFallback),
      avatarUri: (isSelf ? own.avatarUri : null) ?? row.avatar_uri,
      role: 'member',
      isSelf,
    });
  }
  // A member whose own profile has not been written or synced yet.
  if (!selfIsOwner && selfId && !members.has(selfId)) {
    members.set(selfId, {
      memberId: selfId,
      name: own.name ?? memberFallback,
      avatarUri: own.avatarUri,
      role: 'member',
      isSelf: true,
    });
  }
  const sorted = [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
  const people = [owner, ...sorted];
  const ownerUserId = ownerRow?.user_id ?? (selfIsOwner ? selfId : null);
  return {
    ledgerId: shared.ledgerId,
    people,
    personFor(memberId) {
      if (!memberId || memberId === ownerUserId) return owner;
      return (
        members.get(memberId) ?? {
          memberId,
          name: memberFallback,
          avatarUri: null,
          role: 'member',
          isSelf: false,
          unknown: true,
        }
      );
    },
  };
}

/** The people of `ledgerId` when it is shared, else null. Cached until invalidated. */
export function getLedgerPeople(ledgerId: string = getActiveLedgerId()): LedgerPeople | null {
  if (cache?.ledgerId === ledgerId) return cache.value;
  const shared = sharedLedgerFor(ledgerId);
  const own = readOwnProfile();
  const value = shared
    ? buildLedgerPeople(
        shared,
        readProfiles(ledgerId),
        { name: ownName(own), avatarUri: own.avatarUri },
        shared.userId ?? getCachedSessionUser()?.id ?? null,
      )
    : null;
  cache = { ledgerId, value };
  return value;
}

/**
 * The open ledger's people while it is shared, else null. Re-renders after a
 * sync, a switch of ledger or a profile edit (`invalidateLedgerPeople`).
 */
export function useOpenLedgerPeople(): LedgerPeople | null {
  return useSyncExternalStore(subscribe, () => getLedgerPeople());
}

// ---------------------------------------------------------------------------
// This phone's own profile in each shared ledger

/** The row id of `userId`'s profile in `ledgerId`: the same on all their phones. */
export function profileRowId(ledgerId: string, userId: string): string {
  return `${ledgerId}:${userId}`;
}

/**
 * Writes this phone's account's name and photo into each of its shared
 * ledgers, where it differs from what the ledger has. The change capture
 * sends it with the ledger's next sync. Returns how many rows changed.
 */
export function writeOwnLedgerProfiles(
  ledgers: readonly SharedLedger[],
  fallbackUserId: string | null,
  now: string = new Date().toISOString(),
): number {
  const own = readOwnProfile();
  const name = ownName(own);
  const db = getSQLite();
  let changed = 0;
  for (const ledger of ledgers) {
    const userId = ledger.userId ?? fallbackUserId;
    if (!userId) continue;
    const id = profileRowId(ledger.ledgerId, userId);
    const existing = db.getFirstSync<{
      role: string;
      name: string | null;
      avatar_uri: string | null;
      deleted_at: string | null;
    }>('SELECT role, name, avatar_uri, deleted_at FROM ledger_profiles WHERE id = ?', [id]);
    if (
      existing &&
      existing.deleted_at === null &&
      existing.role === ledger.role &&
      existing.name === name &&
      existing.avatar_uri === own.avatarUri
    ) {
      continue;
    }
    if (existing) {
      db.runSync(
        `UPDATE ledger_profiles SET role = ?, name = ?, avatar_uri = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [ledger.role, name, own.avatarUri, now, id],
      );
    } else {
      db.runSync(
        `INSERT INTO ledger_profiles (id, ledger_id, user_id, role, name, avatar_uri, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ledger.ledgerId, userId, ledger.role, name, own.avatarUri, now, now],
      );
    }
    changed += 1;
  }
  if (changed) invalidateLedgerPeople();
  return changed;
}

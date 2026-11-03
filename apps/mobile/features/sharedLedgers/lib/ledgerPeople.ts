// The people of a shared ledger: each person's name and photo, from
// `ledger_profiles`, which every phone writes for its own account and which
// syncs with the ledger (README.md > Shared ledgers > Who added it). Entries
// carry a Cloud Sync account id in `created_by` and `member_id`, null meaning
// the ledger's owner; stamping a new one is in entryStamp.ts.

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
import { getProfileAvatarUri } from '~/services/userAssets';

import { distinctSeedColors, seedColor } from './personColors';

export interface LedgerPerson {
  /** What an entry of theirs holds in `member_id`: null for the ledger's owner. */
  memberId: string | null;
  /** Their full display name: their own, or a stand-in ("You", "Owner", "Member"). */
  name: string;
  /** Whether `name` is one they set, not a stand-in. */
  named: boolean;
  /** Their Settings photo (a user-asset path), if they set one. */
  avatarUri: string | null;
  /** That photo's file on this phone, once it is there (synced photos arrive later). */
  avatarFileUri: string | null;
  role: 'owner' | 'member';
  /** This phone's own account. */
  isSelf: boolean;
  /**
   * Their colour: the disc behind their initial, and their part of a chart.
   * The same on every phone, and no one else in the ledger has it (up to six
   * people; see `buildLedgerPeople`).
   */
  color: string;
}

export interface LedgerPeople {
  ledgerId: string;
  /** The owner first, then this phone's own person, then the members by name. */
  people: LedgerPerson[];
  /** The person behind `member_id` (or `created_by`) on one of the ledger's entries. */
  personFor(memberId: string | null | undefined): LedgerPerson;
}

/**
 * A person's first name, for the compact line on a transaction row. A first
 * word that is only a symbol (an emoji) keeps the word after it, so "🐼 Panda"
 * stays "🐼 Panda" rather than a lone glyph.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (!first) return name;
  const symbolOnly = Array.from(first).length <= 2 && !/[\p{L}\p{N}]/u.test(first);
  return symbolOnly && words[1] ? `${first} ${words[1]}` : first;
}

/**
 * An address shown the way the Worker shows a nameless person to other
 * members (`maskEmail` in the cloud-sync Worker's ledgers.ts): `ne***@x.com`.
 */
export function maskEmail(email: string | null | undefined): string | null {
  const at = email?.indexOf('@') ?? -1;
  if (!email || at < 1) return null;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

// ---------------------------------------------------------------------------
// The store

interface ProfileRow {
  user_id: string;
  role: string;
  name: string | null;
  avatar_uri: string | null;
  /** When the person's profile was first written: about when they joined. */
  created_at?: string | null;
}

interface OwnProfile {
  name: string | null;
  avatarUri: string | null;
}

let cache: { ledgerId: string; value: LedgerPeople | null; signature: string } | null = null;
/** Survives an invalidation, so a read that finds nothing changed keeps the same object. */
let last: { ledgerId: string; value: LedgerPeople | null; signature: string } | null = null;
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
    }>('SELECT profile_name, profile_avatar_uri FROM settings WHERE deleted_at IS NULL LIMIT 1');
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
      `SELECT user_id, role, name, avatar_uri, created_at FROM ledger_profiles
       WHERE ledger_id = ? AND deleted_at IS NULL`,
      [ledgerId],
    );
  } catch {
    // Before migration 079 has run.
    return [];
  }
}

/**
 * The name this phone's account goes by: its Settings name, else its sign-in
 * name, else its address masked as the People page shows it, so two people
 * who never set a name still read differently.
 */
function ownName(own: OwnProfile): string | null {
  const user = getCachedSessionUser();
  return own.name ?? (user?.name.trim() || maskEmail(user?.email));
}

type AvatarResolver = (path: string | null) => string | null;

/** Longest name kept: a profile row comes from another phone, so it is bounded here. */
export const MAX_PERSON_NAME = 80;

/** A name trimmed and capped, or null when there is none. */
function cleanName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? Array.from(trimmed).slice(0, MAX_PERSON_NAME).join('') : null;
}

/** Only a profile photo's own folder: a synced row cannot point the avatar at another image. */
function cleanAvatar(path: string | null | undefined): string | null {
  return path && path.startsWith('avatars/') && !path.includes('..') ? path : null;
}

/** Pure but for `resolveAvatar`: the people of one shared ledger. Exported for tests. */
export function buildLedgerPeople(
  shared: SharedLedger,
  profiles: readonly ProfileRow[],
  own: OwnProfile,
  selfId: string | null,
  resolveAvatar: AvatarResolver = () => null,
): LedgerPeople {
  const memberFallback = I18n.t('shared_ledgers.member_fallback');
  // This phone's own person with no name anywhere: "You", not a stranger.
  const selfFallback = I18n.t('shared_ledgers.you');
  const person = (
    fields: Omit<LedgerPerson, 'avatarFileUri' | 'name' | 'named' | 'color'> & {
      name: string | null | undefined;
    },
    fallback: string,
  ): LedgerPerson => {
    const name = cleanName(fields.name);
    const avatarUri = cleanAvatar(fields.avatarUri);
    return {
      ...fields,
      name: name ?? fallback,
      named: name !== null,
      avatarUri,
      avatarFileUri: resolveAvatar(avatarUri),
      // Set below for the ledger's people; a stranger keeps their own.
      color: seedColor(fields.memberId ?? 'owner'),
    };
  };
  const selfIsOwner = shared.role === 'owner';
  // Who the owner is comes from the Worker (or, on the owner's phone, from
  // being it), never from the role a profile row claims: anyone in a shared
  // ledger can write those. Only an older Worker leaves the claim to go by.
  const ownerUserId = shared.ownerUserId ?? (selfIsOwner ? selfId : null);
  const ownerRow = ownerUserId
    ? profiles.find((row) => row.user_id === ownerUserId)
    : profiles.find((row) => row.role === 'owner');
  const owner = person(
    {
      memberId: null,
      name: selfIsOwner
        ? (own.name ?? ownerRow?.name ?? shared.ownerName)
        : (ownerRow?.name ?? shared.ownerName),
      avatarUri: selfIsOwner
        ? (own.avatarUri ?? ownerRow?.avatar_uri ?? null)
        : (ownerRow?.avatar_uri ?? null),
      role: 'owner',
      isSelf: selfIsOwner,
    },
    // Nobody named yet: still the one in charge, not "a member".
    selfIsOwner ? selfFallback : I18n.t('shared_ledgers.owner_badge'),
  );
  const members = new Map<string, LedgerPerson>();
  for (const row of profiles) {
    if (row === ownerRow || row.user_id === ownerUserId) continue;
    // Without the Worker's word, a row claiming to be the owner is left out
    // rather than listed twice.
    if (!ownerUserId && row.role === 'owner') continue;
    const isSelf = !selfIsOwner && row.user_id === selfId;
    members.set(
      row.user_id,
      person(
        {
          memberId: row.user_id,
          name: (isSelf ? own.name : null) ?? row.name,
          avatarUri: (isSelf ? own.avatarUri : null) ?? row.avatar_uri,
          role: 'member',
          isSelf,
        },
        isSelf ? selfFallback : memberFallback,
      ),
    );
  }
  // A member whose own profile has not been written or synced yet.
  if (!selfIsOwner && selfId && !members.has(selfId)) {
    members.set(
      selfId,
      person(
        {
          memberId: selfId,
          name: own.name,
          avatarUri: own.avatarUri,
          role: 'member',
          isSelf: true,
        },
        selfFallback,
      ),
    );
  }
  // This phone's own person right after the owner, then everyone else by name.
  const sorted = [...members.values()].sort(
    (a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name),
  );
  const ownerId = ownerUserId ?? ownerRow?.user_id ?? null;
  // Colours, in an order every phone agrees on: the owner (seeded by the
  // share, which every phone knows, even before it knows the owner's account),
  // then the members in the order they joined (their profile row's
  // `created_at`, the same on every phone once synced), then by account id.
  // Someone who joins later comes after everyone already there, so they never
  // take an existing person's colour. Compared by code unit, not
  // `localeCompare`, which follows the phone's language.
  const joinedAt = new Map(profiles.map((row) => [row.user_id, row.created_at ?? null]));
  const byCodeUnit = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  const byJoin = [...members.values()].sort((a, b) => {
    // A profile not synced yet (this phone's own, say) counts as the latest.
    const left = joinedAt.get(a.memberId ?? '') ?? '\uffff';
    const right = joinedAt.get(b.memberId ?? '') ?? '\uffff';
    return byCodeUnit(left, right) || byCodeUnit(a.memberId ?? '', b.memberId ?? '');
  });
  const colorOrder = [owner, ...byJoin];
  distinctSeedColors(
    colorOrder.map((entry) => entry.memberId ?? `owner:${shared.shareId}`),
  ).forEach((color, index) => {
    colorOrder[index]!.color = color;
  });
  // Someone only known from an entry (left before this phone saw them, or on
  // an older app): one object each, so rows showing them do not re-render.
  const unknown = new Map<string, LedgerPerson>();
  return {
    ledgerId: shared.ledgerId,
    people: [owner, ...sorted],
    personFor(memberId) {
      if (!memberId || memberId === ownerId) return owner;
      const known = members.get(memberId) ?? unknown.get(memberId);
      if (known) return known;
      const stranger = person(
        { memberId, name: null, avatarUri: null, role: 'member', isSelf: false },
        memberFallback,
      );
      unknown.set(memberId, stranger);
      return stranger;
    },
  };
}

function signatureOf(value: LedgerPeople | null): string {
  return value ? JSON.stringify([value.ledgerId, value.people]) : '';
}

/**
 * The people of `ledgerId` when it is shared, else null. Cached until
 * invalidated, and the same object again when a re-read finds nothing changed
 * (every sync invalidates; most change nobody), so the ledger's rows only
 * re-render for a real change.
 */
export function getLedgerPeople(ledgerId: string = getActiveLedgerId()): LedgerPeople | null {
  if (cache?.ledgerId === ledgerId) return cache.value;
  const shared = sharedLedgerFor(ledgerId);
  const own = readOwnProfile();
  const built = shared
    ? buildLedgerPeople(
        shared,
        readProfiles(ledgerId),
        { name: ownName(own), avatarUri: own.avatarUri },
        shared.userId ?? getCachedSessionUser()?.id ?? null,
        getProfileAvatarUri,
      )
    : null;
  const signature = signatureOf(built);
  const value = last?.ledgerId === ledgerId && last.signature === signature ? last.value : built;
  cache = { ledgerId, value, signature };
  last = cache;
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
  const name = cleanName(ownName(own));
  const db = getSQLite();
  let changed = 0;
  for (const ledger of ledgers) {
    const userId = ledger.userId ?? fallbackUserId;
    if (!userId) continue;
    // A ledger deleted here before the list caught up: nothing to write into.
    const live = db.getFirstSync('SELECT 1 FROM ledgers WHERE id = ? AND deleted_at IS NULL', [
      ledger.ledgerId,
    ]);
    if (!live) continue;
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

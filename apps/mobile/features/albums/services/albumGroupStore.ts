// A shared album's group on this phone: its members as the screens read
// them, and the local work when an album starts or stops being shared. No
// React here: Cloud Sync calls it between syncs.
// See README.md > Album members and shared albums.

import { deleteLedgerLocally } from '~/features/cloudSync/services/ledgerChannels';
import { sharedLedgerFor } from '~/features/cloudSync/services/sharedLedgerStore';
import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import { parseAlbumPeople } from '~/lib/repositories/mappers';
import type { AlbumMember } from '~/types';
import { nowIso } from '~/utils/id';

import { cleanPersonName, personNameKey } from '../lib/albumPeople';

const cache = new Map<string, AlbumMember[]>();
const listeners = new Set<() => void>();
const NO_MEMBERS: AlbumMember[] = [];

/** A group's rows changed (a sync, an edit, a share or its end): readers look again. */
export function notifyAlbumGroups(): void {
  cache.clear();
  for (const listener of listeners) listener();
}

export function subscribeAlbumGroups(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A group's live members. The same array until something changes, so a hook can hold it. */
export function listGroupMembers(groupId: string): AlbumMember[] {
  const known = cache.get(groupId);
  if (known) return known;
  let members: AlbumMember[];
  try {
    members = albumGroupsRepository.listMembers(groupId);
  } catch {
    // Before migration 090 has run.
    members = NO_MEMBERS;
  }
  cache.set(groupId, members);
  return members;
}

interface AlbumRow {
  id: string;
  ledger_id: string;
  name: string;
  split_with_json: string | null;
  deleted_at: string | null;
}

function albumRow(albumId: string): AlbumRow | null {
  return getSQLite().getFirstSync<AlbumRow>(
    'SELECT id, ledger_id, name, split_with_json, deleted_at FROM albums WHERE id = ?',
    [albumId],
  );
}

/** Whether this phone has the album (in any ledger), deleted or not. */
export function albumState(albumId: string): 'live' | 'deleted' | 'none' {
  const row = albumRow(albumId);
  return !row ? 'none' : row.deleted_at ? 'deleted' : 'live';
}

/**
 * The album a group this phone joined shows as: made here, with the group's
 * id, in a ledger of the user's own (the open one, unless that is a shared
 * ledger, where an album is never split). Left alone when it is already here,
 * so two phones of one person agree on it once their own data syncs.
 */
export function ensureLocalAlbum(share: { ledgerId: string; name: string | null }): void {
  if (albumRow(share.ledgerId)) return;
  const open = getActiveLedgerId();
  const ledgerId = sharedLedgerFor(open) ? DEFAULT_LEDGER_ID : open;
  const now = nowIso();
  const db = getSQLite();
  const top = db.getFirstSync<{ top: number | null }>(
    'SELECT MIN(sort_order) AS top FROM albums WHERE ledger_id = ? AND deleted_at IS NULL',
    [ledgerId],
  );
  db.runSync(
    `INSERT INTO albums (id, ledger_id, name, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [
      share.ledgerId,
      ledgerId,
      cleanPersonName(share.name ?? '') || 'Album',
      (top?.top ?? 0) - 1,
      now,
      now,
    ],
  );
}

/**
 * An album just shared from this phone: its group starts with the user and
 * the people the album was split with, who keep their ids, so the shares
 * already on the album's bills stay theirs.
 */
export function beginAlbumGroup(albumId: string, self: { userId: string; name: string }): void {
  const album = albumRow(albumId);
  if (!album) return;
  const existing = albumGroupsRepository.listAllMembers(albumId);
  const ids = new Set(existing.map((member) => member.id));
  if (!existing.some((member) => member.userId === self.userId && !member.deletedAt)) {
    albumGroupsRepository.createMember(albumId, {
      name: cleanPersonName(self.name) || 'Me',
      userId: self.userId,
      sortOrder: 0,
    });
  }
  parseAlbumPeople(album.split_with_json).forEach((person, index) => {
    if (ids.has(person.id)) return;
    albumGroupsRepository.createMember(albumId, {
      id: person.id,
      name: person.name,
      sortOrder: index + 1,
    });
  });
  notifyAlbumGroups();
}

/**
 * An album that is no longer shared on this phone (sharing stopped, the user
 * left or was removed, or signed out): it goes on as an album of the user's
 * own, split with the same people by name. The group's rows leave the phone
 * without recording deletions, since the group is not this phone's to delete;
 * the user's own entries for its bills stay, as ordinary split bills.
 * `selfUserId`: the account this phone was in the group as.
 */
export function releaseAlbumGroup(groupId: string, selfUserId: string | null): void {
  const db = getSQLite();
  const now = nowIso();
  const album = albumRow(groupId);
  if (album) {
    const seen = new Set<string>();
    const people = albumGroupsRepository
      .listMembers(groupId)
      .filter((member) => !selfUserId || member.userId !== selfUserId)
      .filter((member) => {
        const key = personNameKey(member.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((member) => ({ id: member.id, name: member.name }));
    // Only when the group's members were here: a phone that never took them
    // down keeps the people the album already had.
    if (people.length) {
      db.runSync('UPDATE albums SET split_with_json = ?, updated_at = ? WHERE id = ?', [
        JSON.stringify(people),
        now,
        groupId,
      ]);
    }
  }
  db.runSync(
    'UPDATE transactions SET album_group_id = NULL, updated_at = ? WHERE album_group_id = ?',
    [now, groupId],
  );
  deleteLedgerLocally(groupId);
  notifyAlbumGroups();
}

// Changes to a shared album's group, sent to the Worker. The group's database
// is written by the Worker alone (apps/cloudflare/workers/cloud-sync/src/
// albumGroups.ts): it checks each change, stamps it with the account that made
// it and writes it beside an entry in the album's activity log. The rows a
// change asks for come from ../lib/groupRows.ts; the rows the Worker wrote come
// back and are applied at once, and the caller then brings the user's own
// entries in step (`projectGroup`). Nothing here writes the group locally.
// See README.md > Album members and shared albums.

import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import { sharedLedgerSync } from '~/features/cloudSync/services/sharedLedgerSync';
import { I18n } from '~/lib/i18n';

import type { GroupRowWrite } from '../lib/groupRows';

/**
 * Sends a change and applies what the Worker wrote. `reason: 'close_even'`
 * marks payments the app records by itself to close an even group, so the
 * log says so. `media`: images the rows name, uploaded on the album's next
 * sync. Throws when it did not go (offline, signed out, refused).
 */
export async function writeGroup(
  groupId: string,
  rows: readonly GroupRowWrite[],
  opts: { reason?: 'close_even'; media?: string[] } = {},
): Promise<void> {
  if (!rows.length) return;
  await sharedLedgerSync.writeAlbumGroup(
    groupId,
    { action: 'write', rows: [...rows], reason: opts.reason },
    opts.media,
  );
}

/** Puts the user on the album's list as themselves (joining, or starting it). */
export async function joinGroup(groupId: string, name: string): Promise<void> {
  await sharedLedgerSync.writeAlbumGroup(groupId, { action: 'join', name });
}

/** Why a change to a shared album did not go, in words. */
export function groupWriteMessage(error: unknown): string {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'network') return I18n.t('albums.write.offline');
    if (error.code === 'not_member' || error.code === 'not_found') {
      return I18n.t('albums.write.not_member');
    }
    if (error.code === 'unauthorized') return I18n.t('albums.write.signed_out');
  }
  return I18n.t('albums.write.failed');
}

/** Whether a failed change is worth reporting: not the network, a sign-out or a refusal. */
export function isExpectedGroupWriteError(error: unknown): boolean {
  return (
    error instanceof CloudSyncApiError &&
    ['network', 'not_member', 'not_found', 'unauthorized', 'name_taken'].includes(error.code)
  );
}

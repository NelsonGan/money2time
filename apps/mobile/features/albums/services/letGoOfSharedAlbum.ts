import type { CloudSyncContextValue } from '~/features/cloudSync/CloudSyncContext';
import { leaveAskingFirst } from '~/features/sharedLedgers/lib/confirmLeave';

/**
 * The user stops being in a shared album (README: Album members and shared
 * albums > Leaving and stopping): a member leaves it, asking first when
 * entries not sent yet would be lost; its owner ends it for everyone, which
 * offline still ends it here and tells the Worker after the next sign-in.
 * Either way the album stays on the phone, frozen (`releaseAlbumGroup`).
 * Resolves false when the user chose to stay. The People page's Leave album
 * and End album, and deleting a shared album, go through this.
 */
export async function letGoOfSharedAlbum(
  sync: Pick<CloudSyncContextValue, 'leaveLedger' | 'stopSharingLedger'>,
  album: { id: string; name: string },
  role: 'owner' | 'member',
): Promise<boolean> {
  if (role === 'owner') {
    await sync.stopSharingLedger(album.id, { whenUnreachable: 'local' });
    return true;
  }
  return leaveAskingFirst((opts) => sync.leaveLedger(album.id, opts), album.name);
}

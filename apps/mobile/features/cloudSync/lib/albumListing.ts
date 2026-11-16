/**
 * What a read of the Worker's list does with one shared album the user is in
 * there (`SharedLedgerSync.refreshList`):
 *
 * - `skip`: never this phone's, or not under this share: left alone.
 * - `keep`: synced, and the album it shows as is made, or brought back when it
 *   was deleted here (`ensureLocalAlbum`): joined again, on the website say,
 *   after deleting it in the app.
 * - `stop` / `leave`: the album was deleted while the Worker could not be
 *   told, so its deletion is finished now instead of the album coming back:
 *   its owner ends it, a member leaves it. That is an album still synced here
 *   whose deletion came down from another phone of the user's, or one its
 *   owner deleted while signed out. A member who deleted one while signed out
 *   is left by the pending action that deletion queued
 *   (`SharedLedgerSync.albumDeletedHere`), never by this, which cannot tell
 *   that from joining again.
 */
export type AlbumListing = 'skip' | 'keep' | 'stop' | 'leave';

export function albumListing(input: {
  role: 'owner' | 'member';
  /** This phone syncs the album: under this share (`known`) or another one. */
  known: 'this_share' | 'other_share' | null;
  /** Its id names one of this phone's ledgers, or an album of another ledger. */
  foreignId: boolean;
  /** The album is deleted on this phone. */
  deleted: boolean;
}): AlbumListing {
  if (input.known === 'other_share') return 'skip';
  if (!input.known && input.foreignId) return 'skip';
  if (input.deleted && (input.known || input.role === 'owner')) {
    return input.role === 'owner' ? 'stop' : 'leave';
  }
  return 'keep';
}

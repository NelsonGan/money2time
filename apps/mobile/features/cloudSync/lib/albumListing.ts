/**
 * What a read of the Worker's list does with one shared album the user is in
 * there (`SharedLedgerSync.refreshList`):
 *
 * - `skip`: never this phone's, or not under this share: left alone.
 * - `keep`: synced, and the album it shows as is made, or brought back when it
 *   was deleted here before the user joined it again (`ensureLocalAlbum`).
 * - `stop` / `leave`: the album was deleted since the user came into it, while
 *   the Worker could not be told (offline, signed out, or on another phone of
 *   theirs whose deletion came down first): the deletion is finished, rather
 *   than the album coming back. Its owner ends it, a member leaves it.
 *
 * Which came last is read from the Worker's `joinedAt` (a member's latest
 * join, the owner's sharing it) against the album's `deleted_at` here. A
 * Worker from before `joinedAt` leaves only what it can tell: an album still
 * synced here, or one its owner deleted (an owner never joins again).
 */
export type AlbumListing = 'skip' | 'keep' | 'stop' | 'leave';

export function albumListing(input: {
  role: 'owner' | 'member';
  /** This phone syncs the album: under this share (`this_share`) or another one. */
  known: 'this_share' | 'other_share' | null;
  /** Its id names one of this phone's ledgers, or an album of another ledger. */
  foreignId: boolean;
  /** When the album was deleted on this phone (ISO), or null. */
  deletedAt: string | null;
  /** When the user came into the share, from the Worker (ms); absent from an older Worker. */
  joinedAt?: number;
}): AlbumListing {
  if (input.known === 'other_share') return 'skip';
  if (!input.known && input.foreignId) return 'skip';
  if (input.deletedAt === null) return 'keep';
  const finish = input.role === 'owner' ? 'stop' : 'leave';
  const deletedAt = Date.parse(input.deletedAt);
  if (typeof input.joinedAt === 'number' && Number.isFinite(deletedAt)) {
    return deletedAt > input.joinedAt ? finish : 'keep';
  }
  return input.known || input.role === 'owner' ? finish : 'keep';
}

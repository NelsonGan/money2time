/**
 * Albums in the category lists (README: Key patterns > Albums): an expense in
 * an album counts under the album's own line, never under its category too.
 * A line's id is the album's, so it never takes a category's. Pure.
 */

const LINE_PREFIX = 'album:';

export const albumLineId = (albumId: string) => `${LINE_PREFIX}${albumId}`;

export function albumIdOfLine(id: string | null | undefined): string | null {
  return id?.startsWith(LINE_PREFIX) ? id.slice(LINE_PREFIX.length) : null;
}

/** The first letter of an album's name, its icon while it has no cover. */
export function albumInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '•';
}

type LinkRow = Record<string, unknown> & {
  id?: unknown;
  album_id?: unknown;
  transaction_id?: unknown;
};

/**
 * An older version's album links as this one keeps them (migration 094): an
 * entry is in one album, so a link to an album that is deleted or missing,
 * and every live link of an entry but one, are marked deleted (`now`). The
 * one kept is the link to the entry's shared album when it is a group's bill
 * (`album_group_id`), else the lowest id, as on every phone. For a restore.
 */
export function oneLinkPerEntry<T extends LinkRow>(
  links: readonly T[],
  liveAlbumIds: ReadonlySet<string>,
  groupOf: ReadonlyMap<string, string>,
  now: string,
): T[] {
  const kept = new Map<string, T>();
  const better = (a: T, b: T, group: string | undefined) => {
    if (group && (a.album_id === group) !== (b.album_id === group)) return a.album_id === group;
    return String(a.id) < String(b.id);
  };
  for (const link of links) {
    if (link.deleted_at != null || !liveAlbumIds.has(String(link.album_id))) continue;
    const transactionId = String(link.transaction_id);
    const known = kept.get(transactionId);
    if (!known || better(link, known, groupOf.get(transactionId))) kept.set(transactionId, link);
  }
  const live = new Set(kept.values());
  return links.map((link) =>
    link.deleted_at != null || live.has(link)
      ? link
      : { ...link, deleted_at: now, updated_at: now },
  );
}

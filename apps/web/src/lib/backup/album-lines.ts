/**
 * Albums in the category lists, as the app has them (README: Key patterns >
 * Albums): an entry is in one album at most, and a spending row in an album
 * counts under the album's own line, never under its category too. Pure, so
 * the tests read it.
 */

const LINE_PREFIX = "album:";

/** An album's line's id, which no category's id takes. */
export const albumLineId = (albumId: string) => `${LINE_PREFIX}${albumId}`;

export function albumIdOfLine(id: string | null | undefined): string | null {
  return id?.startsWith(LINE_PREFIX) ? id.slice(LINE_PREFIX.length) : null;
}

/**
 * The album each entry is in, from the live links to live albums. An older
 * app could put an entry in two; the link with the lower id stands, the one
 * every phone keeps (the app's migration 094 and Cloud Sync's unique rule).
 */
export function albumOfEntries(links: readonly { id: string; album_id: string; transaction_id: string }[]): Map<string, string> {
  const best = new Map<string, { id: string; albumId: string }>();
  for (const link of links) {
    const known = best.get(link.transaction_id);
    if (!known || link.id < known.id) best.set(link.transaction_id, { id: link.id, albumId: link.album_id });
  }
  return new Map([...best].map(([transactionId, { albumId }]) => [transactionId, albumId]));
}

/** The line a row counts under in a category list: its album's for spending in one, else its top-level category ("__none" without one). */
export function lineOf(tx: { spending: boolean; albumId?: string; parentId: string | null }): string {
  return tx.spending && tx.albumId ? albumLineId(tx.albumId) : (tx.parentId ?? "__none");
}

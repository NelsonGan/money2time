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

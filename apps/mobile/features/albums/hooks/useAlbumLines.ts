import { useMemo } from 'react';

import { useApp } from '~/context/AppContext';
import type { Album } from '~/types';

export interface AlbumLines {
  /** The album an entry is in, or null: an expense there counts under the album's line. */
  albumOf: (transactionId: string) => Album | null;
  albumById: ReadonlyMap<string, Album>;
}

/**
 * Which album each entry of the open ledger is in, for the category lists
 * (README: Key patterns > Albums). Looked up again whenever the albums or
 * what is in them change.
 */
export function useAlbumLines(): AlbumLines {
  const { albums, getAlbumIdByTransaction } = useApp();
  return useMemo(() => {
    const byTransaction = getAlbumIdByTransaction();
    const albumById = new Map(albums.map((album) => [album.id, album]));
    return {
      albumOf: (transactionId) => {
        const albumId = byTransaction.get(transactionId);
        return albumId ? (albumById.get(albumId) ?? null) : null;
      },
      albumById,
    };
  }, [albums, getAlbumIdByTransaction]);
}

import { useMemo } from 'react';

import type { AlbumBillRowInput } from '~/context/AppContext';
import { useApp } from '~/context/AppContext';
import { useSharedAlbums } from '~/features/sharedLedgers/hooks/useSharedLedgers';

/** A row of the split editor, as far as a group's bill needs it. */
interface DraftRow {
  personName: string;
  amount: string;
  isSelf: boolean;
  isPayer?: boolean;
  albumMemberId?: string | null;
}

/** The split editor's rows as `saveAlbumBill` takes them. */
export function albumBillRows(rows: readonly DraftRow[]): AlbumBillRowInput[] {
  return rows.map((row) => ({
    personName: row.personName.trim() || null,
    amount: Number(row.amount) || 0,
    isSelf: row.isSelf,
    isPayer: !!row.isPayer,
    albumMemberId: row.albumMemberId ?? null,
  }));
}

/**
 * The shared album a split bill is saved into: the one the entry already
 * belongs to (`transactionId`), else for a new entry the album it is being
 * added to (`albumId`, the active album when not given). Null when that
 * album is not shared on this phone.
 */
export function useAlbumBillTarget(transactionId?: string, albumId?: string): string | null {
  const { activeAlbumId, getAlbumTransactionIds, albums } = useApp();
  const shares = useSharedAlbums();
  const newEntryAlbumId = albumId ?? activeAlbumId;
  return useMemo(() => {
    if (!shares.length) return null;
    if (!transactionId) {
      return shares.find((share) => share.ledgerId === newEntryAlbumId)?.ledgerId ?? null;
    }
    return (
      shares.find((share) => getAlbumTransactionIds(share.ledgerId).includes(transactionId))
        ?.ledgerId ?? null
    );
    // `albums` changes when an album's entries do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums, getAlbumTransactionIds, newEntryAlbumId, shares, transactionId]);
}

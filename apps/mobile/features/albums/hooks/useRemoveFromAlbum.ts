import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

/**
 * Takes entries out of an album, then runs `after`. A shared album's bill
 * leaves its group with it, for everyone, so that is asked first; with
 * `confirm`, entries of the user's own are asked about too (the album page's
 * selection, where nothing else said what Remove does).
 */
export function useRemoveFromAlbum(albumId: string, { confirm = false } = {}) {
  const { getAlbumTransactions, removeTransactionsFromAlbum } = useApp();
  return useCallback(
    (ids: string[], after: () => void) => {
      const remove = () => {
        removeTransactionsFromAlbum(albumId, ids);
        after();
      };
      const taken = new Set(ids);
      const shared = getAlbumTransactions(albumId).some(
        (tx) => tx.albumGroupId === albumId && taken.has(tx.id),
      );
      if (!shared && !confirm) {
        remove();
        return;
      }
      Alert.alert(
        I18n.t('albums.remove_from_album'),
        shared
          ? I18n.t('albums.bill.remove_shared')
          : I18n.t('albums.remove_selected_body', { count: ids.length }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          { text: I18n.t('common.remove'), style: 'destructive', onPress: remove },
        ],
      );
    },
    [albumId, confirm, getAlbumTransactions, removeTransactionsFromAlbum],
  );
}

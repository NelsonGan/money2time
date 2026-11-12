import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

/**
 * Takes entries out of an album, then runs `after`. A shared album's bill
 * leaves its group with it, for everyone, so that is asked first.
 */
export function useRemoveFromAlbum(albumId: string) {
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
      if (!shared) {
        remove();
        return;
      }
      Alert.alert(I18n.t('albums.remove_from_album'), I18n.t('albums.bill.remove_shared'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        { text: I18n.t('common.remove'), style: 'destructive', onPress: remove },
      ]);
    },
    [albumId, getAlbumTransactions, removeTransactionsFromAlbum],
  );
}

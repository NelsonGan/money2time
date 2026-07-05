import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FatButton, SettingsHeader } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

import { AlbumMonthPicker } from '../components/AlbumMonthPicker';

interface AddAlbumTransactionsScreenProps {
  albumId: string;
  onClose: () => void;
}

/** General month-pager picker for adding (or removing) transactions to an album. */
export function AddAlbumTransactionsScreen({ albumId, onClose }: AddAlbumTransactionsScreenProps) {
  const { getAlbumTransactionIds, addTransactionsToAlbum, removeTransactionsFromAlbum } = useApp();
  const insets = useSafeAreaInsets();

  const initialIds = useMemo(
    () => getAlbumTransactionIds(albumId),
    [albumId, getAlbumTransactionIds],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  const handleSave = useCallback(() => {
    const before = new Set(initialIds);
    const after = new Set(selectedIds);
    const toAdd = selectedIds.filter((id) => !before.has(id));
    const toRemove = initialIds.filter((id) => !after.has(id));
    if (toAdd.length > 0) addTransactionsToAlbum(albumId, toAdd);
    if (toRemove.length > 0) removeTransactionsFromAlbum(albumId, toRemove);
    onClose();
  }, [
    albumId,
    addTransactionsToAlbum,
    initialIds,
    onClose,
    removeTransactionsFromAlbum,
    selectedIds,
  ]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          title={I18n.t('albums.add_transactions_title')}
          onBack={onClose}
        />

        <AlbumMonthPicker selectedIds={selectedIds} onChange={setSelectedIds} />

        <View
          className="border-t border-border/30 bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <FatButton
            label={`${I18n.t('common.save')} · ${I18n.t('albums.transactions_selected', {
              count: selectedIds.length,
            })}`}
            onPress={handleSave}
            haptic="success"
          />
        </View>
      </TabletContentContainer>
    </View>
  );
}

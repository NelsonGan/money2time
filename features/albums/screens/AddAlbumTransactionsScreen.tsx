import { X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FatButton, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { AlbumMonthPicker } from '../components/AlbumMonthPicker';

interface AddAlbumTransactionsScreenProps {
  albumId: string;
  onClose: () => void;
}

/** General month-pager picker for adding (or removing) transactions to an album. */
export function AddAlbumTransactionsScreen({ albumId, onClose }: AddAlbumTransactionsScreenProps) {
  const { getAlbumTransactionIds, addTransactionsToAlbum, removeTransactionsFromAlbum } = useApp();
  const themeColors = useThemeColors();
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
        <View className="flex-row items-center gap-2 px-3 pb-0.5 pt-1.5">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            className="h-9 w-9 items-center justify-center rounded-full border border-border/30 bg-card"
          >
            <X size={18} color={themeColors.textMuted} />
          </Pressable>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {I18n.t('albums.add_transactions_title')}
            </Text>
          </View>
          <View className="rounded-full border border-border/40 bg-secondary/60 px-2.5 py-1">
            <Text variant="label" tone="muted">
              {I18n.t('albums.transactions_selected', { count: selectedIds.length })}
            </Text>
          </View>
        </View>

        <AlbumMonthPicker selectedIds={selectedIds} onChange={setSelectedIds} />

        <View
          className="border-t border-border/30 bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <FatButton label={I18n.t('common.save')} onPress={handleSave} haptic="success" />
        </View>
      </TabletContentContainer>
    </View>
  );
}

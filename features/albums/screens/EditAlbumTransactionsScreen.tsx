import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FatButton, SettingsHeader } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList } from '~/features/transactions/components/ActivityTransactionList';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations } from '~/types';

interface EditAlbumTransactionsScreenProps {
  albumId: string;
  onClose: () => void;
}

/** Lists the album's current transactions; lets the user remove a selection. */
export function EditAlbumTransactionsScreen({
  albumId,
  onClose,
}: EditAlbumTransactionsScreenProps) {
  const {
    settings,
    getAlbumTransactions,
    removeTransactionsFromAlbum,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
  } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const albumTransactions = useMemo(
    () => getAlbumTransactions(albumId),
    [albumId, getAlbumTransactions],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleOne = useCallback((transaction: TransactionWithRelations) => {
    setSelectedIds((prev) =>
      prev.includes(transaction.id)
        ? prev.filter((id) => id !== transaction.id)
        : [...prev, transaction.id],
    );
  }, []);
  const toggleDay = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      const allSelected = ids.every((id) => set.has(id));
      if (allSelected) ids.forEach((id) => set.delete(id));
      else ids.forEach((id) => set.add(id));
      return [...set];
    });
  }, []);

  const handleRemove = useCallback(() => {
    if (selectedIds.length === 0) return;
    removeTransactionsFromAlbum(albumId, selectedIds);
    onClose();
  }, [albumId, onClose, removeTransactionsFromAlbum, selectedIds]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          title={I18n.t('albums.edit_transactions_title')}
          subtitle={I18n.t('albums.transaction_count', { count: albumTransactions.length })}
          onBack={onClose}
        />

        <View className="flex-1">
          <ActivityTransactionList
            transactions={albumTransactions}
            displaySettings={settings}
            getDisplayValueForTransaction={getDisplayValueForTransaction}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
            onTransactionPress={toggleOne}
            onToggleDaySelection={toggleDay}
            selectedTransactionIds={selectedIds}
            selectionMode
            emptyTitle={I18n.t('albums.no_transactions_title')}
            emptyMessage={I18n.t('albums.no_transactions_message')}
            contentPaddingBottom={selectedIds.length > 0 ? 96 : insets.bottom + 24}
            disableItemAnimations
            compactItems
          />
        </View>

        {selectedIds.length > 0 ? (
          <View
            className="border-t border-border/30 bg-background px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <FatButton
              label={`${I18n.t('albums.remove_from_album')} (${selectedIds.length})`}
              onPress={handleRemove}
              color={themeColors.error}
              haptic="warning"
            />
          </View>
        ) : null}
      </TabletContentContainer>
    </View>
  );
}

import { FlashList } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, TextInput, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Text } from '~/components/ui';
import {
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { useApp, useTransactions } from '~/context/AppContext';
import { AlbumDateRangeFields } from '~/features/albums/components/AlbumDateRangeFields';
import { ReceiptViewerModal } from '~/features/transactions/components/editor';
import { ActivitySearchRow } from '~/features/transactions/components/ActivitySearchRow';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { deleteReceiptImage, getReceiptUri, saveReceiptImage } from '~/services/userAssets';
import type { TransactionWithRelations } from '~/types';
import {
  dayKeyFromIsoLocal,
  formatAmount,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromIsoLocal,
  parseMonthKey,
} from '~/utils/formatters';

import { ReceiptCard } from '../components/ReceiptCard';

interface ReceiptsScreenProps {
  onBack: () => void;
  onOpenEditTransaction: (transaction: TransactionWithRelations) => void;
}

const PAGE_SIZE = 20;

interface ReceiptTile {
  transaction: TransactionWithRelations;
  /** Resolved once here (off the recycle path) so the card renders no sync FS stat. */
  receiptFileUri: string | null;
}

type ReceiptRow =
  | { kind: 'header'; id: string; monthLabel: string }
  // Up to two tiles rendered side by side; headers span the full width.
  | { kind: 'row'; id: string; tiles: ReceiptTile[] };

export function ReceiptsScreen({ onBack, onOpenEditTransaction }: ReceiptsScreenProps) {
  const { settings, getDisplayValueForTransaction, updateTransaction } = useApp();
  const { transactions } = useTransactions();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const locale = I18n.locale ?? 'en';

  const searchInputRef = useRef<TextInput | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewerTxId, setViewerTxId] = useState<string | null>(null);

  // The receipt viewer reads the live transaction from the reactive list so its
  // image updates after a Replace and it closes itself after a Remove.
  const viewerTx = useMemo(
    () => (viewerTxId ? (transactions.find((tx) => tx.id === viewerTxId) ?? null) : null),
    [transactions, viewerTxId],
  );
  const viewerFileUri = viewerTx ? getReceiptUri(viewerTx.receiptUri) : null;

  const openReceiptViewer = useCallback((tx: TransactionWithRelations) => {
    setViewerTxId(tx.id);
  }, []);

  // Attach a picked image to an already-persisted transaction, then delete the
  // old file. Eager (no draft/commit machinery — the row is already saved).
  const pickReceiptFrom = useCallback(
    async (source: 'camera' | 'library', tx: TransactionWithRelations) => {
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            I18n.t('accounts.logo.permission_title'),
            I18n.t('accounts.logo.permission_message'),
          );
          return;
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (result.canceled || !result.assets?.[0]) return;
        const previous = tx.receiptUri;
        const next = saveReceiptImage(result.assets[0].uri);
        updateTransaction(tx.id, { receiptUri: next });
        if (previous && previous !== next) deleteReceiptImage(previous);
      } catch {
        Alert.alert(I18n.t('accounts.logo.upload_failed'));
      }
    },
    [updateTransaction],
  );

  const handleReplaceReceipt = useCallback(() => {
    const tx = viewerTx;
    if (!tx) return;
    void triggerHaptic('selection');
    Alert.alert(I18n.t('transactions.editor.receipt.label'), undefined, [
      {
        text: I18n.t('transactions.editor.receipt.take_photo'),
        onPress: () => void pickReceiptFrom('camera', tx),
      },
      {
        text: I18n.t('transactions.editor.receipt.choose_from_library'),
        onPress: () => void pickReceiptFrom('library', tx),
      },
      { text: I18n.t('common.cancel'), style: 'cancel' },
    ]);
  }, [pickReceiptFrom, viewerTx]);

  const handleRemoveReceipt = useCallback(() => {
    const tx = viewerTx;
    if (!tx) return;
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('transactions.editor.receipt.remove_title'),
      I18n.t('transactions.editor.receipt.remove_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('transactions.editor.receipt.remove'),
          style: 'destructive',
          onPress: () => {
            const previous = tx.receiptUri;
            updateTransaction(tx.id, { receiptUri: null });
            if (previous) deleteReceiptImage(previous);
            setViewerTxId(null);
          },
        },
      ],
    );
  }, [updateTransaction, viewerTx]);

  // Debounce the search term so filtering doesn't run on every keystroke.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setSearch('');
      return;
    }
    const handle = setTimeout(() => setSearch(trimmed), 180);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Every transaction with a receipt, filtered by search + date range, newest first.
  // Search matches the note plus the category name, so a card shown under its
  // category title (when the note is empty) is still findable by that title.
  const filteredReceipts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = transactions.filter((tx) => {
      if (!tx.receiptUri) return false;
      if (query) {
        const haystack = `${tx.note ?? ''}\n${tx.categoryName ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (startDate || endDate) {
        const dayKey = dayKeyFromIsoLocal(tx.date);
        if (startDate && dayKey < startDate) return false;
        if (endDate && dayKey > endDate) return false;
      }
      return true;
    });
    result.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return result;
  }, [transactions, search, startDate, endDate]);

  // Restart paging from the top whenever the active filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, startDate, endDate]);

  const hasMore = visibleCount < filteredReceipts.length;

  // Windowed slice → month-grouped rows: a full-width header per month change,
  // then rows of up to two tiles each (the 2-column grid).
  const rows = useMemo(() => {
    const visible = filteredReceipts.slice(0, visibleCount);
    const built: ReceiptRow[] = [];
    let currentMonthKey: string | null = null;
    let pending: ReceiptTile[] = [];
    let rowSeq = 0;
    const flushRow = () => {
      if (pending.length === 0) return;
      built.push({ kind: 'row', id: `row-${currentMonthKey}-${rowSeq}`, tiles: pending });
      rowSeq += 1;
      pending = [];
    };
    for (const transaction of visible) {
      const monthKey = monthKeyFromIsoLocal(transaction.date);
      if (monthKey !== currentMonthKey) {
        flushRow();
        currentMonthKey = monthKey;
        rowSeq = 0;
        const monthDate = parseMonthKey(monthKey);
        built.push({
          kind: 'header',
          id: `header-${monthKey}`,
          monthLabel: monthDate ? formatMonthYearLabel(monthDate, locale) : monthKey,
        });
      }
      pending.push({ transaction, receiptFileUri: getReceiptUri(transaction.receiptUri) });
      if (pending.length === 2) flushRow();
    }
    flushRow();
    return built;
  }, [filteredReceipts, visibleCount, locale]);

  const handleEndReached = useCallback(() => {
    setVisibleCount((count) => (count < filteredReceipts.length ? count + PAGE_SIZE : count));
  }, [filteredReceipts.length]);

  const isTimeMode = settings.displayMode === 'time';

  const renderItem = useCallback(
    ({ item }: { item: ReceiptRow }) => {
      if (item.kind === 'header') {
        return (
          <Text variant="label" tone="muted" className="px-1 pb-2 pt-4 uppercase">
            {item.monthLabel}
          </Text>
        );
      }
      return (
        <View className="flex-row gap-3 pb-3">
          {item.tiles.map((tile) => {
            const displayValue = getDisplayValueForTransaction(tile.transaction);
            const isIncome = tile.transaction.type === 'income';
            // Expenses render as a negative amount (no forced "+" sign); income positive.
            const amountText = isTimeMode
              ? formatHours(displayValue)
              : formatAmount(isIncome ? Math.abs(displayValue) : -Math.abs(displayValue), settings);
            return (
              <View key={tile.transaction.id} className="flex-1">
                <ReceiptCard
                  transaction={tile.transaction}
                  receiptFileUri={tile.receiptFileUri}
                  amountText={amountText}
                  isTimeMode={isTimeMode}
                  isIncome={isIncome}
                  onOpenReceipt={openReceiptViewer}
                  onOpenTransaction={onOpenEditTransaction}
                />
              </View>
            );
          })}
          {/* Keep a lone trailing tile at half width. */}
          {item.tiles.length === 1 ? <View className="flex-1" /> : null}
        </View>
      );
    },
    [getDisplayValueForTransaction, isTimeMode, settings, openReceiptViewer, onOpenEditTransaction],
  );

  const isFiltering = search.trim().length > 0 || startDate !== null || endDate !== null;

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={I18n.t('receipts.title')} />

      <View className="gap-2.5 px-5 pb-2">
        <ActivitySearchRow
          inputRef={searchInputRef}
          visible
          autoFocus={false}
          value={searchInput}
          onChangeText={setSearchInput}
          onClose={() => setSearchInput('')}
        />
        <AlbumDateRangeFields
          startDate={startDate}
          endDate={endDate}
          onChangeStart={setStartDate}
          onChangeEnd={setEndDate}
        />
      </View>

      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
        renderItem={renderItem}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, ...bottomNavInset }}
        ListEmptyComponent={
          <View className="pt-10">
            <EmptyState
              mascotMood={isFiltering ? 'curious' : 'sleepy'}
              title={isFiltering ? I18n.t('receipts.no_matches') : I18n.t('receipts.empty_title')}
              message={isFiltering ? undefined : I18n.t('receipts.empty_message')}
            />
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <View className="items-center py-5">
              <ActivityIndicator color={themeColors.primary} />
            </View>
          ) : null
        }
      />

      <ReceiptViewerModal
        visible={viewerTx !== null}
        fileUri={viewerFileUri}
        onClose={() => setViewerTxId(null)}
        onReplace={handleReplaceReceipt}
        onRemove={handleRemoveReceipt}
      />
    </SettingsPageLayout>
  );
}

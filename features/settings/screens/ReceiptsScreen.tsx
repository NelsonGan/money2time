import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { ClayIcon, Text } from '~/components/ui';
import {
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { useApp, useTransactions } from '~/context/AppContext';
import { AlbumDateRangeFields } from '~/features/albums/components/AlbumDateRangeFields';
import { ActivitySearchRow } from '~/features/transactions/components/ActivitySearchRow';
import { ReceiptViewerModal } from '~/features/transactions/components/editor';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import { deleteReceiptImage, getReceiptUri } from '~/services/userAssets';
import type { TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';
import {
  dayKeyFromIsoLocal,
  formatAmount,
  formatHours,
  formatMonthYearLabel,
  parseMonthKey,
} from '~/utils/formatters';

import { ReceiptCard } from '../components/ReceiptCard';

interface ReceiptsScreenProps {
  onBack: () => void;
  onOpenEditTransaction: (transaction: TransactionWithRelations) => void;
  onOpenSettings: () => void;
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

export function ReceiptsScreen({
  onBack,
  onOpenEditTransaction,
  onOpenSettings,
}: ReceiptsScreenProps) {
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
  const viewerFileUri = useMemo(
    () => (viewerTx ? getReceiptUri(viewerTx.receiptUri) : null),
    [viewerTx],
  );

  const openReceiptViewer = useCallback((tx: TransactionWithRelations) => {
    setViewerTxId(tx.id);
  }, []);

  // Attach a picked image to an already-persisted transaction, then delete the
  // old file. Eager (no draft/commit machinery — the row is already saved).
  const pickReceiptFrom = useCallback(
    async (source: 'camera' | 'library', tx: TransactionWithRelations) => {
      const result = await pickAndSaveReceiptImage(source);
      if (result.status !== 'saved') return;
      const next = result.path;
      const previous = tx.receiptUri;
      updateTransaction(tx.id, { receiptUri: next });
      if (previous && previous !== next) deleteReceiptImage(previous);
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
      const monthKey = financialMonthKeyForIso(transaction.date, settings.firstDayOfMonth);
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
  }, [filteredReceipts, visibleCount, locale, settings.firstDayOfMonth]);

  const handleEndReached = useCallback(() => {
    setVisibleCount((count) => (count < filteredReceipts.length ? count + PAGE_SIZE : count));
  }, [filteredReceipts.length]);

  const isTimeMode = settings.displayMode === 'time';

  const renderItem = useCallback(
    ({ item, index }: { item: ReceiptRow; index: number }) => {
      if (item.kind === 'header') {
        // The first header hugs the filters above it; later ones get top space
        // to separate the months.
        return (
          <Text
            variant="label"
            tone="muted"
            className={`px-1 pb-2 uppercase ${index === 0 ? 'pt-1' : 'pt-5'}`}
          >
            {item.monthLabel}
          </Text>
        );
      }
      return (
        <View className="flex-row gap-3 pb-3">
          {item.tiles.map((tile) => {
            const displayValue = getDisplayValueForTransaction(tile.transaction);
            // No forced sign: only genuinely negative amounts show a "-"; the
            // amount color carries the expense/income direction instead.
            const amountText = isTimeMode
              ? formatHours(displayValue, settings)
              : formatAmount(displayValue, settings);
            return (
              <View key={tile.transaction.id} className="flex-1">
                <ReceiptCard
                  transaction={tile.transaction}
                  receiptFileUri={tile.receiptFileUri}
                  amountText={amountText}
                  isTimeMode={isTimeMode}
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
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('receipts.title')}
        rightAccessory={
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onOpenSettings();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('receipts.settings_title')}
          >
            <ClayIcon name="ui/settings" size={26} flatSize={20} />
          </Pressable>
        }
      />

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
              animateIn={false}
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

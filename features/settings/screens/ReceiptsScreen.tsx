import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Text } from '~/components/ui';
import {
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { useApp, useTransactions } from '~/context/AppContext';
import { AlbumDateRangeFields } from '~/features/albums/components/AlbumDateRangeFields';
import { ActivitySearchRow } from '~/features/transactions/components/ActivitySearchRow';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { getReceiptUri } from '~/services/userAssets';
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
import { ReceiptPreviewModal } from '../components/ReceiptPreviewModal';

interface ReceiptsScreenProps {
  onBack: () => void;
  onOpenEditTransaction: (transaction: TransactionWithRelations) => void;
}

const PAGE_SIZE = 20;

type ReceiptRow =
  | { kind: 'header'; id: string; monthLabel: string }
  | {
      kind: 'card';
      id: string;
      transaction: TransactionWithRelations;
      /** Resolved once here (off the recycle path) so the card renders no sync FS stat. */
      receiptFileUri: string | null;
    };

export function ReceiptsScreen({ onBack, onOpenEditTransaction }: ReceiptsScreenProps) {
  const { settings, getDisplayValueForTransaction } = useApp();
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
  const [previewUri, setPreviewUri] = useState<string | null>(null);

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

  // Windowed slice → flat month-grouped rows (header row per month change).
  const rows = useMemo(() => {
    const visible = filteredReceipts.slice(0, visibleCount);
    const built: ReceiptRow[] = [];
    let currentMonthKey: string | null = null;
    for (const transaction of visible) {
      const monthKey = monthKeyFromIsoLocal(transaction.date);
      if (monthKey !== currentMonthKey) {
        currentMonthKey = monthKey;
        const monthDate = parseMonthKey(monthKey);
        built.push({
          kind: 'header',
          id: `header-${monthKey}`,
          monthLabel: monthDate ? formatMonthYearLabel(monthDate, locale) : monthKey,
        });
      }
      built.push({
        kind: 'card',
        id: transaction.id,
        transaction,
        receiptFileUri: getReceiptUri(transaction.receiptUri),
      });
    }
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
      const displayValue = getDisplayValueForTransaction(item.transaction);
      const amountText = isTimeMode
        ? formatHours(displayValue)
        : formatAmount(displayValue, settings, { showSign: true });
      return (
        <View className="pb-3">
          <ReceiptCard
            transaction={item.transaction}
            receiptFileUri={item.receiptFileUri}
            amountText={amountText}
            isTimeMode={isTimeMode}
            isIncome={item.transaction.type === 'income'}
            onViewTransaction={onOpenEditTransaction}
            onViewReceipt={setPreviewUri}
          />
        </View>
      );
    },
    [getDisplayValueForTransaction, isTimeMode, settings, onOpenEditTransaction],
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

      <ReceiptPreviewModal
        visible={previewUri !== null}
        fileUri={previewUri}
        onClose={() => setPreviewUri(null)}
      />
    </SettingsPageLayout>
  );
}

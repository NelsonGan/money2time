import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  DisplayModeToggle,
  MonthPagerPage,
  TypeFilterPill,
} from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { useFocusMonthNavigation } from '~/hooks/useFocusMonthNavigation';
import { useIndexedScrollToTopRefs } from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useScrollToTopTokenNavigation } from '~/hooks/useScrollToTopTokenNavigation';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations } from '~/types';
import {
  addMonthsAtMonthStart,
  formatAmount,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import {
  bucketTransactionsByMonth,
  emptyMonthSummary,
  filterTransactionsByWallet,
} from '~/utils/transactions';

const FILTER_CHIPS_CONTENT_STYLE = { gap: spacing.xs, paddingRight: spacing.sm } as const;
const FLEX_ONE_STYLE = { flex: 1 } as const;

interface SimpleActivityScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
}

export function SimpleActivityScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  onOpenTransaction,
}: SimpleActivityScreenProps) {
  const { transactions, settings, simpleWalletId, getDisplayValueForTransaction } = useApp();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(1, width);
  const monthPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const monthPagerAnchorDate = useMemo(() => startOfMonthDate(new Date()), []);
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const {
    activeIndex: activeMonthIndex,
    activeIndexRef: activeMonthIndexRef,
    slots: monthPagerSlots,
    clampIndex: clampMonthIndex,
    setActiveIndex: setActiveMonthIndex,
    handleMomentumEnd: handleHorizontalMomentumEnd,
    handleScrollEndDrag: handleHorizontalScrollEndDrag,
    handleScrollToIndexFailed: handleHorizontalScrollToIndexFailed,
    getItemLayout: getHorizontalItemLayout,
    keyExtractor: monthPagerKeyExtractor,
    scrollToRelative: scrollToRelativeMonth,
  } = useMonthPager({
    listRef: horizontalListRef,
    pageWidth,
    totalSlots: MONTH_PAGER_TOTAL_SLOTS,
    initialIndex: MONTH_PAGER_CENTER_INDEX,
  });
  const getPageScrollToTopRef = useIndexedScrollToTopRefs();

  const activeMonthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, activeMonthIndex - MONTH_PAGER_CENTER_INDEX),
    [activeMonthIndex, monthPagerAnchorDate],
  );
  const activeMonthKey = monthKeyFromDateLocal(activeMonthDate);
  const activeMonthLabel = formatMonthYearLabel(activeMonthDate);

  const walletTransactions = useMemo(() => {
    return filterTransactionsByWallet(transactions, simpleWalletId);
  }, [transactions, simpleWalletId]);

  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'all') return walletTransactions;
    return walletTransactions.filter((tx) => tx.type === typeFilter);
  }, [walletTransactions, typeFilter]);
  const resolveTransactionValue = useCallback(
    (transaction: TransactionWithRelations) =>
      settings.displayMode === 'time'
        ? getDisplayValueForTransaction(transaction)
        : transaction.amount,
    [getDisplayValueForTransaction, settings.displayMode],
  );

  const monthBuckets = useMemo(() => {
    return bucketTransactionsByMonth(filteredTransactions, resolveTransactionValue);
  }, [filteredTransactions, resolveTransactionValue]);

  const monthSummary = useMemo(
    () => monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary(),
    [activeMonthKey, monthBuckets.summaries],
  );
  const typeFilters = useMemo(
    () =>
      [
        { label: I18n.t('transactions.filters.all'), value: 'all' },
        { label: I18n.t('transactions.filters.spent'), value: 'expense' },
        { label: I18n.t('transactions.filters.earned'), value: 'income' },
      ] satisfies Array<{ label: string; value: 'all' | 'expense' | 'income' }>,
    [],
  );

  const formatSummaryValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? formatHours(value)
        : formatAmount(value, settings, { showSign: false }),
    [settings],
  );

  useScrollToTopTokenNavigation({
    scrollToTopToken,
    activeIndexRef: activeMonthIndexRef,
    listRef: horizontalListRef,
    getScrollToTopRef: getPageScrollToTopRef,
  });

  useFocusMonthNavigation({
    focusMonthToken,
    focusMonthKey,
    monthPagerAnchorDate,
    centerIndex: MONTH_PAGER_CENTER_INDEX,
    clampIndex: clampMonthIndex,
    setActiveIndex: setActiveMonthIndex,
    listRef: horizontalListRef,
    getScrollToTopRef: getPageScrollToTopRef,
  });

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      return (
        <MonthPagerPage
          item={item}
          monthPagerAnchorDate={monthPagerAnchorDate}
          centerIndex={MONTH_PAGER_CENTER_INDEX}
          localeKey={activeLocale}
          monthPageStyle={monthPageStyle}
          monthTransactionsMap={monthBuckets.transactionsMap}
          onTransactionPress={onOpenTransaction}
          getScrollToTopRef={getPageScrollToTopRef}
        />
      );
    },
    [
      getPageScrollToTopRef,
      activeLocale,
      monthBuckets.transactionsMap,
      monthPagerAnchorDate,
      monthPageStyle,
      onOpenTransaction,
    ],
  );
  const handlePrevMonth = useCallback(() => scrollToRelativeMonth(-1), [scrollToRelativeMonth]);
  const handleNextMonth = useCallback(() => scrollToRelativeMonth(1), [scrollToRelativeMonth]);

  return (
    <SafeAreaView className="bg-background" edges={['top']} style={styles.container}>
      <MonthControlsHeader
        title={I18n.t('transactions.title')}
        monthLabel={activeMonthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        actions={<DisplayModeToggle />}
      >
        <View className="gap-2">
          <InOutHeader
            incomeValue={formatSummaryValue(monthSummary.income)}
            expenseValue={formatSummaryValue(monthSummary.expense)}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={FILTER_CHIPS_CONTENT_STYLE}
          >
            {typeFilters.map((item) => (
              <TypeFilterPill
                key={item.value}
                label={item.label}
                value={item.value}
                selected={typeFilter === item.value}
                onSelect={setTypeFilter}
              />
            ))}
          </ScrollView>
        </View>
      </MonthControlsHeader>

      <View style={styles.listContainer} className="bg-background">
        <FlatList
          ref={horizontalListRef}
          data={monthPagerSlots}
          keyExtractor={monthPagerKeyExtractor}
          style={FLEX_ONE_STYLE}
          {...MONTH_PAGER_LIST_CONFIG}
          renderItem={renderMonthPage}
          initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
          getItemLayout={getHorizontalItemLayout}
          onScrollEndDrag={handleHorizontalScrollEndDrag}
          onMomentumScrollEnd={handleHorizontalMomentumEnd}
          onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    overflow: 'hidden',
  },
});

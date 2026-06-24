import { useCallback, useMemo, useRef } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';

import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { useApp } from '~/context/AppContext';
import { MonthPagerPage } from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import {
  useIndexedHandlerRefs,
  useIndexedScrollToTopRefs,
} from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations } from '~/types';
import {
  addMonthsAtMonthStart,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import { bucketTransactionsByMonth } from '~/utils/transactions';

const FLEX_ONE = { flex: 1 } as const;

interface AlbumMonthPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Full-screen month-paged transaction selector, mirroring the home activity
 * pager (useMonthPager + MonthPagerPage) but locked into selection mode so each
 * tap toggles album membership.
 */
export function AlbumMonthPicker({ selectedIds, onChange }: AlbumMonthPickerProps) {
  const { transactions, settings, getDisplayValueForTransaction, getTrueHourlyRateForDate } =
    useApp();
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(1, width);
  const monthPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const monthPagerAnchorDate = useMemo(() => startOfMonthDate(new Date()), []);
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const activeLocale = I18n.locale ?? 'en';

  const displaySettings = useMemo(
    () => ({ currencySymbol: settings.currencySymbol, displayMode: settings.displayMode }),
    [settings.currencySymbol, settings.displayMode],
  );

  const resolveValue = useCallback(
    (transaction: TransactionWithRelations) => getDisplayValueForTransaction(transaction),
    [getDisplayValueForTransaction],
  );
  const monthBuckets = useMemo(
    () => bucketTransactionsByMonth(transactions, resolveValue),
    [transactions, resolveValue],
  );

  const {
    activeIndex,
    slots,
    handleMomentumEnd,
    handleScrollEndDrag,
    handleScrollToIndexFailed,
    getItemLayout,
    keyExtractor,
    scrollToRelative,
  } = useMonthPager({
    listRef: horizontalListRef,
    pageWidth,
    totalSlots: MONTH_PAGER_TOTAL_SLOTS,
    initialIndex: MONTH_PAGER_CENTER_INDEX,
  });
  const getPageScrollToTopRef = useIndexedScrollToTopRefs();
  const getPageScrollToDayRef = useIndexedHandlerRefs<(dayKey: string) => void>();

  const activeMonthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, activeIndex - MONTH_PAGER_CENTER_INDEX),
    [activeIndex, monthPagerAnchorDate],
  );
  const activeMonthLabel = formatMonthYearLabel(activeMonthDate, activeLocale);

  const toggleOne = useCallback(
    (transaction: TransactionWithRelations) => {
      const set = new Set(selectedIds);
      if (set.has(transaction.id)) set.delete(transaction.id);
      else set.add(transaction.id);
      onChange([...set]);
    },
    [onChange, selectedIds],
  );
  const toggleDay = useCallback(
    (ids: string[]) => {
      const set = new Set(selectedIds);
      const allSelected = ids.every((id) => set.has(id));
      if (allSelected) ids.forEach((id) => set.delete(id));
      else ids.forEach((id) => set.add(id));
      onChange([...set]);
    },
    [onChange, selectedIds],
  );

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => (
      <MonthPagerPage
        item={item}
        monthPagerAnchorDate={monthPagerAnchorDate}
        centerIndex={MONTH_PAGER_CENTER_INDEX}
        localeKey={activeLocale}
        monthPageStyle={monthPageStyle}
        monthTransactionsMap={monthBuckets.transactionsMap}
        displaySettings={displaySettings}
        getDisplayValueForTransaction={getDisplayValueForTransaction}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        onTransactionPress={toggleOne}
        selectedTransactionIds={selectedIds}
        selectionMode
        onToggleDaySelection={toggleDay}
        getScrollToTopRef={getPageScrollToTopRef}
        getScrollToDayRef={getPageScrollToDayRef}
      />
    ),
    [
      activeLocale,
      displaySettings,
      getDisplayValueForTransaction,
      getPageScrollToDayRef,
      getPageScrollToTopRef,
      getTrueHourlyRateForDate,
      monthBuckets.transactionsMap,
      monthPageStyle,
      monthPagerAnchorDate,
      selectedIds,
      toggleDay,
      toggleOne,
    ],
  );

  return (
    <View className="flex-1">
      <MonthControlsHeader
        monthLabel={activeMonthLabel}
        hideTitleRow
        showAccent={false}
        onPrevMonth={() => scrollToRelative(-1)}
        onNextMonth={() => scrollToRelative(1)}
      />
      <View className="flex-1 overflow-hidden bg-background">
        <FlatList
          ref={horizontalListRef}
          data={slots}
          keyExtractor={keyExtractor}
          style={FLEX_ONE}
          {...MONTH_PAGER_LIST_CONFIG}
          renderItem={renderMonthPage}
          initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
          getItemLayout={getItemLayout}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollToIndexFailed={handleScrollToIndexFailed}
        />
      </View>
    </View>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { TimeValueInline } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  DisplayModeToggle,
  MonthJumpPopover,
} from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import {
  addMonthsAtMonthStart,
  dayKeyFromDateLocal,
  formatAmount,
  formatHours,
  formatMonthYearLabel,
  startOfMonthDate,
} from '~/utils/formatters';
import { filterTransactionsByWallet } from '~/utils/transactions';

import { CalendarMonthPage } from '../components/CalendarMonthPage';
import { buildCalendarMonth, getCalendarWeekdayLabels } from '../lib/calendarBuild';

const CALENDAR_HORIZONTAL_PADDING = spacing.screenHorizontal;
const CALENDAR_GRID_HORIZONTAL_PADDING = spacing.xs;

export interface CalendarScreenProps {
  scrollToTopToken?: number;
  resetToCurrentMonthToken?: number;
  onOpenTransaction: (tx: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (tx: TransactionWithRelations) => void;
}

function monthOffsetFromAnchor(anchor: Date, target: Date): number {
  // year*12 + month delta — independent of variable month length so the
  // round-trip from index → month → index is exact.
  return (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth());
}

export function CalendarScreen({
  scrollToTopToken = 0,
  resetToCurrentMonthToken = 0,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
}: CalendarScreenProps) {
  const {
    transactions,
    settings,
    isSimpleMode,
    simpleWalletId,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
  } = useApp();
  const themeColors = useThemeColors();
  const { contentWidth } = useDeviceLayout();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const isTimeMode = settings.displayMode === 'time';

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() =>
    dayKeyFromDateLocal(new Date()),
  );
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerAnchorRect, setMonthPickerAnchorRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const monthPickerTriggerRef = useRef<View>(null);
  const horizontalListRef = useRef<FlatList<number> | null>(null);

  const pageWidth = Math.max(1, screenWidth);
  const monthPagerAnchorDate = useMemo(() => startOfMonthDate(new Date()), []);

  const {
    activeIndex: activeMonthIndex,
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

  const activeMonthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, activeMonthIndex - MONTH_PAGER_CENTER_INDEX),
    [activeMonthIndex, monthPagerAnchorDate],
  );

  const scopedTransactions = useMemo(
    () => filterTransactionsByWallet(transactions, isSimpleMode ? simpleWalletId : null),
    [transactions, isSimpleMode, simpleWalletId],
  );

  const todayDayKey = dayKeyFromDateLocal(new Date());

  // Build month data for the *active* month so the header summary always
  // reflects what the user is looking at. Each page computes its own
  // month data internally — duplicated work for the active page, but it
  // keeps the page component self-contained and renders the header in
  // one place without prop-drilling per-page data out.
  const activeMonthData = useMemo(
    () =>
      buildCalendarMonth({
        monthAnchor: activeMonthDate,
        transactions: scopedTransactions,
        locale: activeLocale,
        isTimeMode,
        getDisplayValueForTransaction,
        todayDayKey,
      }),
    [
      activeMonthDate,
      scopedTransactions,
      activeLocale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
    ],
  );

  const weekdayLabels = useMemo(() => getCalendarWeekdayLabels(activeLocale), [activeLocale]);

  const activeMonthLabel = useMemo(
    () => formatMonthYearLabel(activeMonthDate, activeLocale),
    [activeMonthDate, activeLocale],
  );

  // When the active month changes, default-pick a day inside it for the
  // lifted selection — today if it falls inside, else the 1st.
  useEffect(() => {
    setSelectedDayKey((prev) => {
      if (
        prev &&
        prev >= activeMonthData.firstDayKey &&
        prev <= activeMonthData.lastDayKey
      ) {
        return prev;
      }
      const inMonth =
        activeMonthData.firstDayKey <= todayDayKey && activeMonthData.lastDayKey >= todayDayKey;
      return inMonth ? todayDayKey : activeMonthData.firstDayKey;
    });
  }, [activeMonthData.firstDayKey, activeMonthData.lastDayKey, todayDayKey]);

  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
    }),
    [settings.currencySymbol, settings.displayMode],
  );

  const formatSummaryValue = useCallback(
    (value: number) =>
      isTimeMode ? (
        <TimeValueInline
          value={formatHours(value)}
          variant="mono"
          textClassName="text-foreground"
          iconSize={11}
        />
      ) : (
        formatAmount(value, settings, { showSign: false })
      ),
    [isTimeMode, settings],
  );

  const handlePrevMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(-1);
  }, [scrollToRelativeMonth]);

  const handleNextMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(1);
  }, [scrollToRelativeMonth]);

  const handleSelectDay = useCallback((dayKey: string) => {
    setSelectedDayKey(dayKey);
  }, []);

  const handleMonthTriggerLayout = useCallback(() => {
    monthPickerTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setMonthPickerAnchorRect({ x, y, width, height });
    });
  }, []);

  const handleOpenMonthPicker = useCallback(() => {
    handleMonthTriggerLayout();
    setIsMonthPickerOpen(true);
  }, [handleMonthTriggerLayout]);

  const handleCloseMonthPicker = useCallback(() => {
    setIsMonthPickerOpen(false);
  }, []);

  const handleJumpToMonth = useCallback(
    (monthDate: Date) => {
      const offset = monthOffsetFromAnchor(monthPagerAnchorDate, monthDate);
      const nextIndex = clampMonthIndex(MONTH_PAGER_CENTER_INDEX + offset);
      setActiveMonthIndex(nextIndex);
      horizontalListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
      setIsMonthPickerOpen(false);
    },
    [clampMonthIndex, monthPagerAnchorDate, setActiveMonthIndex],
  );

  useEffect(() => {
    if (!resetToCurrentMonthToken) return;
    setActiveMonthIndex(MONTH_PAGER_CENTER_INDEX);
    setSelectedDayKey(dayKeyFromDateLocal(new Date()));
    horizontalListRef.current?.scrollToIndex({
      index: MONTH_PAGER_CENTER_INDEX,
      animated: false,
    });
  }, [resetToCurrentMonthToken, setActiveMonthIndex]);

  const gridChartWidth = useMemo(() => {
    const horizontal = CALENDAR_GRID_HORIZONTAL_PADDING * 2;
    return Math.max(280, contentWidth - horizontal);
  }, [contentWidth]);

  const bottomPad = useMemo(
    () => getBottomNavReservedInset(safeAreaInsets.bottom) + spacing.lg,
    [safeAreaInsets.bottom],
  );

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      const offset = item - MONTH_PAGER_CENTER_INDEX;
      const pageMonth = addMonthsAtMonthStart(monthPagerAnchorDate, offset);
      const isActive = item === activeMonthIndex;
      return (
        <CalendarMonthPage
          pageWidth={pageWidth}
          monthAnchor={pageMonth}
          transactions={scopedTransactions}
          locale={activeLocale}
          isTimeMode={isTimeMode}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          todayDayKey={todayDayKey}
          weekdayLabels={weekdayLabels}
          gridChartWidth={gridChartWidth}
          bottomPad={bottomPad}
          contentPaddingHorizontal={CALENDAR_HORIZONTAL_PADDING}
          gridPaddingHorizontal={CALENDAR_GRID_HORIZONTAL_PADDING}
          displaySettings={transactionDisplaySettings}
          fullSettings={settings}
          selectedDayKey={selectedDayKey}
          isActive={isActive}
          scrollToTopToken={scrollToTopToken}
          onSelectDay={handleSelectDay}
          onOpenTransaction={onOpenTransaction}
          onOpenTransactionSplitBadge={onOpenTransactionSplitBadge}
        />
      );
    },
    [
      activeLocale,
      activeMonthIndex,
      bottomPad,
      getDisplayValueForTransaction,
      getTrueHourlyRateForDate,
      gridChartWidth,
      handleSelectDay,
      isTimeMode,
      monthPagerAnchorDate,
      onOpenTransaction,
      onOpenTransactionSplitBadge,
      pageWidth,
      scopedTransactions,
      scrollToTopToken,
      selectedDayKey,
      settings,
      todayDayKey,
      transactionDisplaySettings,
      weekdayLabels,
    ],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MonthControlsHeader
        title={I18n.t('calendar.title')}
        showAccent={false}
        monthLabel={activeMonthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthPress={handleOpenMonthPicker}
        monthTriggerRef={monthPickerTriggerRef}
        onMonthTriggerLayout={handleMonthTriggerLayout}
        actions={<DisplayModeToggle />}
      >
        <InOutHeader
          incomeValue={formatSummaryValue(activeMonthData.totalIncome)}
          expenseValue={formatSummaryValue(activeMonthData.totalExpense)}
        />
      </MonthControlsHeader>

      <View className="flex-1 overflow-hidden bg-background">
        <FlatList
          ref={horizontalListRef}
          data={monthPagerSlots}
          keyExtractor={monthPagerKeyExtractor}
          style={styles.flexOne}
          {...MONTH_PAGER_LIST_CONFIG}
          renderItem={renderMonthPage}
          initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
          getItemLayout={getHorizontalItemLayout}
          onScrollEndDrag={handleHorizontalScrollEndDrag}
          onMomentumScrollEnd={handleHorizontalMomentumEnd}
          onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
        />
      </View>

      <MonthJumpPopover
        visible={isMonthPickerOpen}
        anchorRect={monthPickerAnchorRect}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        locale={activeLocale}
        currentMonthDate={activeMonthDate}
        onSelectMonth={handleJumpToMonth}
        onClose={handleCloseMonthPicker}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { Text, TimeValueInline } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  DisplayModeToggle,
  MonthJumpPopover,
  TransactionItem,
} from '~/features/transactions/components';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
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

import { CalendarMonthGrid } from '../components/CalendarMonthGrid';
import {
  buildCalendarMonth,
  formatCalendarDate,
  getCalendarWeekdayLabels,
} from '../lib/calendarBuild';

const CALENDAR_HORIZONTAL_PADDING = spacing.screenHorizontal;
const CALENDAR_GRID_HORIZONTAL_PADDING = spacing.xs;

export interface CalendarScreenProps {
  scrollToTopToken?: number;
  resetToCurrentMonthToken?: number;
  onOpenTransaction: (tx: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (tx: TransactionWithRelations) => void;
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

  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonthDate(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerAnchorRect, setMonthPickerAnchorRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const monthPickerTriggerRef = useRef<View>(null);

  const scopedTransactions = useMemo(
    () => filterTransactionsByWallet(transactions, isSimpleMode ? simpleWalletId : null),
    [transactions, isSimpleMode, simpleWalletId],
  );

  const todayDayKey = dayKeyFromDateLocal(new Date());

  const monthData = useMemo(
    () =>
      buildCalendarMonth({
        monthAnchor,
        transactions: scopedTransactions,
        locale: activeLocale,
        isTimeMode,
        getDisplayValueForTransaction,
        todayDayKey,
      }),
    [
      monthAnchor,
      scopedTransactions,
      activeLocale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
    ],
  );

  const weekdayLabels = useMemo(() => getCalendarWeekdayLabels(activeLocale), [activeLocale]);

  const activeMonthLabel = useMemo(
    () => formatMonthYearLabel(monthAnchor, activeLocale),
    [monthAnchor, activeLocale],
  );

  // Auto-pick a default selected day when the month range changes.
  useEffect(() => {
    setSelectedDayKey((prev) => {
      if (prev && prev >= monthData.firstDayKey && prev <= monthData.lastDayKey) return prev;
      const inCurrentMonth =
        monthData.firstDayKey <= todayDayKey && monthData.lastDayKey >= todayDayKey;
      return inCurrentMonth ? todayDayKey : monthData.firstDayKey;
    });
  }, [monthData.firstDayKey, monthData.lastDayKey, todayDayKey]);

  const selectedDayAggregate = useMemo(() => {
    if (!selectedDayKey) return null;
    return monthData.dailyByDayKey.get(selectedDayKey) ?? null;
  }, [monthData.dailyByDayKey, selectedDayKey]);

  const selectedDayTransactions = selectedDayAggregate?.transactions ?? [];

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

  const formatDaySubtotal = useCallback(
    (value: number, tone: 'income' | 'expense') => {
      const colorClass = tone === 'income' ? 'text-success' : 'text-destructive';
      const iconColor = tone === 'income' ? themeColors.success : themeColors.error;
      if (isTimeMode) {
        return (
          <TimeValueInline
            value={formatHours(value)}
            variant="caption"
            textClassName={colorClass}
            iconColor={iconColor}
            iconSize={10}
          />
        );
      }
      return (
        <Text variant="caption" className={colorClass}>
          {formatAmount(value, settings, { showSign: false })}
        </Text>
      );
    },
    [isTimeMode, settings, themeColors.success, themeColors.error],
  );

  const handlePrevMonth = useCallback(() => {
    void triggerHaptic('selection');
    setMonthAnchor((prev) => addMonthsAtMonthStart(prev, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    void triggerHaptic('selection');
    setMonthAnchor((prev) => addMonthsAtMonthStart(prev, 1));
  }, []);

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

  const handleJumpToMonth = useCallback((monthDate: Date) => {
    setMonthAnchor(startOfMonthDate(monthDate));
    setIsMonthPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!scrollToTopToken) return;
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopToken]);

  useEffect(() => {
    if (!resetToCurrentMonthToken) return;
    setMonthAnchor(startOfMonthDate(new Date()));
    setSelectedDayKey(dayKeyFromDateLocal(new Date()));
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [resetToCurrentMonthToken]);

  const gridChartWidth = useMemo(() => {
    const horizontal = CALENDAR_GRID_HORIZONTAL_PADDING * 2;
    return Math.max(280, contentWidth - horizontal);
  }, [contentWidth]);

  const isFutureDay = selectedDayKey ? selectedDayKey > todayDayKey : false;
  const selectedDayLabel = selectedDayKey ? formatCalendarDate(selectedDayKey, activeLocale) : '';

  const bottomPad = getBottomNavReservedInset(safeAreaInsets.bottom) + spacing.lg;

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
          incomeValue={formatSummaryValue(monthData.totalIncome)}
          expenseValue={formatSummaryValue(monthData.totalExpense)}
        />
      </MonthControlsHeader>

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarWrapper}>
          <CalendarMonthGrid
            monthData={monthData}
            weekdayLabels={weekdayLabels}
            selectedDayKey={selectedDayKey}
            isTimeMode={isTimeMode}
            locale={activeLocale}
            onSelectDay={handleSelectDay}
            chartWidth={gridChartWidth}
          />
        </View>

        <View style={styles.daySection}>
          {selectedDayKey ? (
            <View style={styles.daySectionHeader}>
              <View style={styles.daySectionTitleGroup}>
                <Text variant="bodyStrong">{selectedDayLabel}</Text>
              </View>
              <View style={styles.daySectionSubtotals}>
                {selectedDayAggregate && selectedDayAggregate.income > 0 ? (
                  <View className="rounded-full bg-success/10 px-2 py-0.5">
                    {formatDaySubtotal(selectedDayAggregate.income, 'income')}
                  </View>
                ) : null}
                {selectedDayAggregate && selectedDayAggregate.expense > 0 ? (
                  <View className="rounded-full bg-destructive/10 px-2 py-0.5">
                    {formatDaySubtotal(selectedDayAggregate.expense, 'expense')}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {selectedDayTransactions.length === 0 ? (
            <EmptyState
              title={I18n.t('calendar.empty_title')}
              message={isFutureDay ? I18n.t('calendar.future_empty') : I18n.t('calendar.empty_day')}
              mascotMood="curious"
              animateIn={false}
              compact
            />
          ) : (
            <View style={styles.transactionList}>
              {selectedDayTransactions.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onPressTransaction={onOpenTransaction}
                  onPressSplitBadge={onOpenTransactionSplitBadge}
                  settings={transactionDisplaySettings}
                  getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                  compact
                  disableAnimations
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <MonthJumpPopover
        visible={isMonthPickerOpen}
        anchorRect={monthPickerAnchorRect}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        locale={activeLocale}
        currentMonthDate={monthAnchor}
        onSelectMonth={handleJumpToMonth}
        onClose={handleCloseMonthPicker}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.xxs,
    gap: spacing.sm,
  },
  calendarWrapper: {
    paddingHorizontal: CALENDAR_GRID_HORIZONTAL_PADDING,
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  daySection: {
    paddingHorizontal: CALENDAR_HORIZONTAL_PADDING,
    gap: spacing.xs,
  },
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxs,
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  daySectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  daySectionSubtotals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  transactionList: {
    gap: 2,
  },
});

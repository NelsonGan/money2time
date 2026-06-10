import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { Text, TimeValueInline } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { TransactionItem } from '~/features/transactions/components';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { formatAmount, formatHours } from '~/utils/formatters';

import { CalendarMonthGrid } from './CalendarMonthGrid';
import { buildCalendarMonth, formatCalendarDate } from '../lib/calendarBuild';

interface CalendarMonthPageProps {
  pageWidth: number;
  monthAnchor: Date;
  transactions: TransactionWithRelations[];
  locale: string;
  isTimeMode: boolean;
  getDisplayValueForTransaction: (tx: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  todayDayKey: string;
  weekdayLabels: string[];
  gridChartWidth: number;
  bottomPad: number;
  contentPaddingHorizontal: number;
  gridPaddingHorizontal: number;
  displaySettings: Pick<UserSettings, 'currencySymbol' | 'displayMode'>;
  fullSettings: UserSettings;
  selectedDayKey: string | null;
  /** True for the centered/visible page only — drives the lifted day-selection state. */
  isActive: boolean;
  /** Bumped each time the user re-taps the active tab; only the active page reacts. */
  scrollToTopToken?: number;
  onSelectDay: (dayKey: string) => void;
  onOpenTransaction: (tx: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (tx: TransactionWithRelations) => void;
  onLongPressTransaction?: (tx: TransactionWithRelations) => void;
  selectionMode?: boolean;
  selectedTransactionIds?: string[];
}

export const CalendarMonthPage = memo(function CalendarMonthPage({
  pageWidth,
  monthAnchor,
  transactions,
  locale,
  isTimeMode,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  todayDayKey,
  weekdayLabels,
  gridChartWidth,
  bottomPad,
  contentPaddingHorizontal,
  gridPaddingHorizontal,
  displaySettings,
  fullSettings,
  selectedDayKey,
  isActive,
  scrollToTopToken = 0,
  onSelectDay,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onLongPressTransaction,
  selectionMode = false,
  selectedTransactionIds,
}: CalendarMonthPageProps) {
  const themeColors = useThemeColors();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const reportBottomNavScroll = useBottomNavScrollReporter();

  const selectedTransactionIdSet = useMemo(
    () => new Set(selectedTransactionIds ?? []),
    [selectedTransactionIds],
  );

  const monthData = useMemo(
    () =>
      buildCalendarMonth({
        monthAnchor,
        transactions,
        locale,
        isTimeMode,
        getDisplayValueForTransaction,
        todayDayKey,
        weekStartsOn: fullSettings.weekStartsOn,
      }),
    [
      monthAnchor,
      transactions,
      locale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
      fullSettings.weekStartsOn,
    ],
  );

  // Each page keeps its own "preview" day so off-screen pages render a
  // sensible default (today if visible, else first of month) without
  // mutating the lifted state used by the active page.
  const [localSelectedDayKey, setLocalSelectedDayKey] = useState<string | null>(() => {
    const inMonth = monthData.firstDayKey <= todayDayKey && monthData.lastDayKey >= todayDayKey;
    return inMonth ? todayDayKey : monthData.firstDayKey;
  });

  useEffect(() => {
    setLocalSelectedDayKey((prev) => {
      if (prev && prev >= monthData.firstDayKey && prev <= monthData.lastDayKey) return prev;
      const inMonth = monthData.firstDayKey <= todayDayKey && monthData.lastDayKey >= todayDayKey;
      return inMonth ? todayDayKey : monthData.firstDayKey;
    });
  }, [monthData.firstDayKey, monthData.lastDayKey, todayDayKey]);

  // The active page mirrors the parent-owned selectedDayKey when valid,
  // otherwise falls back to the per-page local preview. This keeps day
  // taps interactive on the focused page while leaving adjacent pages
  // showing a coherent default.
  const effectiveSelectedDayKey = useMemo(() => {
    if (
      isActive &&
      selectedDayKey &&
      selectedDayKey >= monthData.firstDayKey &&
      selectedDayKey <= monthData.lastDayKey
    ) {
      return selectedDayKey;
    }
    return localSelectedDayKey;
  }, [isActive, selectedDayKey, monthData.firstDayKey, monthData.lastDayKey, localSelectedDayKey]);

  const handleSelectDay = useCallback(
    (dayKey: string) => {
      setLocalSelectedDayKey(dayKey);
      onSelectDay(dayKey);
    },
    [onSelectDay],
  );

  const selectedDayAggregate = useMemo(() => {
    if (!effectiveSelectedDayKey) return null;
    return monthData.dailyByDayKey.get(effectiveSelectedDayKey) ?? null;
  }, [monthData.dailyByDayKey, effectiveSelectedDayKey]);

  const selectedDayTransactions = selectedDayAggregate?.transactions ?? [];

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
          {formatAmount(value, fullSettings, { showSign: false })}
        </Text>
      );
    },
    [isTimeMode, fullSettings, themeColors.success, themeColors.error],
  );

  const isFutureDay = effectiveSelectedDayKey ? effectiveSelectedDayKey > todayDayKey : false;
  const selectedDayLabel = effectiveSelectedDayKey
    ? formatCalendarDate(effectiveSelectedDayKey, locale)
    : '';

  // Only the active page reacts to the tab re-tap signal, so off-screen
  // pages don't snap their independent scroll positions back to zero.
  useEffect(() => {
    if (!isActive) return;
    if (!scrollToTopToken) return;
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [isActive, scrollToTopToken]);

  return (
    <View style={{ width: pageWidth }}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={reportBottomNavScroll}
        scrollEventThrottle={32}
      >
        <View style={[styles.calendarWrapper, { paddingHorizontal: gridPaddingHorizontal }]}>
          <CalendarMonthGrid
            monthData={monthData}
            weekdayLabels={weekdayLabels}
            selectedDayKey={effectiveSelectedDayKey}
            isTimeMode={isTimeMode}
            locale={locale}
            onSelectDay={handleSelectDay}
            chartWidth={gridChartWidth}
          />
        </View>

        <View style={[styles.daySection, { paddingHorizontal: contentPaddingHorizontal }]}>
          {effectiveSelectedDayKey ? (
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
                  onLongPressTransaction={onLongPressTransaction}
                  selectionMode={selectionMode}
                  selected={selectedTransactionIdSet.has(tx.id)}
                  settings={displaySettings}
                  getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                  compact
                  disableAnimations
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.xxs,
    gap: spacing.sm,
  },
  calendarWrapper: {
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  daySection: {
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

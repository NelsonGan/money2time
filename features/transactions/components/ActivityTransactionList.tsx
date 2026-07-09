import type { FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  useBottomNavContentInset,
  useBottomNavScrollReporter,
} from '~/components/navigation/BottomNavMinimize';
import { Text, TimeValueInline } from '~/components/ui';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromIsoLocal, formatAmount, formatHours } from '~/utils/formatters';

export type TransactionDisplaySettings = Pick<UserSettings, 'currencySymbol' | 'displayMode'>;

type ActivityRow =
  | {
      kind: 'header';
      id: string;
      dateLabel: string;
      weekdayLabel: string;
      incomeSubtotal: number;
      expenseSubtotal: number;
      transactionIds: string[];
    }
  | { kind: 'item'; id: string; transaction: TransactionWithRelations };

const dayLabelFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayLabelWithYearFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayHeaderLabelCache = new Map<string, { dateLabel: string; weekdayLabel: string }>();
const MAINTAIN_VISIBLE_CONTENT_DISABLED = { disabled: true } as const;

interface ActivityTransactionListProps {
  transactions: TransactionWithRelations[];
  displaySettings: TransactionDisplaySettings;
  /**
   * When set (single-account view), day subtotals are summed in this account's
   * native currency and shown with its symbol, rather than converted to the
   * reporting currency.
   */
  subtotalCurrencyCode?: string | null;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  /** Tap on the unpaid-splits notification badge — overrides the row tap so
   *  the caller can route directly to the Split Bill modal. */
  onTransactionSplitBadgePress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  /** Toggle selection of every transaction under a day header (select-all). */
  onToggleDaySelection?: (transactionIds: string[]) => void;
  emptyTitle: string;
  emptyMessage: string;
  listHeaderComponent?: React.ReactNode;
  contentPaddingBottom?: number;
  contentPaddingHorizontal?: number;
  contentPaddingTop?: number;
  listKey?: string;
  disableItemAnimations?: boolean;
  disableScrollBounce?: boolean;
  compactItems?: boolean;
  disableVirtualization?: boolean;
  groupByDate?: boolean;
  scrollToTopRef?: React.MutableRefObject<(() => void) | null>;
  /** Scrolls the list to a given day's section header (YYYY-MM-DD). */
  scrollToDayRef?: React.MutableRefObject<((dayKey: string) => void) | null>;
  locale?: string;
  /**
   * Set when this list is a tab screen's main scrollable behind the floating
   * liquid-glass nav bar: adds the bar's reserved inset to the bottom padding
   * and reports scroll so the bar can minimize. No-op in fallback mode.
   */
  extendUnderBottomNav?: boolean;
}

interface DayHeaderRowProps {
  dateLabel: string;
  weekdayLabel: string;
  incomeSubtotal: number;
  expenseSubtotal: number;
  isTimeMode: boolean;
  settings: TransactionDisplaySettings;
  selectionMode: boolean;
  allSelected: boolean;
  onToggleSelectAll?: () => void;
}

const DayHeaderRow = memo(function DayHeaderRow({
  dateLabel,
  weekdayLabel,
  incomeSubtotal,
  expenseSubtotal,
  isTimeMode,
  settings,
  selectionMode,
  allSelected,
  onToggleSelectAll,
}: DayHeaderRowProps) {
  const themeColors = useThemeColors();

  return (
    <View className="pt-2 pb-1.5 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {selectionMode ? (
          <Pressable
            onPress={onToggleSelectAll}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            className={cn(
              'mr-0.5 h-5 w-5 rounded-full border items-center justify-center',
              allSelected ? 'border-primary bg-primary/20' : 'border-border/50 bg-secondary/35',
            )}
          >
            {allSelected ? (
              <Text variant="label" className="text-primary">
                ✓
              </Text>
            ) : null}
          </Pressable>
        ) : null}
        <Text variant="caption" tone="muted">
          {dateLabel}
        </Text>
        <View className="rounded-full border border-border/45 bg-secondary/55 px-2 py-0.5">
          <Text variant="label" tone="muted">
            {weekdayLabel}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {incomeSubtotal !== 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-success/10">
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(Math.abs(incomeSubtotal))}
                variant="caption"
                textClassName="text-success"
                iconColor={themeColors.success}
                iconSize={10}
              />
            ) : (
              <Text variant="caption" className="text-success">
                {formatAmount(incomeSubtotal, settings, { showSign: false })}
              </Text>
            )}
          </View>
        ) : null}
        {expenseSubtotal !== 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-destructive/8">
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(Math.abs(expenseSubtotal))}
                variant="caption"
                textClassName="text-destructive"
                iconColor={themeColors.error}
                iconSize={10}
              />
            ) : (
              <Text variant="caption" className="text-destructive">
                {formatAmount(expenseSubtotal, settings, { showSign: false })}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
});

function dayKeyFromIso(isoDate: string) {
  return dayKeyFromIsoLocal(isoDate);
}

function getDayLabelFormatter(locale: string) {
  const cached = dayLabelFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  });
  dayLabelFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getDayLabelWithYearFormatter(locale: string) {
  const cached = dayLabelWithYearFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  dayLabelWithYearFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getWeekdayFormatter(locale: string) {
  const cached = weekdayFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  weekdayFormatterByLocale.set(locale, formatter);
  return formatter;
}

function formatDayHeaderParts(
  dayKey: string,
  locale: string,
): { dateLabel: string; weekdayLabel: string } {
  const currentYear = new Date().getFullYear();
  const cacheKey = `${locale}|${currentYear}|${dayKey}`;
  const cached = dayHeaderLabelCache.get(cacheKey);
  if (cached) return cached;

  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { dateLabel: dayKey, weekdayLabel: '' };
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return { dateLabel: dayKey, weekdayLabel: '' };

  const dateLabel =
    year !== currentYear
      ? getDayLabelWithYearFormatter(locale).format(date)
      : getDayLabelFormatter(locale).format(date);
  const weekdayLabel = getWeekdayFormatter(locale).format(date);
  const next = { dateLabel, weekdayLabel };
  dayHeaderLabelCache.set(cacheKey, next);

  return next;
}

export const ActivityTransactionList = memo(function ActivityTransactionList({
  transactions,
  displaySettings,
  subtotalCurrencyCode,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  onTransactionPress,
  onTransactionLongPress,
  onTransactionSplitBadgePress,
  selectedTransactionIds = [],
  selectionMode = false,
  onToggleDaySelection,
  emptyTitle,
  emptyMessage,
  listHeaderComponent,
  contentPaddingBottom = LIST_BOTTOM_PADDING,
  contentPaddingHorizontal = 18,
  contentPaddingTop = 4,
  listKey,
  disableItemAnimations = false,
  disableScrollBounce = false,
  compactItems = false,
  disableVirtualization = false,
  groupByDate = true,
  scrollToTopRef,
  scrollToDayRef,
  locale = I18n.locale ?? 'en',
  extendUnderBottomNav = false,
}: ActivityTransactionListProps) {
  const flashListRef = useRef<FlashListRef<ActivityRow> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const bottomNavInset = useBottomNavContentInset();
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const navScrollProps = extendUnderBottomNav
    ? ({ onScroll: reportBottomNavScroll, scrollEventThrottle: 32 } as const)
    : undefined;
  const isTimeMode = displaySettings.displayMode === 'time';
  const selectedTransactionIdSet = useMemo(
    () => new Set(selectedTransactionIds),
    [selectedTransactionIds],
  );

  const rows = useMemo<ActivityRow[]>(() => {
    if (!groupByDate) {
      return transactions.map((transaction) => ({
        kind: 'item',
        id: transaction.id,
        transaction,
      }));
    }

    const dailyTotals = new Map<string, { income: number; expense: number }>();
    const headerRowsByDay = new Map<string, Extract<ActivityRow, { kind: 'header' }>[]>();
    const transactionIdsByDay = new Map<string, string[]>();
    const nextRows: ActivityRow[] = [];
    let currentHeaderDay: string | null = null;

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      const dayTotals = dailyTotals.get(dayKey) ?? { income: 0, expense: 0 };
      if (transaction.type === 'income') {
        const value = isTimeMode
          ? getDisplayValueForTransaction(transaction)
          : subtotalCurrencyCode
            ? (transaction.accountAmount ?? transaction.amount)
            : (transaction.reportingAmount ?? transaction.amount);
        dayTotals.income += value;
      }
      if (transaction.type === 'expense') {
        const value = isTimeMode
          ? getDisplayValueForTransaction(transaction)
          : subtotalCurrencyCode
            ? (transaction.accountAmount ?? transaction.amount)
            : (transaction.reportingAmount ?? transaction.amount);
        dayTotals.expense += value;
      }
      dailyTotals.set(dayKey, dayTotals);

      if (dayKey !== currentHeaderDay) {
        currentHeaderDay = dayKey;
        const { dateLabel, weekdayLabel } = formatDayHeaderParts(dayKey, locale);
        const headerRow: Extract<ActivityRow, { kind: 'header' }> = {
          kind: 'header',
          id: `header-${dayKey}`,
          dateLabel,
          weekdayLabel,
          incomeSubtotal: 0,
          expenseSubtotal: 0,
          transactionIds: [],
        };
        const dayHeaders = headerRowsByDay.get(dayKey);
        if (dayHeaders) {
          dayHeaders.push(headerRow);
        } else {
          headerRowsByDay.set(dayKey, [headerRow]);
        }
        nextRows.push(headerRow);
      }
      const dayIds = transactionIdsByDay.get(dayKey);
      if (dayIds) {
        dayIds.push(transaction.id);
      } else {
        transactionIdsByDay.set(dayKey, [transaction.id]);
      }
      nextRows.push({ kind: 'item', id: transaction.id, transaction });
    });

    headerRowsByDay.forEach((headerRows, dayKey) => {
      const totals = dailyTotals.get(dayKey);
      const dayIds = transactionIdsByDay.get(dayKey) ?? [];
      headerRows.forEach((headerRow) => {
        if (totals) {
          headerRow.incomeSubtotal = totals.income;
          headerRow.expenseSubtotal = totals.expense;
        }
        headerRow.transactionIds = dayIds;
      });
    });

    return nextRows;
  }, [
    getDisplayValueForTransaction,
    groupByDate,
    isTimeMode,
    locale,
    subtotalCurrencyCode,
    transactions,
  ]);

  // Day subtotals in a single-account view use that account's symbol; otherwise
  // the reporting-currency symbol from displaySettings.
  const subtotalSettings = useMemo<TransactionDisplaySettings>(
    () =>
      subtotalCurrencyCode
        ? { ...displaySettings, currencySymbol: currencySymbolForCode(subtotalCurrencyCode) }
        : displaySettings,
    [displaySettings, subtotalCurrencyCode],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: contentPaddingBottom + (extendUnderBottomNav ? bottomNavInset : 0),
      paddingHorizontal: contentPaddingHorizontal,
      paddingTop: contentPaddingTop,
    }),
    [
      bottomNavInset,
      contentPaddingBottom,
      contentPaddingHorizontal,
      contentPaddingTop,
      extendUnderBottomNav,
    ],
  );

  const keyExtractor = useCallback((item: ActivityRow) => item.id, []);
  const getItemType = useCallback((item: ActivityRow) => item.kind, []);

  const renderRow = useCallback(
    (item: ActivityRow) => {
      if (item.kind === 'header') {
        const allSelected =
          item.transactionIds.length > 0 &&
          item.transactionIds.every((id) => selectedTransactionIdSet.has(id));
        return (
          <DayHeaderRow
            dateLabel={item.dateLabel}
            weekdayLabel={item.weekdayLabel}
            incomeSubtotal={item.incomeSubtotal}
            expenseSubtotal={item.expenseSubtotal}
            isTimeMode={isTimeMode}
            settings={subtotalSettings}
            selectionMode={selectionMode}
            allSelected={allSelected}
            onToggleSelectAll={
              onToggleDaySelection ? () => onToggleDaySelection(item.transactionIds) : undefined
            }
          />
        );
      }

      return (
        <TransactionItem
          transaction={item.transaction}
          onPressTransaction={onTransactionPress}
          onLongPressTransaction={onTransactionLongPress}
          onPressSplitBadge={onTransactionSplitBadgePress}
          selected={selectedTransactionIdSet.has(item.transaction.id)}
          selectionMode={selectionMode}
          disableAnimations={disableItemAnimations}
          compact={compactItems}
          showDateInSubtitle={!groupByDate}
          settings={displaySettings}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        />
      );
    },
    [
      disableItemAnimations,
      compactItems,
      getTrueHourlyRateForDate,
      groupByDate,
      isTimeMode,
      onTransactionPress,
      onTransactionLongPress,
      onTransactionSplitBadgePress,
      onToggleDaySelection,
      selectedTransactionIdSet,
      selectionMode,
      displaySettings,
      subtotalSettings,
    ],
  );
  const renderListItem = useCallback(
    ({ item }: { item: ActivityRow }) => renderRow(item),
    [renderRow],
  );
  const listHeader = useMemo(
    () => (listHeaderComponent ? <>{listHeaderComponent}</> : null),
    [listHeaderComponent],
  );
  const listEmpty = useMemo(
    () => (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        mascotMood="curious"
        animateIn={!disableItemAnimations}
      />
    ),
    [disableItemAnimations, emptyMessage, emptyTitle],
  );

  useEffect(() => {
    if (!scrollToTopRef) return;
    scrollToTopRef.current = () => {
      if (disableVirtualization) {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    };
    return () => {
      scrollToTopRef.current = null;
    };
  }, [disableVirtualization, scrollToTopRef]);

  useEffect(() => {
    if (!scrollToDayRef) return;
    let retryTimers: ReturnType<typeof setTimeout>[] = [];
    const clearRetries = () => {
      retryTimers.forEach(clearTimeout);
      retryTimers = [];
    };
    scrollToDayRef.current = (dayKey: string) => {
      clearRetries();
      const index = rows.findIndex((row) => row.kind === 'header' && row.id === `header-${dayKey}`);
      if (index < 0) {
        // The day has no transactions in this month — fall back to the top.
        flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
        return;
      }
      const jumpToDay = () =>
        flashListRef.current?.scrollToIndex({ index, animated: false, viewOffset: 0 });
      // FlashList positions a far, not-yet-measured row from an average estimate,
      // so a bottom-of-month day (e.g. the 1st) undershoots and lands a section
      // or two short on the first pass. Re-issue the scroll as the intermediate
      // rows get measured so it settles on the exact offset.
      jumpToDay();
      retryTimers = [80, 200, 400].map((delay) => setTimeout(jumpToDay, delay));
    };
    return () => {
      scrollToDayRef.current = null;
      clearRetries();
    };
  }, [rows, scrollToDayRef]);

  if (disableVirtualization) {
    return (
      <ScrollView
        ref={scrollViewRef}
        bounces={!disableScrollBounce}
        overScrollMode={disableScrollBounce ? 'never' : 'auto'}
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        contentContainerStyle={contentContainerStyle}
        {...navScrollProps}
      >
        {listHeader}
        {rows.length === 0
          ? listEmpty
          : rows.map((item) => <React.Fragment key={item.id}>{renderRow(item)}</React.Fragment>)}
      </ScrollView>
    );
  }

  return (
    <FlashList
      ref={flashListRef}
      key={listKey}
      data={rows}
      extraData={selectedTransactionIds}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      drawDistance={420}
      maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_DISABLED}
      removeClippedSubviews
      bounces={!disableScrollBounce}
      overScrollMode={disableScrollBounce ? 'never' : 'auto'}
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      contentContainerStyle={contentContainerStyle}
      renderItem={renderListItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      {...navScrollProps}
    />
  );
});

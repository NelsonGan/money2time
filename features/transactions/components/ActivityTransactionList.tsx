import type { FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Text, TimeValueInline } from '~/components/ui';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { dayKeyFromIsoLocal, formatAmount, formatHours } from '~/utils/formatters';

export type TransactionDisplaySettings = Pick<
  UserSettings,
  'currencySymbol' | 'displayMode'
>;

type ActivityRow =
  | {
      kind: 'header';
      id: string;
      dateLabel: string;
      weekdayLabel: string;
      incomeSubtotal: number;
      expenseSubtotal: number;
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
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
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
  locale?: string;
}

interface DayHeaderRowProps {
  dateLabel: string;
  weekdayLabel: string;
  incomeSubtotal: number;
  expenseSubtotal: number;
  isTimeMode: boolean;
  settings: TransactionDisplaySettings;
}

const DayHeaderRow = memo(function DayHeaderRow({
  dateLabel,
  weekdayLabel,
  incomeSubtotal,
  expenseSubtotal,
  isTimeMode,
  settings,
}: DayHeaderRowProps) {
  const themeColors = useThemeColors();

  return (
    <View className="pt-2 pb-1.5 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
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
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  onTransactionPress,
  onTransactionLongPress,
  selectedTransactionIds = [],
  selectionMode = false,
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
  locale = I18n.locale ?? 'en',
}: ActivityTransactionListProps) {
  const flashListRef = useRef<FlashListRef<ActivityRow> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
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
    const nextRows: ActivityRow[] = [];
    let currentHeaderDay: string | null = null;

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      const dayTotals = dailyTotals.get(dayKey) ?? { income: 0, expense: 0 };
      if (transaction.type === 'income') {
        const value = isTimeMode ? getDisplayValueForTransaction(transaction) : transaction.amount;
        dayTotals.income += value;
      }
      if (transaction.type === 'expense') {
        const value = isTimeMode ? getDisplayValueForTransaction(transaction) : transaction.amount;
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
        };
        const dayHeaders = headerRowsByDay.get(dayKey);
        if (dayHeaders) {
          dayHeaders.push(headerRow);
        } else {
          headerRowsByDay.set(dayKey, [headerRow]);
        }
        nextRows.push(headerRow);
      }
      nextRows.push({ kind: 'item', id: transaction.id, transaction });
    });

    headerRowsByDay.forEach((headerRows, dayKey) => {
      const totals = dailyTotals.get(dayKey);
      if (!totals) return;
      headerRows.forEach((headerRow) => {
        headerRow.incomeSubtotal = totals.income;
        headerRow.expenseSubtotal = totals.expense;
      });
    });

    return nextRows;
  }, [getDisplayValueForTransaction, groupByDate, isTimeMode, locale, transactions]);

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: contentPaddingBottom,
      paddingHorizontal: contentPaddingHorizontal,
      paddingTop: contentPaddingTop,
    }),
    [contentPaddingBottom, contentPaddingHorizontal, contentPaddingTop],
  );

  const keyExtractor = useCallback((item: ActivityRow) => item.id, []);
  const getItemType = useCallback((item: ActivityRow) => item.kind, []);

  const renderRow = useCallback(
    (item: ActivityRow) => {
      if (item.kind === 'header') {
        return (
          <DayHeaderRow
            dateLabel={item.dateLabel}
            weekdayLabel={item.weekdayLabel}
            incomeSubtotal={item.incomeSubtotal}
            expenseSubtotal={item.expenseSubtotal}
            isTimeMode={isTimeMode}
            settings={displaySettings}
          />
        );
      }

      return (
        <TransactionItem
          transaction={item.transaction}
          onPressTransaction={onTransactionPress}
          onLongPressTransaction={onTransactionLongPress}
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
      selectedTransactionIdSet,
      selectionMode,
      displaySettings,
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

  if (disableVirtualization) {
    return (
      <ScrollView
        ref={scrollViewRef}
        bounces={!disableScrollBounce}
        overScrollMode={disableScrollBounce ? 'never' : 'auto'}
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        contentContainerStyle={contentContainerStyle}
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
    />
  );
});

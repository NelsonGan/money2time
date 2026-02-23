import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Text } from '~/components/ui/text';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { useApp } from '~/context/AppContext';
import { dayKeyFromIsoLocal, formatAmount, formatHours } from '~/utils/formatters';
import type { TransactionWithRelations, UserSettings } from '~/types';

type TransactionDisplaySettings = Pick<
  UserSettings,
  'currencySymbol' | 'displayMode' | 'hourRounding'
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

interface ActivityTransactionListProps {
  transactions: TransactionWithRelations[];
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  emptyTitle: string;
  emptyMessage: string;
  listHeaderComponent?: React.ReactNode;
  contentPaddingBottom?: number;
  contentPaddingHorizontal?: number;
  contentPaddingTop?: number;
  listKey?: string;
  disableItemAnimations?: boolean;
  compactItems?: boolean;
  disableVirtualization?: boolean;
  scrollToTopRef?: React.MutableRefObject<(() => void) | null>;
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
            <Text variant="caption" className="text-success">
              {isTimeMode
                ? formatHours(Math.abs(incomeSubtotal))
                : formatAmount(incomeSubtotal, settings, { showSign: false })}
            </Text>
          </View>
        ) : null}
        {expenseSubtotal !== 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-destructive/8">
            <Text variant="caption" className="text-destructive">
              {isTimeMode
                ? formatHours(Math.abs(expenseSubtotal))
                : formatAmount(expenseSubtotal, settings, { showSign: false })}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

function dayKeyFromIso(isoDate: string) {
  return dayKeyFromIsoLocal(isoDate);
}

function formatDayHeaderParts(dayKey: string): { dateLabel: string; weekdayLabel: string } {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { dateLabel: dayKey, weekdayLabel: '' };
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return { dateLabel: dayKey, weekdayLabel: '' };

  const currentYear = new Date().getFullYear();
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: year !== currentYear ? 'numeric' : undefined,
  });
  const weekdayLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
  });

  return { dateLabel, weekdayLabel };
}

export function ActivityTransactionList({
  transactions,
  onTransactionPress,
  emptyTitle,
  emptyMessage,
  listHeaderComponent,
  contentPaddingBottom = 110,
  contentPaddingHorizontal = 18,
  contentPaddingTop = 4,
  listKey,
  disableItemAnimations = false,
  compactItems = false,
  disableVirtualization = false,
  scrollToTopRef,
}: ActivityTransactionListProps) {
  const { settings, getDisplayValueForTransaction, getTrueHourlyRateForDate } = useApp();
  const flashListRef = useRef<FlashListRef<ActivityRow> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const transactionDisplaySettings = useMemo<TransactionDisplaySettings>(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
      hourRounding: settings.hourRounding,
    }),
    [settings.currencySymbol, settings.displayMode, settings.hourRounding],
  );

  const rows = useMemo<ActivityRow[]>(() => {
    const dailyTotals = new Map<string, { income: number; expense: number }>();

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      const current = dailyTotals.get(dayKey) ?? { income: 0, expense: 0 };
      const displayAmount =
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(transaction)
          : transaction.amount;

      if (transaction.type === 'income') current.income += displayAmount;
      if (transaction.type === 'expense') current.expense += displayAmount;

      dailyTotals.set(dayKey, current);
    });

    const nextRows: ActivityRow[] = [];
    let currentHeaderDay: string | null = null;

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      if (dayKey !== currentHeaderDay) {
        currentHeaderDay = dayKey;
        const totals = dailyTotals.get(dayKey) ?? { income: 0, expense: 0 };
        const { dateLabel, weekdayLabel } = formatDayHeaderParts(dayKey);
        nextRows.push({
          kind: 'header',
          id: `header-${dayKey}`,
          dateLabel,
          weekdayLabel,
          incomeSubtotal: totals.income,
          expenseSubtotal: totals.expense,
        });
      }
      nextRows.push({ kind: 'item', id: transaction.id, transaction });
    });

    return nextRows;
  }, [getDisplayValueForTransaction, settings.displayMode, transactions]);

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
            isTimeMode={transactionDisplaySettings.displayMode === 'time'}
            settings={transactionDisplaySettings}
          />
        );
      }

      return (
        <TransactionItem
          transaction={item.transaction}
          onPressTransaction={onTransactionPress}
          disableAnimations={disableItemAnimations}
          compact={compactItems}
          showDateInSubtitle={false}
          settings={transactionDisplaySettings}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        />
      );
    },
    [
      disableItemAnimations,
      compactItems,
      getTrueHourlyRateForDate,
      onTransactionPress,
      transactionDisplaySettings,
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
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      drawDistance={420}
      removeClippedSubviews
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      contentContainerStyle={contentContainerStyle}
      renderItem={renderListItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
    />
  );
}

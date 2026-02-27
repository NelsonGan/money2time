import { Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { Text } from '~/components/ui';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList, DisplayModeToggle } from '~/features/transactions/components';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { formatAmount, formatHours, monthKeyFromIsoLocal } from '~/utils/formatters';

const SIMPLE_TYPE_FILTERS: { label: string; value: 'all' | 'expense' | 'income' }[] = [
  { label: I18n.t('transactions.filters.all'), value: 'all' },
  { label: I18n.t('transactions.filters.spent'), value: 'expense' },
  { label: I18n.t('transactions.filters.earned'), value: 'income' },
];

const FILTER_CHIPS_CONTENT_STYLE = { gap: 8, paddingRight: 12 } as const;
const FLEX_ONE_STYLE = { flex: 1 } as const;
const MONTH_PAGER_TOTAL_SLOTS = 4801;
const MONTH_PAGER_CENTER_INDEX = Math.floor(MONTH_PAGER_TOTAL_SLOTS / 2);
const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

interface MonthSummary {
  count: number;
  income: number;
  expense: number;
}

function emptyMonthSummary(): MonthSummary {
  return { count: 0, income: 0, expense: 0 };
}

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function monthOffsetFromAnchor(anchor: Date, target: Date) {
  return (
    (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth())
  );
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function dateFromMonthKey(month: string): Date | null {
  const match = month.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthValue = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthValue)) return null;
  if (monthValue < 1 || monthValue > 12) return null;
  return new Date(year, monthValue - 1, 1);
}

const FilterPill = React.memo(function FilterPill({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: 'all' | 'expense' | 'income';
  selected: boolean;
  onSelect: (value: 'all' | 'expense' | 'income') => void;
}) {
  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onSelect(value);
  }, [onSelect, value]);

  return (
    <Pressable
      onPress={handlePress}
      className={cn(
        'rounded-full border px-3.5 py-2 flex-row items-center gap-1 active:opacity-85',
        selected ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text variant="label" className={cn(selected ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
});

interface SimpleActivityScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  onPressAddTransaction: () => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
}

export function SimpleActivityScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  onPressAddTransaction,
  onOpenTransaction,
}: SimpleActivityScreenProps) {
  const { transactions, settings, simpleWalletId, getDisplayValueForTransaction } = useApp();
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(1, width);
  const monthPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const monthPagerAnchorDate = useMemo(() => startOfMonth(new Date()), []);
  const [activeMonthIndex, setActiveMonthIndex] = useState(MONTH_PAGER_CENTER_INDEX);
  const activeMonthIndexRef = useRef(MONTH_PAGER_CENTER_INDEX);
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const pageScrollToTopRefs = useRef(
    new Map<number, React.MutableRefObject<(() => void) | null>>(),
  );

  const getPageScrollToTopRef = useCallback((index: number) => {
    const existing = pageScrollToTopRefs.current.get(index);
    if (existing) return existing;
    const next = { current: null as (() => void) | null };
    pageScrollToTopRefs.current.set(index, next);
    return next;
  }, []);

  const activeMonthDate = useMemo(
    () => addMonths(monthPagerAnchorDate, activeMonthIndex - MONTH_PAGER_CENTER_INDEX),
    [activeMonthIndex, monthPagerAnchorDate],
  );
  const activeMonthKey = monthKey(activeMonthDate);
  const activeMonthLabel = formatMonthLabel(activeMonthDate);

  const walletTransactions = useMemo(() => {
    if (!simpleWalletId) return transactions;
    return transactions.filter(
      (tx) =>
        tx.accountId === simpleWalletId ||
        tx.fromAccountId === simpleWalletId ||
        tx.toAccountId === simpleWalletId,
    );
  }, [transactions, simpleWalletId]);

  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'all') return walletTransactions;
    return walletTransactions.filter((tx) => tx.type === typeFilter);
  }, [walletTransactions, typeFilter]);

  const monthBuckets = useMemo(() => {
    const transactionsMap = new Map<string, TransactionWithRelations[]>();
    const summaries = new Map<string, MonthSummary>();
    filteredTransactions.forEach((transaction) => {
      const key = monthKeyFromIsoLocal(transaction.date);
      const list = transactionsMap.get(key);
      if (list) {
        list.push(transaction);
      } else {
        transactionsMap.set(key, [transaction]);
      }
      const summary = summaries.get(key) ?? emptyMonthSummary();
      summary.count += 1;
      const value =
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(transaction)
          : transaction.amount;
      if (transaction.type === 'income') summary.income += value;
      if (transaction.type === 'expense') summary.expense += value;
      summaries.set(key, summary);
    });
    return { transactionsMap, summaries };
  }, [filteredTransactions, getDisplayValueForTransaction, settings.displayMode]);

  const monthSummary = useMemo(
    () => monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary(),
    [activeMonthKey, monthBuckets.summaries],
  );

  const formatSummaryValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? formatHours(value)
        : formatAmount(value, settings, { showSign: false }),
    [settings],
  );

  const monthPagerSlots = useMemo<number[]>(
    () => Array.from({ length: MONTH_PAGER_TOTAL_SLOTS }, (_, index) => index),
    [],
  );

  const clampMonthIndex = useCallback(
    (index: number) => Math.max(0, Math.min(index, MONTH_PAGER_TOTAL_SLOTS - 1)),
    [],
  );

  const updateActiveMonthIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clampMonthIndex(nextIndex);
      if (clampedIndex === activeMonthIndexRef.current) return;
      activeMonthIndexRef.current = clampedIndex;
      setActiveMonthIndex(clampedIndex);
    },
    [clampMonthIndex],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: activeMonthIndexRef.current,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageWidth]);

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: activeMonthIndexRef.current,
        animated: false,
      });
      getPageScrollToTopRef(activeMonthIndexRef.current).current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [getPageScrollToTopRef, scrollToTopToken]);

  useEffect(() => {
    if (focusMonthToken <= 0) return;
    const target = focusMonthKey ? dateFromMonthKey(focusMonthKey) : startOfMonth(new Date());
    if (!target) return;
    const targetDate = startOfMonth(target);
    const targetIndex = clampMonthIndex(
      MONTH_PAGER_CENTER_INDEX + monthOffsetFromAnchor(monthPagerAnchorDate, targetDate),
    );
    activeMonthIndexRef.current = targetIndex;
    setActiveMonthIndex(targetIndex);
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      getPageScrollToTopRef(targetIndex).current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    clampMonthIndex,
    focusMonthKey,
    focusMonthToken,
    getPageScrollToTopRef,
    monthPagerAnchorDate,
  ]);

  const commitOffsetToIndex = useCallback(
    (offsetX: number) => {
      const rawIndex = Math.round(offsetX / pageWidth);
      updateActiveMonthIndex(rawIndex);
    },
    [pageWidth, updateActiveMonthIndex],
  );

  const handleHorizontalMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitOffsetToIndex(event.nativeEvent.contentOffset.x);
    },
    [commitOffsetToIndex],
  );

  const handleHorizontalScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) <= 0.05) {
        commitOffsetToIndex(event.nativeEvent.contentOffset.x);
      }
    },
    [commitOffsetToIndex],
  );

  const handleHorizontalScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const clampedIndex = clampMonthIndex(info.index);
      activeMonthIndexRef.current = clampedIndex;
      setActiveMonthIndex(clampedIndex);
      horizontalListRef.current?.scrollToOffset({
        offset: clampedIndex * pageWidth,
        animated: false,
      });
    },
    [clampMonthIndex, pageWidth],
  );

  const getHorizontalItemLayout = useCallback(
    (_: ArrayLike<number> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );
  const monthPagerKeyExtractor = useCallback((item: number) => String(item), []);

  const scrollToRelativeMonth = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = clampMonthIndex(activeMonthIndexRef.current + direction);
      if (nextIndex === activeMonthIndexRef.current) return;
      activeMonthIndexRef.current = nextIndex;
      setActiveMonthIndex(nextIndex);
      horizontalListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    },
    [clampMonthIndex],
  );

  const handlePrevMonth = useCallback(() => scrollToRelativeMonth(-1), [scrollToRelativeMonth]);
  const handleNextMonth = useCallback(() => scrollToRelativeMonth(1), [scrollToRelativeMonth]);

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      const monthDate = addMonths(monthPagerAnchorDate, item - MONTH_PAGER_CENTER_INDEX);
      const pageMonthKey = monthKey(monthDate);
      const pageTransactions = monthBuckets.transactionsMap.get(pageMonthKey) ?? EMPTY_TRANSACTIONS;
      return (
        <View style={monthPageStyle} className="flex-1 bg-background">
          <ActivityTransactionList
            transactions={pageTransactions}
            onTransactionPress={onOpenTransaction}
            emptyTitle={I18n.t('transactions.empty_month_title')}
            emptyMessage={I18n.t('transactions.empty_month_message')}
            contentPaddingBottom={LIST_BOTTOM_PADDING}
            disableItemAnimations
            compactItems
            listKey={pageMonthKey}
            scrollToTopRef={getPageScrollToTopRef(item)}
          />
        </View>
      );
    },
    [
      getPageScrollToTopRef,
      monthBuckets.transactionsMap,
      monthPagerAnchorDate,
      monthPageStyle,
      onOpenTransaction,
    ],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
            {SIMPLE_TYPE_FILTERS.map((item) => (
              <FilterPill
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

      <View className="flex-1 overflow-hidden bg-background">
        <FlatList
          ref={horizontalListRef}
          data={monthPagerSlots}
          keyExtractor={monthPagerKeyExtractor}
          style={FLEX_ONE_STYLE}
          horizontal
          pagingEnabled
          disableIntervalMomentum
          bounces={false}
          directionalLockEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          nestedScrollEnabled
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          renderItem={renderMonthPage}
          initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
          getItemLayout={getHorizontalItemLayout}
          removeClippedSubviews
          onScrollEndDrag={handleHorizontalScrollEndDrag}
          onMomentumScrollEnd={handleHorizontalMomentumEnd}
          onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
        onPress={() => {
          void triggerHaptic('medium');
          onPressAddTransaction();
        }}
        className="absolute right-5 bottom-6 h-14 w-14 rounded-full bg-primary items-center justify-center border border-primary/45 shadow-soft"
      >
        <Plus size={24} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

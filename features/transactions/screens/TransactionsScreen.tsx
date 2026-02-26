import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, X } from 'lucide-react-native';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { SelectField } from '~/components/ui/select';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { ActivityTransactionList, DisplayModeToggle } from '~/features/transactions/components';
import { AccountPanel, CategoryPanel, DatePanel } from '~/features/transactions/components/editor';
import { EditTransactionScreen } from './EditTransactionScreen';
import { useApp } from '~/context/AppContext';
import { formatAmount, formatDateInput, formatHours, monthKeyFromIsoLocal } from '~/utils/formatters';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionType, TransactionWithRelations } from '~/types';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import { useThemeColors } from '~/hooks/useThemeColors';

const TYPE_FILTERS: { label: string; value: 'all' | TransactionType }[] = [
  { label: I18n.t('transactions.filters.all'), value: 'all' },
  { label: I18n.t('transactions.filters.spent'), value: 'expense' },
  { label: I18n.t('transactions.filters.earned'), value: 'income' },
  { label: I18n.t('transactions.filters.moved'), value: 'transfer' },
  { label: I18n.t('transactions.filters.adjustment'), value: 'balance_adjustment' },
];

const SORT_OPTIONS = [
  { label: I18n.t('transactions.sort.newest'), value: 'date_desc' },
  { label: I18n.t('transactions.sort.oldest'), value: 'date_asc' },
  { label: I18n.t('transactions.sort.high'), value: 'amount_desc' },
  { label: I18n.t('transactions.sort.low'), value: 'amount_asc' },
] as const;
type SortByValue = (typeof SORT_OPTIONS)[number]['value'];

const FLEX_ONE_STYLE = { flex: 1 } as const;
const FILTER_SCROLL_CONTENT_STYLE = { padding: 20, paddingBottom: 34, gap: 14 } as const;
const FILTER_CHIPS_CONTENT_STYLE = { gap: 8, paddingRight: 12 } as const;
const FILTER_SELECTION_PANEL_CLASS =
  'rounded-[18px] border-2 border-border/60 bg-card/80 shadow-soft overflow-hidden';
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

const FilterPill = React.memo(function FilterPill({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: 'all' | TransactionType;
  selected: boolean;
  onSelect: (value: 'all' | TransactionType) => void;
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

function monthKeyFromIso(isoDate: string) {
  return monthKeyFromIsoLocal(isoDate);
}

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

interface TransactionsScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  onPressAddTransaction?: () => void;
}

export function TransactionsScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  onPressAddTransaction,
}: TransactionsScreenProps) {
  const themeColors = useThemeColors();
  const {
    filteredTransactions,
    settings,
    transactionFilters,
    setTransactionFilters,
    resetTransactionFilters,
    updateTransaction,
    deleteTransaction,
    accounts,
    accountGroups,
    categories,
    getDisplayValueForTransaction,
  } = useApp();

  const [showFilters, setShowFilters] = useState(false);
  const [isSearchBoxOpen, setIsSearchBoxOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const lastSelectedTransactionRef = useRef<TransactionWithRelations | null>(null);
  if (selectedTransaction) lastSelectedTransactionRef.current = selectedTransaction;
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const hasActiveSearch = transactionFilters.search.trim().length > 0;
  const searchInputRef = useRef<TextInput | null>(null);
  const searchResultsScrollToTopRef = useRef<(() => void) | null>(null);
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
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;
  const monthBuckets = useMemo(() => {
    const transactionsMap = new Map<string, TransactionWithRelations[]>();
    const summaries = new Map<string, MonthSummary>();
    filteredTransactions.forEach((transaction) => {
      const key = monthKeyFromIso(transaction.date);
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

  useEffect(() => {
    if (selectedTransactionIds.length === 0) return;
    const availableIds = new Set(filteredTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [filteredTransactions, selectedTransactionIds.length]);

  useEffect(() => {
    if (isSelectionMode) {
      setSelectedTransaction(null);
      setIsSearchBoxOpen(false);
      return;
    }
    setShowBulkUpdate(false);
  }, [isSelectionMode]);

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
      if (hasActiveSearch) {
        searchResultsScrollToTopRef.current?.();
        return;
      }
      const currentIndex = activeMonthIndexRef.current;
      horizontalListRef.current?.scrollToIndex({ index: currentIndex, animated: false });
      getPageScrollToTopRef(currentIndex).current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [getPageScrollToTopRef, hasActiveSearch, scrollToTopToken]);

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

  const scrollToRelativeMonth = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = clampMonthIndex(activeMonthIndexRef.current + direction);
      if (nextIndex === activeMonthIndexRef.current) return;
      activeMonthIndexRef.current = nextIndex;
      setActiveMonthIndex(nextIndex);
      horizontalListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      });
    },
    [clampMonthIndex],
  );

  const monthSummary = useMemo(() => {
    if (hasActiveSearch) {
      const summary = emptyMonthSummary();
      filteredTransactions.forEach((transaction) => {
        summary.count += 1;
        const value =
          settings.displayMode === 'time'
            ? getDisplayValueForTransaction(transaction)
            : transaction.amount;
        if (transaction.type === 'income') summary.income += value;
        if (transaction.type === 'expense') summary.expense += value;
      });
      return summary;
    }
    return monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary();
  }, [
    activeMonthKey,
    filteredTransactions,
    getDisplayValueForTransaction,
    hasActiveSearch,
    monthBuckets.summaries,
    settings.displayMode,
  ]);
  const formatSummaryValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? formatHours(value)
        : formatAmount(value, settings, { showSign: false }),
    [settings],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (transactionFilters.type !== 'all') count += 1;
    if (transactionFilters.accountId) count += 1;
    if (transactionFilters.categoryId) count += 1;
    if (transactionFilters.minAmount !== null) count += 1;
    if (transactionFilters.maxAmount !== null) count += 1;
    if (transactionFilters.sortBy !== 'date_desc') count += 1;
    return count;
  }, [
    transactionFilters.accountId,
    transactionFilters.categoryId,
    transactionFilters.maxAmount,
    transactionFilters.minAmount,
    transactionFilters.sortBy,
    transactionFilters.type,
  ]);
  const categoryPanelParents = useMemo(
    () => {
      const parents = categories.filter((category) => !category.parentId);
      return parents.map((category) => ({
        id: category.id,
        name: category.name,
        icon: resolveCategoryIcon(category.icon),
      }));
    },
    [categories],
  );
  const categoryPanelChildren = useMemo(() => {
    const parentIconById = new Map(
      categories.filter((category) => !category.parentId).map((category) => [category.id, category.icon]),
    );
    const grouped = new Map<string, { id: string; name: string; icon: string }[]>();
    categories
      .filter((category) => !!category.parentId)
      .forEach((category) => {
        const parentId = category.parentId as string;
        const list = grouped.get(parentId) ?? [];
        list.push({
          id: category.id,
          name: category.name,
          icon: resolveCategoryIcon(category.icon, parentIconById.get(parentId) ?? null),
        });
        grouped.set(parentId, list);
      });
    return grouped;
  }, [categories]);
  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const handlePrevMonth = useCallback(() => scrollToRelativeMonth(-1), [scrollToRelativeMonth]);
  const handleNextMonth = useCallback(() => scrollToRelativeMonth(1), [scrollToRelativeMonth]);
  const handleOpenSearch = useCallback(() => {
    void triggerHaptic('light');
    setIsSearchBoxOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);
  const handleCloseSearch = useCallback(() => {
    void triggerHaptic('light');
    if (transactionFilters.search.length > 0) {
      setTransactionFilters({ search: '' });
    }
    searchInputRef.current?.blur();
    setIsSearchBoxOpen(false);
  }, [setTransactionFilters, transactionFilters.search]);
  const handleOpenFilters = useCallback(() => {
    setIsSearchBoxOpen(false);
    setShowFilters(true);
  }, []);
  const handleCloseFilters = useCallback(() => setShowFilters(false), []);
  const handleCloseTransactionEditor = useCallback(() => setSelectedTransaction(null), []);
  const clearSelection = useCallback(() => {
    void triggerHaptic('selection');
    setSelectedTransactionIds([]);
  }, []);
  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) =>
      previous.includes(transactionId)
        ? previous.filter((id) => id !== transactionId)
        : [...previous, transactionId],
    );
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isSelectionMode, toggleTransactionSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleTransactionSelection],
  );
  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setBulkDate(formatDateInput(new Date()));
    setBulkDateTouched(false);
    setBulkNote('');
    setBulkNoteTouched(false);
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    if (!hasBulkChanges) return;

    const updates: { date?: string; note?: string | null } = {};
    if (bulkDateTouched) updates.date = bulkDate;
    if (bulkNoteTouched) {
      const normalizedNote = bulkNote.trim();
      updates.note = normalizedNote.length > 0 ? normalizedNote : null;
    }
    if (Object.keys(updates).length === 0) return;

    selectedTransactionIds.forEach((transactionId) => {
      updateTransaction(transactionId, updates);
    });
    void triggerHaptic('success');
    setShowBulkUpdate(false);
    setSelectedTransactionIds([]);
  }, [
    bulkDate,
    bulkDateTouched,
    bulkNote,
    bulkNoteTouched,
    hasBulkChanges,
    selectedTransactionIds,
    updateTransaction,
  ]);
  const handleDeleteSelectedTransactions = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToDelete = [...selectedTransactionIds];
    Alert.alert(
      I18n.t('transactions.selection.delete_title'),
      I18n.t('transactions.selection.delete_message', { count: idsToDelete.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            idsToDelete.forEach((transactionId) => {
              deleteTransaction(transactionId);
            });
            setShowBulkUpdate(false);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransaction, selectedTransactionIds]);
  const handleResetFilters = useCallback(() => {
    void triggerHaptic('selection');
    resetTransactionFilters();
  }, [resetTransactionFilters]);
  const handleDoneFilters = useCallback(() => {
    void triggerHaptic('selection');
    setShowFilters(false);
  }, []);
  const handleSelectAccountFilter = useCallback(
    (accountId: string) => {
      setTransactionFilters({ accountId });
    },
    [setTransactionFilters],
  );
  const handleSelectCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({ categoryId });
    },
    [setTransactionFilters],
  );
  const handleResetAccountFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ accountId: null });
  }, [setTransactionFilters]);
  const handleResetCategoryFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ categoryId: null });
  }, [setTransactionFilters]);
  const handleSearchChange = useCallback(
    (text: string) => {
      setTransactionFilters({ search: text });
    },
    [setTransactionFilters],
  );
  const handleTypeChange = useCallback(
    (type: TransactionType | 'all') => {
      setTransactionFilters({ type });
    },
    [setTransactionFilters],
  );
  const handleMinAmountChange = useCallback(
    (text: string) => {
      setTransactionFilters({ minAmount: text ? Number(text) : null });
    },
    [setTransactionFilters],
  );
  const handleMaxAmountChange = useCallback(
    (text: string) => {
      setTransactionFilters({ maxAmount: text ? Number(text) : null });
    },
    [setTransactionFilters],
  );
  const handleSortChange = useCallback(
    (value: string) => {
      setTransactionFilters({ sortBy: value as SortByValue });
    },
    [setTransactionFilters],
  );

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      const monthDate = addMonths(monthPagerAnchorDate, item - MONTH_PAGER_CENTER_INDEX);
      const pageMonthKey = monthKey(monthDate);
      const pageTransactions = monthBuckets.transactionsMap.get(pageMonthKey) ?? EMPTY_TRANSACTIONS;
      return (
        <View style={monthPageStyle} className="flex-1 bg-background">
          <ActivityTransactionList
            transactions={pageTransactions}
            onTransactionPress={handleTransactionPress}
            onTransactionLongPress={handleTransactionLongPress}
            selectedTransactionIds={selectedTransactionIds}
            selectionMode={isSelectionMode}
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
      handleTransactionLongPress,
      handleTransactionPress,
      isSelectionMode,
      monthBuckets.transactionsMap,
      monthPagerAnchorDate,
      monthPageStyle,
      selectedTransactionIds,
    ],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MonthControlsHeader
        title={isSelectionMode ? undefined : I18n.t('transactions.title')}
        titleNode={
          isSelectionMode ? (
            <View
              className="rounded-full bg-card border border-border/40 px-3 flex-row items-center justify-between gap-2"
              style={{ height: 40 }}
            >
              <Pressable
                onPress={clearSelection}
                className="rounded-full bg-secondary/70 px-3 py-1 active:opacity-85"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.cancel')}
                </Text>
              </Pressable>

              <Text variant="caption" className="text-foreground">
                {I18n.t('transactions.selection.selected_count', { count: selectedTransactionCount })}
              </Text>

              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={handleOpenBulkUpdate}
                  className="rounded-full bg-primary/12 border border-primary/35 px-2.5 py-1 active:opacity-85"
                >
                  <Text variant="caption" className="text-primary">
                    {I18n.t('transactions.selection.update')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDeleteSelectedTransactions}
                  className="rounded-full bg-destructive/10 border border-destructive/35 px-2.5 py-1 active:opacity-85"
                >
                  <Text variant="caption" className="text-destructive">
                    {I18n.t('common.delete')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : undefined
        }
        monthLabel={hasActiveSearch ? I18n.t('transactions.filters.search') : activeMonthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        actions={
          isSelectionMode ? undefined : (
            <View className="flex-row items-center gap-2">
              <DisplayModeToggle />
              <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t('transactions.filters.search')}
                onPress={handleOpenSearch}
                className={cn(
                  'h-10 w-10 items-center justify-center rounded-full border active:opacity-85',
                  isSearchBoxOpen || hasActiveSearch
                    ? 'border-primary/45 bg-primary/10'
                    : 'border-border/40 bg-card',
                )}
              >
                <Search
                  size={15}
                  color={
                    isSearchBoxOpen || hasActiveSearch ? themeColors.primary : themeColors.textMuted
                  }
                />
              </Pressable>
            </View>
          )
        }
      >
        <View className="gap-2">
          {isSearchBoxOpen ? (
            <View className="flex-row items-center gap-2">
              <Input
                ref={searchInputRef}
                containerClassName="flex-1"
                placeholder={I18n.t('transactions.filters.search_placeholder')}
                value={transactionFilters.search}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                leftIcon={<Search size={16} color={themeColors.textMuted} />}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                onPress={handleCloseSearch}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-card active:opacity-85"
              >
                <X size={14} color={themeColors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <InOutHeader
            incomeValue={formatSummaryValue(monthSummary.income)}
            expenseValue={formatSummaryValue(monthSummary.expense)}
          />
        </View>
      </MonthControlsHeader>

      <View className="flex-1 overflow-hidden bg-background">
        {hasActiveSearch ? (
          <ActivityTransactionList
            transactions={filteredTransactions}
            onTransactionPress={handleTransactionPress}
            onTransactionLongPress={handleTransactionLongPress}
            selectedTransactionIds={selectedTransactionIds}
            selectionMode={isSelectionMode}
            emptyTitle={I18n.t('transactions.empty_search_title')}
            emptyMessage={I18n.t('transactions.empty_search_message')}
            contentPaddingBottom={LIST_BOTTOM_PADDING}
            disableItemAnimations
            compactItems
            listKey={`search-${transactionFilters.search.trim().toLowerCase()}`}
            scrollToTopRef={searchResultsScrollToTopRef}
          />
        ) : (
          <FlatList
            ref={horizontalListRef}
            data={monthPagerSlots}
            keyExtractor={(item) => String(item)}
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
        )}
      </View>

      {onPressAddTransaction && !isSelectionMode ? (
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
      ) : null}

      <ThemeModal
        visible={!!selectedTransaction}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseTransactionEditor}
      >
        {(selectedTransaction || lastSelectedTransactionRef.current) ? (
          <EditTransactionScreen
            transaction={(selectedTransaction ?? lastSelectedTransactionRef.current)!}
            onClose={handleCloseTransactionEditor}
          />
        ) : null}
      </ThemeModal>

      <ThemeModal
        visible={showBulkUpdate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseBulkUpdate}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text variant="subheading">
                {I18n.t('transactions.selection.update_title', { count: selectedTransactionCount })}
              </Text>
              <Text variant="friendly" tone="muted">
                {I18n.t('transactions.selection.update_subtitle')}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleCloseBulkUpdate}
                className="px-3 py-2 rounded-full bg-secondary/70"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleApplyBulkUpdate}
                disabled={!hasBulkChanges}
                className={cn(
                  'px-3 py-2 rounded-full',
                  hasBulkChanges ? 'bg-primary' : 'bg-secondary/70',
                )}
              >
                <Text variant="caption" className={cn(hasBulkChanges ? 'text-white' : 'text-muted-foreground')}>
                  {I18n.t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={FILTER_SCROLL_CONTENT_STYLE}>
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.editor.date')}
              </Text>
              <View
                className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                style={{ height: 360 }}
              >
                <DatePanel
                  value={bulkDate}
                  onSelect={(value) => {
                    setBulkDate(value);
                    setBulkDateTouched(true);
                  }}
                />
              </View>
            </View>

            <View className="gap-2.5">
              <Input
                label={I18n.t('transaction_detail.note')}
                placeholder={I18n.t('transactions.editor.optional')}
                value={bulkNote}
                onChangeText={(value) => {
                  setBulkNote(value);
                  setBulkNoteTouched(true);
                }}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </ThemeModal>

      <ThemeModal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseFilters}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
            <View>
              <Text variant="subheading">{I18n.t('transactions.filters.title')}</Text>
              <Text variant="friendly" tone="muted">
                {I18n.t('transactions.filters.subtitle')}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleResetFilters}
                className="px-3 py-2 rounded-full bg-secondary/70"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.reset')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDoneFilters}
                className="px-3 py-2 rounded-full bg-secondary"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={FILTER_SCROLL_CONTENT_STYLE}>
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.filters.type')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={FILTER_CHIPS_CONTENT_STYLE}
              >
                {TYPE_FILTERS.map((item) => (
                  <FilterPill
                    key={item.value}
                    label={item.label}
                    value={item.value}
                    selected={transactionFilters.type === item.value}
                    onSelect={handleTypeChange}
                  />
                ))}
              </ScrollView>
            </View>

            <View className="gap-2.5">
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.filters.account')}
                </Text>
                <FilterPill
                  label={I18n.t('transactions.filters.all_accounts')}
                  value="all"
                  selected={transactionFilters.accountId === null}
                  onSelect={handleResetAccountFilter}
                />
              </View>
              <View
                className={FILTER_SELECTION_PANEL_CLASS}
                style={{ height: 236 }}
              >
                <AccountPanel
                  accounts={accounts}
                  accountGroups={accountGroups}
                  selectedId={transactionFilters.accountId}
                  onSelect={handleSelectAccountFilter}
                />
              </View>
            </View>

            <View className="gap-2.5">
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.filters.category')}
                </Text>
                <FilterPill
                  label={I18n.t('transactions.filters.all_categories')}
                  value="all"
                  selected={transactionFilters.categoryId === null}
                  onSelect={handleResetCategoryFilter}
                />
              </View>
              <View
                className={FILTER_SELECTION_PANEL_CLASS}
                style={{ height: 236 }}
              >
                <CategoryPanel
                  parents={categoryPanelParents}
                  childByParent={categoryPanelChildren}
                  selectedCategoryId={transactionFilters.categoryId}
                  onSelect={handleSelectCategoryFilter}
                />
              </View>
            </View>

            <View className="gap-2.5">
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label={I18n.t('transactions.filters.min')}
                    variant="numeric"
                    value={
                      transactionFilters.minAmount !== null
                        ? String(transactionFilters.minAmount)
                        : ''
                    }
                    onChangeText={handleMinAmountChange}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={I18n.t('transactions.filters.max')}
                    variant="numeric"
                    value={
                      transactionFilters.maxAmount !== null
                        ? String(transactionFilters.maxAmount)
                        : ''
                    }
                    onChangeText={handleMaxAmountChange}
                  />
                </View>
              </View>
            </View>

            <SelectField
              label={I18n.t('transactions.filters.sort')}
              value={transactionFilters.sortBy}
              onChange={handleSortChange}
              options={sortOptions}
            />
          </ScrollView>
        </SafeAreaView>
      </ThemeModal>
    </SafeAreaView>
  );
}

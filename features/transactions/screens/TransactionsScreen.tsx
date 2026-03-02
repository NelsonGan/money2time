import { Pencil, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { Input, SelectField, Text, ThemeModal } from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  ActivityTransactionList,
  DisplayModeToggle,
  MonthPagerPage,
  TypeFilterPill,
} from '~/features/transactions/components';
import { AccountPanel, CategoryPanel, DatePanel } from '~/features/transactions/components/editor';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { useFocusMonthNavigation } from '~/hooks/useFocusMonthNavigation';
import { useIndexedScrollToTopRefs } from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useScrollToTopTokenNavigation } from '~/hooks/useScrollToTopTokenNavigation';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType, TransactionType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  addMonthsAtMonthStart,
  formatAmount,
  formatDateInput,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import {
  bucketTransactionsByMonth,
  emptyMonthSummary,
  summarizeTransactions,
} from '~/utils/transactions';

const SORT_OPTION_VALUES = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
type SortByValue = (typeof SORT_OPTION_VALUES)[number];

const FLEX_ONE_STYLE = { flex: 1 } as const;
const FILTER_SCROLL_CONTENT_STYLE = {
  padding: spacing.md,
  paddingBottom: spacing.xl + spacing.xs,
  gap: spacing.sm,
} as const;
const FILTER_CHIPS_CONTENT_STYLE = { gap: spacing.xs, paddingRight: spacing.sm } as const;
const FILTER_SELECTION_PANEL_CLASS =
  'rounded-[18px] border-2 border-border/60 bg-card/80 shadow-soft overflow-hidden';
const SELECTION_PANEL_HEIGHT = 236;
const BULK_DATE_PANEL_HEIGHT = 360;

interface CategoryPanelItem {
  id: string;
  name: string;
  icon: string;
}

interface CategoryPanelData {
  parents: CategoryPanelItem[];
  childrenByParent: Map<string, CategoryPanelItem[]>;
}

function buildCategoryPanelData(categories: Category[], type: CategoryType): CategoryPanelData {
  const parentCategories = categories.filter(
    (category) => category.type === type && category.parentId === null,
  );
  const parentIconById = new Map(parentCategories.map((category) => [category.id, category.icon]));
  const parents = parentCategories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: resolveCategoryIcon(category.icon),
  }));
  const childrenByParent = new Map<string, CategoryPanelItem[]>();

  categories.forEach((category) => {
    if (category.type !== type || category.parentId === null) return;
    const parentId = category.parentId;
    const list = childrenByParent.get(parentId) ?? [];
    list.push({
      id: category.id,
      name: category.name,
      icon: resolveCategoryIcon(category.icon, parentIconById.get(parentId) ?? null),
    });
    childrenByParent.set(parentId, list);
  });

  return { parents, childrenByParent };
}

function isSortByValue(value: string): value is SortByValue {
  return SORT_OPTION_VALUES.includes(value as SortByValue);
}

interface TransactionsScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
}

export function TransactionsScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  onOpenTransaction,
  onSelectionModeChange,
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
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [showFilters, setShowFilters] = useState(false);
  const [isSearchBoxOpen, setIsSearchBoxOpen] = useState(false);
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
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const selectedTransactionIdSet = useMemo(
    () => new Set(selectedTransactionIds),
    [selectedTransactionIds],
  );
  const selectedTransactionTotal = useMemo(
    () =>
      filteredTransactions.reduce(
        (sum, transaction) =>
          selectedTransactionIdSet.has(transaction.id) ? sum + transaction.amount : sum,
        0,
      ),
    [filteredTransactions, selectedTransactionIdSet],
  );
  const selectedTransactionTotalLabel = useMemo(
    () =>
      formatAmount(
        Math.abs(selectedTransactionTotal),
        {
          currencySymbol: settings.currencySymbol,
          displayMode: 'money',
          hourRounding: settings.hourRounding,
        },
        { showSign: false, trueHourlyRate: 0 },
      ),
    [selectedTransactionTotal, settings.currencySymbol, settings.hourRounding],
  );
  const selectedTransactionTotalToneClass =
    selectedTransactionTotal > 0
      ? 'text-success'
      : selectedTransactionTotal < 0
        ? 'text-destructive'
        : 'text-muted-foreground';
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;
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
      setIsSearchBoxOpen(false);
      return;
    }
    setShowBulkUpdate(false);
  }, [isSelectionMode]);

  useEffect(() => {
    onSelectionModeChange?.(isSelectionMode);
    return () => {
      onSelectionModeChange?.(false);
    };
  }, [isSelectionMode, onSelectionModeChange]);

  const handleSearchScrollToTop = useCallback(() => {
    if (!hasActiveSearch) return false;
    searchResultsScrollToTopRef.current?.();
    return true;
  }, [hasActiveSearch]);

  useScrollToTopTokenNavigation({
    scrollToTopToken,
    activeIndexRef: activeMonthIndexRef,
    listRef: horizontalListRef,
    getScrollToTopRef: getPageScrollToTopRef,
    onBeforePageScroll: handleSearchScrollToTop,
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

  const monthSummary = useMemo(() => {
    if (hasActiveSearch) {
      return summarizeTransactions(filteredTransactions, resolveTransactionValue);
    }
    return monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary();
  }, [
    activeMonthKey,
    filteredTransactions,
    hasActiveSearch,
    monthBuckets.summaries,
    resolveTransactionValue,
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
    if (
      (transactionFilters.type === 'all' || transactionFilters.type === 'income') &&
      transactionFilters.incomeCategoryId
    ) {
      count += 1;
    }
    if (
      (transactionFilters.type === 'all' || transactionFilters.type === 'expense') &&
      transactionFilters.expenseCategoryId
    ) {
      count += 1;
    }
    if (transactionFilters.minAmount !== null) count += 1;
    if (transactionFilters.maxAmount !== null) count += 1;
    if (transactionFilters.sortBy !== 'date_desc') count += 1;
    return count;
  }, [
    transactionFilters.accountId,
    transactionFilters.expenseCategoryId,
    transactionFilters.incomeCategoryId,
    transactionFilters.maxAmount,
    transactionFilters.minAmount,
    transactionFilters.sortBy,
    transactionFilters.type,
  ]);
  const incomeCategoryPanelData = useMemo(
    () => buildCategoryPanelData(categories, 'income'),
    [categories],
  );
  const expenseCategoryPanelData = useMemo(
    () => buildCategoryPanelData(categories, 'expense'),
    [categories],
  );
  const shouldShowIncomeCategoryFilter =
    transactionFilters.type === 'all' || transactionFilters.type === 'income';
  const shouldShowExpenseCategoryFilter =
    transactionFilters.type === 'all' || transactionFilters.type === 'expense';
  const typeFilters = useMemo(
    () =>
      [
        { label: I18n.t('transactions.filters.all'), value: 'all' },
        { label: I18n.t('transactions.filters.spent'), value: 'expense' },
        { label: I18n.t('transactions.filters.earned'), value: 'income' },
        { label: I18n.t('transactions.filters.moved'), value: 'transfer' },
        { label: I18n.t('transactions.filters.adjustment'), value: 'balance_adjustment' },
      ] satisfies Array<{ label: string; value: 'all' | TransactionType }>,
    [],
  );
  const sortOptions = useMemo(
    () => [
      { value: 'date_desc', label: I18n.t('transactions.sort.newest') },
      { value: 'date_asc', label: I18n.t('transactions.sort.oldest') },
      { value: 'amount_desc', label: I18n.t('transactions.sort.high') },
      { value: 'amount_asc', label: I18n.t('transactions.sort.low') },
    ],
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
      onOpenTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleTransactionSelection],
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
  const handleSelectIncomeCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({ incomeCategoryId: categoryId, categoryId: null });
    },
    [setTransactionFilters],
  );
  const handleSelectExpenseCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({ expenseCategoryId: categoryId, categoryId: null });
    },
    [setTransactionFilters],
  );
  const handleResetAccountFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ accountId: null });
  }, [setTransactionFilters]);
  const handleResetIncomeCategoryFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ incomeCategoryId: null, categoryId: null });
  }, [setTransactionFilters]);
  const handleResetExpenseCategoryFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ expenseCategoryId: null, categoryId: null });
  }, [setTransactionFilters]);
  const handleSearchChange = useCallback(
    (text: string) => {
      setTransactionFilters({ search: text });
    },
    [setTransactionFilters],
  );
  const handleTypeChange = useCallback(
    (type: TransactionType | 'all') => {
      setTransactionFilters({ type, categoryId: null });
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
      if (!isSortByValue(value)) return;
      setTransactionFilters({ sortBy: value });
    },
    [setTransactionFilters],
  );

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
          onTransactionPress={handleTransactionPress}
          onTransactionLongPress={handleTransactionLongPress}
          selectedTransactionIds={selectedTransactionIds}
          selectionMode={isSelectionMode}
          getScrollToTopRef={getPageScrollToTopRef}
        />
      );
    },
    [
      getPageScrollToTopRef,
      handleTransactionLongPress,
      handleTransactionPress,
      activeLocale,
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
        title={I18n.t('transactions.title')}
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
          <View style={styles.summarySlot}>
            {isSelectionMode ? (
              <View className="rounded-2xl bg-card border border-border/40 px-3.5 py-2.5 flex-row items-center justify-between gap-2">
                <Pressable
                  onPress={clearSelection}
                  className="rounded-full bg-secondary/70 px-3 py-1.5 active:opacity-85"
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.cancel')}
                >
                  <Text variant="caption" tone="muted">
                    {I18n.t('common.cancel')}
                  </Text>
                </Pressable>

                <View className="flex-1 items-center px-1">
                  <View className="flex-row flex-wrap items-center justify-center gap-1.5">
                    <Text variant="caption" className="text-foreground">
                      {I18n.t('transactions.selection.selected_count', {
                        count: selectedTransactionCount,
                      })}
                    </Text>
                    <View className="rounded-full border border-border/35 bg-secondary/70 px-2 py-[3px]">
                      <Text variant="label" className={selectedTransactionTotalToneClass}>
                        {selectedTransactionTotalLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={handleOpenBulkUpdate}
                    className="h-9 w-9 rounded-full bg-primary/12 border border-primary/35 items-center justify-center active:opacity-85"
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('transactions.selection.update')}
                    hitSlop={8}
                  >
                    <Pencil size={14} color={themeColors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteSelectedTransactions}
                    className="h-9 w-9 rounded-full bg-destructive/10 border border-destructive/35 items-center justify-center active:opacity-85"
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('common.delete')}
                    hitSlop={8}
                  >
                    <Trash2 size={14} color={themeColors.coral} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <InOutHeader
                incomeValue={formatSummaryValue(monthSummary.income)}
                expenseValue={formatSummaryValue(monthSummary.expense)}
              />
            )}
          </View>
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
        )}
      </View>

      <ThemeModal
        visible={showBulkUpdate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseBulkUpdate}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View style={styles.modalHeaderRow}>
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
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.cancel')}
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
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.save')}
                accessibilityState={{ disabled: !hasBulkChanges }}
              >
                <Text
                  variant="caption"
                  className={cn(hasBulkChanges ? 'text-white' : 'text-muted-foreground')}
                >
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
                style={styles.bulkDatePanel}
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
          <View style={styles.modalHeaderRow}>
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
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.reset')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.reset')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDoneFilters}
                className="px-3 py-2 rounded-full bg-secondary"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.done')}
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
                {typeFilters.map((item) => (
                  <TypeFilterPill
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
                <TypeFilterPill
                  label={I18n.t('transactions.filters.all_accounts')}
                  value="all"
                  selected={transactionFilters.accountId === null}
                  onSelect={handleResetAccountFilter}
                />
              </View>
              <View className={FILTER_SELECTION_PANEL_CLASS} style={styles.selectionPanel}>
                <AccountPanel
                  accounts={accounts}
                  accountGroups={accountGroups}
                  selectedId={transactionFilters.accountId}
                  onSelect={handleSelectAccountFilter}
                />
              </View>
            </View>

            {shouldShowIncomeCategoryFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.filters.income_category')}
                  </Text>
                  <TypeFilterPill
                    label={I18n.t('transactions.filters.all_income_categories')}
                    value="all"
                    selected={transactionFilters.incomeCategoryId === null}
                    onSelect={handleResetIncomeCategoryFilter}
                  />
                </View>
                <View className={FILTER_SELECTION_PANEL_CLASS} style={styles.selectionPanel}>
                  <CategoryPanel
                    parents={incomeCategoryPanelData.parents}
                    childByParent={incomeCategoryPanelData.childrenByParent}
                    allowParentSelection
                    selectedCategoryId={transactionFilters.incomeCategoryId}
                    onSelect={handleSelectIncomeCategoryFilter}
                  />
                </View>
              </View>
            ) : null}

            {shouldShowExpenseCategoryFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.filters.expense_category')}
                  </Text>
                  <TypeFilterPill
                    label={I18n.t('transactions.filters.all_expense_categories')}
                    value="all"
                    selected={transactionFilters.expenseCategoryId === null}
                    onSelect={handleResetExpenseCategoryFilter}
                  />
                </View>
                <View className={FILTER_SELECTION_PANEL_CLASS} style={styles.selectionPanel}>
                  <CategoryPanel
                    parents={expenseCategoryPanelData.parents}
                    childByParent={expenseCategoryPanelData.childrenByParent}
                    allowParentSelection
                    selectedCategoryId={transactionFilters.expenseCategoryId}
                    onSelect={handleSelectExpenseCategoryFilter}
                  />
                </View>
              </View>
            ) : null}

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

const styles = StyleSheet.create({
  summarySlot: {
    minHeight: 56,
    justifyContent: 'center',
  },
  modalHeaderRow: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionPanel: {
    height: SELECTION_PANEL_HEIGHT,
  },
  bulkDatePanel: {
    height: BULK_DATE_PANEL_HEIGHT,
  },
});

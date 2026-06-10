import { ChevronRight, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  CategoryPickerSheet,
  Input,
  SelectField,
  Text,
  ThemeModal,
  TimeValueInline,
} from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  ActivitySearchRow,
  ActivityTransactionList,
  DisplayModeToggle,
  MonthJumpPopover,
  MonthPagerPage,
} from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useFocusMonthNavigation } from '~/hooks/useFocusMonthNavigation';
import {
  useIndexedHandlerRefs,
  useIndexedScrollToTopRefs,
} from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useScrollToTopTokenNavigation } from '~/hooks/useScrollToTopTokenNavigation';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, TransactionType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  addMonthsAtMonthStart,
  formatAmount,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import {
  bucketTransactionsByMonth,
  emptyMonthSummary,
  type MonthTransactionBuckets,
  summarizeTransactions,
} from '~/utils/transactions';

const FLEX_ONE_STYLE = { flex: 1 } as const;
const FILTER_SCROLL_CONTENT_STYLE = {
  padding: spacing.md,
  paddingBottom: spacing.xl + spacing.xs,
  gap: spacing.sm,
} as const;
const FILTER_CHIPS_CONTENT_STYLE = { gap: spacing.xs, paddingRight: spacing.sm } as const;
const SORT_OPTION_VALUES = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
const EMPTY_MONTH_BUCKETS: MonthTransactionBuckets = {
  transactionsMap: new Map<string, TransactionWithRelations[]>(),
  summaries: new Map(),
};

type SortByValue = (typeof SORT_OPTION_VALUES)[number];
type BreakdownInsightType = 'expense_breakdown' | 'income_breakdown';

interface CategoryPickerItem {
  id: string;
  name: string;
  icon: string;
}

interface CategoryPickerData {
  parents: CategoryPickerItem[];
  childrenByParent: Map<string, CategoryPickerItem[]>;
  previewById: Map<string, { icon: string; label: string }>;
}

interface SimpleActivityScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  focusDayKey?: string | null;
  tutorialResetToken?: number;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (transaction: TransactionWithRelations) => void;
  onOpenBreakdownInsight?: (insightType: BreakdownInsightType, monthKey: string) => void;
}

function buildCategoryPickerDataByType(categories: Category[]): {
  income: CategoryPickerData;
  expense: CategoryPickerData;
} {
  const incomeParents: CategoryPickerItem[] = [];
  const expenseParents: CategoryPickerItem[] = [];
  const incomeChildrenByParent = new Map<string, CategoryPickerItem[]>();
  const expenseChildrenByParent = new Map<string, CategoryPickerItem[]>();
  const incomeParentIconById = new Map<string, string>();
  const expenseParentIconById = new Map<string, string>();
  const incomePreviewById = new Map<string, { icon: string; label: string }>();
  const expensePreviewById = new Map<string, { icon: string; label: string }>();

  categories.forEach((category) => {
    if (category.parentId !== null) return;
    if (category.type === 'income') {
      const icon = resolveCategoryIcon(category.icon);
      incomeParents.push({ id: category.id, name: category.name, icon });
      incomeParentIconById.set(category.id, category.icon);
      incomePreviewById.set(category.id, { icon, label: category.name });
      return;
    }
    if (category.type === 'expense') {
      const icon = resolveCategoryIcon(category.icon);
      expenseParents.push({ id: category.id, name: category.name, icon });
      expenseParentIconById.set(category.id, category.icon);
      expensePreviewById.set(category.id, { icon, label: category.name });
    }
  });

  categories.forEach((category) => {
    if (category.parentId === null) return;
    const parentId = category.parentId;

    if (category.type === 'income') {
      const icon = resolveCategoryIcon(category.icon, incomeParentIconById.get(parentId) ?? null);
      const child = { id: category.id, name: category.name, icon };
      const list = incomeChildrenByParent.get(parentId);
      if (list) {
        list.push(child);
      } else {
        incomeChildrenByParent.set(parentId, [child]);
      }
      const parentName = incomeParents.find((item) => item.id === parentId)?.name ?? '';
      incomePreviewById.set(category.id, {
        icon,
        label: parentName ? `${parentName} / ${category.name}` : category.name,
      });
      return;
    }

    if (category.type === 'expense') {
      const icon = resolveCategoryIcon(category.icon, expenseParentIconById.get(parentId) ?? null);
      const child = { id: category.id, name: category.name, icon };
      const list = expenseChildrenByParent.get(parentId);
      if (list) {
        list.push(child);
      } else {
        expenseChildrenByParent.set(parentId, [child]);
      }
      const parentName = expenseParents.find((item) => item.id === parentId)?.name ?? '';
      expensePreviewById.set(category.id, {
        icon,
        label: parentName ? `${parentName} / ${category.name}` : category.name,
      });
    }
  });

  return {
    income: {
      parents: incomeParents,
      childrenByParent: incomeChildrenByParent,
      previewById: incomePreviewById,
    },
    expense: {
      parents: expenseParents,
      childrenByParent: expenseChildrenByParent,
      previewById: expensePreviewById,
    },
  };
}

function isSortByValue(value: string): value is SortByValue {
  return SORT_OPTION_VALUES.includes(value as SortByValue);
}

function toggleStringId(previous: string[], targetId: string): string[] {
  return previous.includes(targetId)
    ? previous.filter((id) => id !== targetId)
    : [...previous, targetId];
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className={cn(
        'rounded-full border px-3.5 py-2 flex-row items-center gap-1 active:opacity-85',
        active ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text variant="label" className={cn(active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SimpleActivityScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  focusDayKey = null,
  tutorialResetToken = 0,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenBreakdownInsight,
}: SimpleActivityScreenProps) {
  const themeColors = useThemeColors();
  const {
    settings,
    simpleWalletId,
    transactionFilters,
    setTransactionFilters,
    categories,
    queryTransactions,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
  } = useApp();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPicker, setActiveFilterPicker] = useState<
    'incomeCategories' | 'expenseCategories' | null
  >(null);
  const closeFilterPicker = useCallback(() => setActiveFilterPicker(null), []);
  useEffect(() => {
    if (!showFilters) setActiveFilterPicker(null);
  }, [showFilters]);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerAnchorRect, setMonthPickerAnchorRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isSearchBoxOpen, setIsSearchBoxOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(() => transactionFilters.search);
  const hasActiveSearch = transactionFilters.search.trim().length > 0;
  const searchInputRef = useRef<TextInput | null>(null);
  const searchResultsScrollToTopRef = useRef<(() => void) | null>(null);
  const monthPickerTriggerRef = useRef<View | null>(null);
  const { width, height } = useWindowDimensions();
  const { tabletPadding } = useDeviceLayout();
  const pageWidth = Math.max(1, width);
  const monthPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const listHorizontalPadding = Math.max(18, tabletPadding);
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
    }),
    [settings.currencySymbol, settings.displayMode],
  );
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
  const getPageScrollToDayRef = useIndexedHandlerRefs<(dayKey: string) => void>();

  const activeMonthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, activeMonthIndex - MONTH_PAGER_CENTER_INDEX),
    [activeMonthIndex, monthPagerAnchorDate],
  );
  const activeMonthKey = monthKeyFromDateLocal(activeMonthDate);
  const activeMonthLabel = formatMonthYearLabel(activeMonthDate, activeLocale);

  const resolveTransactionValue = useCallback(
    (transaction: TransactionWithRelations) =>
      settings.displayMode === 'time'
        ? getDisplayValueForTransaction(transaction)
        : transaction.amount,
    [getDisplayValueForTransaction, settings.displayMode],
  );

  const simpleModeTransactions = useMemo(() => {
    const nextTransactions = queryTransactions({
      ...transactionFilters,
      accountId: null,
      excludedAccountIds: [],
    });
    if (!simpleWalletId) return nextTransactions;

    return nextTransactions.filter(
      (transaction) =>
        transaction.accountId === simpleWalletId ||
        transaction.fromAccountId === simpleWalletId ||
        transaction.toAccountId === simpleWalletId,
    );
  }, [queryTransactions, simpleWalletId, transactionFilters]);

  const monthBuckets = useMemo(() => {
    if (hasActiveSearch) return EMPTY_MONTH_BUCKETS;
    return bucketTransactionsByMonth(simpleModeTransactions, resolveTransactionValue);
  }, [hasActiveSearch, resolveTransactionValue, simpleModeTransactions]);

  const monthSummary = useMemo(() => {
    if (hasActiveSearch) {
      return summarizeTransactions(simpleModeTransactions, resolveTransactionValue);
    }
    return monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary();
  }, [
    activeMonthKey,
    hasActiveSearch,
    monthBuckets.summaries,
    resolveTransactionValue,
    simpleModeTransactions,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (transactionFilters.type !== 'all') count += 1;
    if (
      (transactionFilters.type === 'all' || transactionFilters.type === 'income') &&
      transactionFilters.excludedIncomeCategoryIds.length > 0
    ) {
      count += transactionFilters.excludedIncomeCategoryIds.length;
    }
    if (
      (transactionFilters.type === 'all' || transactionFilters.type === 'expense') &&
      transactionFilters.excludedExpenseCategoryIds.length > 0
    ) {
      count += transactionFilters.excludedExpenseCategoryIds.length;
    }
    if (transactionFilters.minAmount !== null) count += 1;
    if (transactionFilters.maxAmount !== null) count += 1;
    if (transactionFilters.sortBy !== 'date_desc') count += 1;
    return count;
  }, [
    transactionFilters.excludedExpenseCategoryIds.length,
    transactionFilters.excludedIncomeCategoryIds.length,
    transactionFilters.maxAmount,
    transactionFilters.minAmount,
    transactionFilters.sortBy,
    transactionFilters.type,
  ]);

  const { income: incomeCategoryPickerData, expense: expenseCategoryPickerData } = useMemo(
    () => buildCategoryPickerDataByType(categories),
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
      ] satisfies { label: string; value: 'all' | TransactionType }[],
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

  const formatSummaryValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time' ? (
        <TimeValueInline
          value={formatHours(value)}
          variant="mono"
          textClassName="text-foreground"
          iconSize={11}
        />
      ) : (
        formatAmount(value, settings, { showSign: false })
      ),
    [settings],
  );

  useEffect(() => {
    setSearchDraft((previous) =>
      previous === transactionFilters.search ? previous : transactionFilters.search,
    );
  }, [transactionFilters.search]);

  useEffect(() => {
    if (searchDraft === transactionFilters.search) return;
    const timeout = setTimeout(() => {
      setTransactionFilters({ search: searchDraft });
    }, 140);
    return () => clearTimeout(timeout);
  }, [searchDraft, setTransactionFilters, transactionFilters.search]);

  useEffect(() => {
    if (!hasActiveSearch) return;
    setIsMonthPickerOpen(false);
    searchResultsScrollToTopRef.current?.();
  }, [hasActiveSearch, transactionFilters.search]);

  useEffect(() => {
    if (tutorialResetToken <= 0) return;
    setIsSearchBoxOpen(false);
    setShowFilters(false);
  }, [tutorialResetToken]);

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
    focusDayKey,
    monthPagerAnchorDate,
    centerIndex: MONTH_PAGER_CENTER_INDEX,
    clampIndex: clampMonthIndex,
    setActiveIndex: setActiveMonthIndex,
    listRef: horizontalListRef,
    getScrollToTopRef: getPageScrollToTopRef,
    getScrollToDayRef: getPageScrollToDayRef,
  });

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => (
      <MonthPagerPage
        item={item}
        monthPagerAnchorDate={monthPagerAnchorDate}
        centerIndex={MONTH_PAGER_CENTER_INDEX}
        localeKey={activeLocale}
        monthPageStyle={monthPageStyle}
        monthTransactionsMap={monthBuckets.transactionsMap}
        displaySettings={transactionDisplaySettings}
        getDisplayValueForTransaction={getDisplayValueForTransaction}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        onTransactionPress={onOpenTransaction}
        onTransactionSplitBadgePress={onOpenTransactionSplitBadge}
        getScrollToTopRef={getPageScrollToTopRef}
        getScrollToDayRef={getPageScrollToDayRef}
        contentPaddingHorizontal={listHorizontalPadding}
      />
    ),
    [
      activeLocale,
      getDisplayValueForTransaction,
      getPageScrollToTopRef,
      getPageScrollToDayRef,
      getTrueHourlyRateForDate,
      listHorizontalPadding,
      monthBuckets.transactionsMap,
      monthPagerAnchorDate,
      monthPageStyle,
      onOpenTransaction,
      onOpenTransactionSplitBadge,
      transactionDisplaySettings,
    ],
  );

  const handlePrevMonth = useCallback(() => scrollToRelativeMonth(-1), [scrollToRelativeMonth]);
  const handleNextMonth = useCallback(() => scrollToRelativeMonth(1), [scrollToRelativeMonth]);
  const measureMonthPickerTrigger = useCallback(() => {
    monthPickerTriggerRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (measuredWidth <= 0 || measuredHeight <= 0) return;
      setMonthPickerAnchorRect({
        x,
        y,
        width: measuredWidth,
        height: measuredHeight,
      });
    });
  }, []);
  const handleMonthTriggerLayout = useCallback(() => {
    if (!isMonthPickerOpen) return;
    measureMonthPickerTrigger();
  }, [isMonthPickerOpen, measureMonthPickerTrigger]);
  const jumpToMonthDate = useCallback(
    (targetMonthDate: Date) => {
      const monthOffset =
        (targetMonthDate.getFullYear() - monthPagerAnchorDate.getFullYear()) * 12 +
        targetMonthDate.getMonth() -
        monthPagerAnchorDate.getMonth();
      const targetIndex = clampMonthIndex(MONTH_PAGER_CENTER_INDEX + monthOffset);
      setIsMonthPickerOpen(false);
      setActiveMonthIndex(targetIndex);
      horizontalListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: false,
      });
    },
    [clampMonthIndex, monthPagerAnchorDate, setActiveMonthIndex],
  );
  const handleOpenIncomeBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight || hasActiveSearch) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('income_breakdown', activeMonthKey);
  }, [activeMonthKey, hasActiveSearch, onOpenBreakdownInsight]);
  const handleOpenExpenseBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight || hasActiveSearch) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('expense_breakdown', activeMonthKey);
  }, [activeMonthKey, hasActiveSearch, onOpenBreakdownInsight]);
  const handleOpenSearch = useCallback(() => {
    void triggerHaptic('light');
    setIsMonthPickerOpen(false);
    if (isSearchBoxOpen) {
      searchInputRef.current?.focus();
      return;
    }
    setIsSearchBoxOpen(true);
  }, [isSearchBoxOpen]);
  const handleCloseSearch = useCallback(() => {
    void triggerHaptic('light');
    if (searchDraft.length > 0 || transactionFilters.search.length > 0) {
      setSearchDraft('');
      setTransactionFilters({ search: '' });
    }
    searchInputRef.current?.blur();
    setIsSearchBoxOpen(false);
  }, [searchDraft.length, setTransactionFilters, transactionFilters.search]);
  const handleOpenFilters = useCallback(() => {
    setIsMonthPickerOpen(false);
    setIsSearchBoxOpen(false);
    setShowFilters(true);
  }, []);
  const handleOpenMonthPicker = useCallback(() => {
    if (hasActiveSearch) return;
    setShowFilters(false);
    setIsSearchBoxOpen(false);
    measureMonthPickerTrigger();
    setIsMonthPickerOpen(true);
  }, [hasActiveSearch, measureMonthPickerTrigger]);
  const handleCloseFilters = useCallback(() => {
    if (activeFilterPicker) {
      setActiveFilterPicker(null);
      return;
    }
    setShowFilters(false);
  }, [activeFilterPicker]);
  const handleResetFilters = useCallback(() => {
    void triggerHaptic('selection');
    setSearchDraft('');
    setTransactionFilters({
      search: '',
      accountId: null,
      excludedAccountIds: [],
      type: 'all',
      incomeCategoryId: null,
      expenseCategoryId: null,
      excludedIncomeCategoryIds: [],
      excludedExpenseCategoryIds: [],
      categoryId: null,
      minAmount: null,
      maxAmount: null,
      sortBy: 'date_desc',
    });
  }, [setTransactionFilters]);
  const handleDoneFilters = useCallback(() => {
    void triggerHaptic('selection');
    setShowFilters(false);
  }, []);
  const handleToggleExcludedIncomeCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({
        incomeCategoryId: null,
        excludedIncomeCategoryIds: toggleStringId(
          transactionFilters.excludedIncomeCategoryIds,
          categoryId,
        ),
        categoryId: null,
      });
    },
    [setTransactionFilters, transactionFilters.excludedIncomeCategoryIds],
  );
  const handleToggleExcludedExpenseCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({
        expenseCategoryId: null,
        excludedExpenseCategoryIds: toggleStringId(
          transactionFilters.excludedExpenseCategoryIds,
          categoryId,
        ),
        categoryId: null,
      });
    },
    [setTransactionFilters, transactionFilters.excludedExpenseCategoryIds],
  );
  const handleClearExcludedIncomeCategoryFilter = useCallback(() => {
    setTransactionFilters({
      incomeCategoryId: null,
      excludedIncomeCategoryIds: [],
      categoryId: null,
    });
  }, [setTransactionFilters]);
  const handleClearExcludedExpenseCategoryFilter = useCallback(() => {
    setTransactionFilters({
      expenseCategoryId: null,
      excludedExpenseCategoryIds: [],
      categoryId: null,
    });
  }, [setTransactionFilters]);
  const handleSearchChange = useCallback((text: string) => {
    setSearchDraft(text);
  }, []);
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
  useEffect(() => {
    if (!isMonthPickerOpen) return;
    const frame = requestAnimationFrame(() => {
      measureMonthPickerTrigger();
    });
    return () => cancelAnimationFrame(frame);
  }, [height, isMonthPickerOpen, measureMonthPickerTrigger, width]);

  const headerActions = (
    <View className="flex-row items-center gap-2">
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
          color={isSearchBoxOpen || hasActiveSearch ? themeColors.primary : themeColors.textMuted}
        />
      </Pressable>
      <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
      <DisplayModeToggle />
    </View>
  );

  return (
    <SafeAreaView className="bg-background" edges={['top']} style={styles.container}>
      <MonthControlsHeader
        title={I18n.t('transactions.title')}
        showAccent={false}
        monthLabel={hasActiveSearch ? I18n.t('transactions.filters.search') : activeMonthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthPress={hasActiveSearch ? undefined : handleOpenMonthPicker}
        monthTriggerRef={monthPickerTriggerRef}
        onMonthTriggerLayout={handleMonthTriggerLayout}
        actions={headerActions}
      >
        <View className="gap-2">
          <ActivitySearchRow
            inputRef={searchInputRef}
            visible={isSearchBoxOpen || hasActiveSearch}
            value={searchDraft}
            onChangeText={handleSearchChange}
            onClose={handleCloseSearch}
          />
          <View style={styles.summarySlot}>
            <InOutHeader
              incomeValue={formatSummaryValue(monthSummary.income)}
              expenseValue={formatSummaryValue(monthSummary.expense)}
              onIncomePress={!hasActiveSearch ? handleOpenIncomeBreakdown : undefined}
              onExpensePress={!hasActiveSearch ? handleOpenExpenseBreakdown : undefined}
            />
          </View>
        </View>
      </MonthControlsHeader>

      <View style={styles.listContainer} className="bg-background">
        {hasActiveSearch ? (
          <ActivityTransactionList
            transactions={simpleModeTransactions}
            locale={activeLocale}
            displaySettings={transactionDisplaySettings}
            getDisplayValueForTransaction={getDisplayValueForTransaction}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
            onTransactionPress={onOpenTransaction}
            onTransactionSplitBadgePress={onOpenTransactionSplitBadge}
            emptyTitle={I18n.t('transactions.empty_search_title')}
            emptyMessage={I18n.t('transactions.empty_search_message')}
            contentPaddingBottom={LIST_BOTTOM_PADDING}
            contentPaddingHorizontal={listHorizontalPadding}
            extendUnderBottomNav
            disableItemAnimations
            compactItems
            listKey="simple-search-results"
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

      <MonthJumpPopover
        visible={isMonthPickerOpen && !hasActiveSearch}
        anchorRect={monthPickerAnchorRect}
        screenWidth={width}
        screenHeight={height}
        locale={activeLocale}
        currentMonthDate={activeMonthDate}
        onClose={() => setIsMonthPickerOpen(false)}
        onSelectMonth={jumpToMonthDate}
      />

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
                  <FilterPill
                    key={item.value}
                    label={item.label}
                    active={transactionFilters.type === item.value}
                    onPress={() => handleTypeChange(item.value)}
                  />
                ))}
              </ScrollView>
            </View>

            {shouldShowIncomeCategoryFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_income_categories')}
                </Text>
                <Pressable
                  onPress={() => setActiveFilterPicker('incomeCategories')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={
                      transactionFilters.excludedIncomeCategoryIds.length > 0 ? undefined : 'muted'
                    }
                  >
                    {transactionFilters.excludedIncomeCategoryIds.length > 0
                      ? `${transactionFilters.excludedIncomeCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {shouldShowExpenseCategoryFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_expense_categories')}
                </Text>
                <Pressable
                  onPress={() => setActiveFilterPicker('expenseCategories')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={
                      transactionFilters.excludedExpenseCategoryIds.length > 0 ? undefined : 'muted'
                    }
                  >
                    {transactionFilters.excludedExpenseCategoryIds.length > 0
                      ? `${transactionFilters.excludedExpenseCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
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
          <CategoryPickerSheet
            overlay
            visible={activeFilterPicker === 'incomeCategories'}
            onClose={closeFilterPicker}
            parents={incomeCategoryPickerData.parents}
            childByParent={incomeCategoryPickerData.childrenByParent}
            allowParentSelection
            selectedCategoryIds={transactionFilters.excludedIncomeCategoryIds}
            onToggleSelect={handleToggleExcludedIncomeCategoryFilter}
            onClear={handleClearExcludedIncomeCategoryFilter}
          />
          <CategoryPickerSheet
            overlay
            visible={activeFilterPicker === 'expenseCategories'}
            onClose={closeFilterPicker}
            parents={expenseCategoryPickerData.parents}
            childByParent={expenseCategoryPickerData.childrenByParent}
            allowParentSelection
            selectedCategoryIds={transactionFilters.excludedExpenseCategoryIds}
            onToggleSelect={handleToggleExcludedExpenseCategoryFilter}
            onClear={handleClearExcludedExpenseCategoryFilter}
          />
        </SafeAreaView>
      </ThemeModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  summarySlot: {
    minHeight: 56,
    justifyContent: 'center',
  },
  modalHeaderRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

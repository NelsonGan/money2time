import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { Plus } from 'lucide-react-native';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { SelectField } from '~/components/ui/select';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { ActivityTransactionList, DisplayModeToggle } from '~/features/transactions/components';
import { AccountPanel, CategoryPanel } from '~/features/transactions/components/editor';
import { EditTransactionScreen } from './EditTransactionScreen';
import { useApp } from '~/context/AppContext';
import { formatAmount, formatHours, monthKeyFromIsoLocal } from '~/utils/formatters';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionType, TransactionWithRelations } from '~/types';
import { I18n } from '~/lib/i18n';

const TYPE_FILTERS: { label: string; value: 'all' | TransactionType; emoji: string }[] = [
  { label: I18n.t('transactions.filters.all'), value: 'all', emoji: '📋' },
  { label: I18n.t('transactions.filters.spent'), value: 'expense', emoji: '💸' },
  { label: I18n.t('transactions.filters.earned'), value: 'income', emoji: '💰' },
  { label: I18n.t('transactions.filters.moved'), value: 'transfer', emoji: '↔️' },
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

interface MonthSummary {
  count: number;
  income: number;
  expense: number;
}

function emptyMonthSummary(): MonthSummary {
  return { count: 0, income: 0, expense: 0 };
}

const FilterChip = React.memo(function FilterChip({
  label,
  emoji,
  value,
  selected,
  onSelect,
}: {
  label: string;
  emoji: string;
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
        'rounded-full border px-4 py-2.5 flex-row items-center gap-1.5 active:opacity-85',
        selected ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text className="text-[13px]">{emoji}</Text>
      <Text variant="caption" className={cn(selected ? 'text-primary' : 'text-muted-foreground')}>
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

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

interface TransactionsScreenProps {
  scrollToTopToken?: number;
  focusMonthKey?: string | null;
  focusMonthToken?: number;
  onPressAddTransaction?: () => void;
}

type FilterPanelKey = 'account' | 'category';

interface FilterPanelOption {
  key: FilterPanelKey;
  label: string;
  selectedLabel: string;
  hasSelection: boolean;
}

export function TransactionsScreen({
  scrollToTopToken = 0,
  focusMonthKey = null,
  focusMonthToken = 0,
  onPressAddTransaction,
}: TransactionsScreenProps) {
  const {
    filteredTransactions,
    settings,
    transactionFilters,
    setTransactionFilters,
    resetTransactionFilters,
    accounts,
    accountGroups,
    categories,
    getDisplayValueForTransaction,
  } = useApp();

  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPanel, setActiveFilterPanel] = useState<FilterPanelKey | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const [pageDates, setPageDates] = useState(() => {
    const center = startOfMonth(new Date());
    return { prev: addMonths(center, -1), current: center, next: addMonths(center, 1) };
  });
  const prevListScrollToTopRef = useRef<(() => void) | null>(null);
  const currentListScrollToTopRef = useRef<(() => void) | null>(null);
  const nextListScrollToTopRef = useRef<(() => void) | null>(null);
  const isTransitioningRef = useRef(false);
  const pagerRef = useRef<PagerView>(null);
  const pagerPositionRef = useRef(1);
  const activeMonthKey = monthKey(pageDates.current);
  const activeMonthLabel = formatMonthLabel(pageDates.current);
  const prevMonthDate = pageDates.prev;
  const nextMonthDate = pageDates.next;
  const prevMonthKey = monthKey(prevMonthDate);
  const nextMonthKey = monthKey(nextMonthDate);
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

  const visibleTransactions = useMemo(
    () => monthBuckets.transactionsMap.get(activeMonthKey) ?? [],
    [activeMonthKey, monthBuckets.transactionsMap],
  );
  const prevTransactions = useMemo(
    () => monthBuckets.transactionsMap.get(prevMonthKey) ?? [],
    [monthBuckets.transactionsMap, prevMonthKey],
  );
  const nextTransactions = useMemo(
    () => monthBuckets.transactionsMap.get(nextMonthKey) ?? [],
    [monthBuckets.transactionsMap, nextMonthKey],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => pagerRef.current?.setPageWithoutAnimation(1));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    pagerRef.current?.setPageWithoutAnimation(1);
    currentListScrollToTopRef.current?.();
  }, [scrollToTopToken]);

  useEffect(() => {
    if (!showFilters) setActiveFilterPanel(null);
  }, [showFilters]);

  const resetAdjacentPagesToTop = useCallback(() => {
    prevListScrollToTopRef.current?.();
    nextListScrollToTopRef.current?.();
  }, []);

  const resetAllPagesToTop = useCallback(() => {
    prevListScrollToTopRef.current?.();
    currentListScrollToTopRef.current?.();
    nextListScrollToTopRef.current?.();
  }, []);

  useEffect(() => {
    if (focusMonthToken <= 0) return;
    const target = focusMonthKey ? dateFromMonthKey(focusMonthKey) : startOfMonth(new Date());
    if (!target) return;
    const centered = startOfMonth(target);
    setPageDates({
      prev: addMonths(centered, -1),
      current: centered,
      next: addMonths(centered, 1),
    });
    pagerPositionRef.current = 1;
    pagerRef.current?.setPageWithoutAnimation(1);
    resetAllPagesToTop();
  }, [focusMonthKey, focusMonthToken, resetAllPagesToTop]);

  const shiftWindow = useCallback(
    (direction: 1 | -1) => {
      resetAllPagesToTop();
      pagerPositionRef.current = 1;
      pagerRef.current?.setPageWithoutAnimation(1);
      setPageDates((prev) =>
        direction === 1
          ? { prev: prev.current, current: prev.next, next: addMonths(prev.next, 1) }
          : { prev: addMonths(prev.prev, -1), current: prev.prev, next: prev.current },
      );
      isTransitioningRef.current = false;
    },
    [resetAllPagesToTop],
  );

  const animateToMonth = useCallback((direction: 1 | -1) => {
    if (isTransitioningRef.current) return;
    if (direction === 1) {
      nextListScrollToTopRef.current?.();
    } else {
      prevListScrollToTopRef.current?.();
    }
    isTransitioningRef.current = true;
    pagerRef.current?.setPage(direction === 1 ? 2 : 0);
  }, []);

  const settlePagerWindow = useCallback(() => {
    const page = pagerPositionRef.current;
    if (page === 2) {
      shiftWindow(1);
      return;
    }
    if (page === 0) {
      shiftWindow(-1);
      return;
    }
    isTransitioningRef.current = false;
  }, [shiftWindow]);

  const onPageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    pagerPositionRef.current = event.nativeEvent.position;
  }, []);

  const monthSummary = useMemo(() => {
    return monthBuckets.summaries.get(activeMonthKey) ?? emptyMonthSummary();
  }, [activeMonthKey, monthBuckets.summaries]);
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
    if (transactionFilters.search.trim().length > 0) count += 1;
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
    transactionFilters.search,
    transactionFilters.sortBy,
    transactionFilters.type,
  ]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const categoryPanelParents = useMemo(
    () =>
      categories
        .filter((category) => !category.parentId)
        .map((category) => ({ id: category.id, name: category.name, icon: category.icon })),
    [categories],
  );
  const categoryPanelChildren = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; icon: string }[]>();
    categories
      .filter((category) => !!category.parentId)
      .forEach((category) => {
        const parentId = category.parentId as string;
        const list = grouped.get(parentId) ?? [];
        list.push({ id: category.id, name: category.name, icon: category.icon });
        grouped.set(parentId, list);
      });
    return grouped;
  }, [categories]);
  const selectedAccountLabel = useMemo(() => {
    if (!transactionFilters.accountId) return I18n.t('transactions.filters.all_accounts');
    return (
      accounts.find((account) => account.id === transactionFilters.accountId)?.name ??
      I18n.t('transactions.filters.all_accounts')
    );
  }, [accounts, transactionFilters.accountId]);
  const selectedCategoryLabel = useMemo(() => {
    if (!transactionFilters.categoryId) return I18n.t('transactions.filters.all_categories');
    const selectedCategory = categoryById.get(transactionFilters.categoryId);
    if (!selectedCategory) return I18n.t('transactions.filters.all_categories');
    if (!selectedCategory.parentId) return selectedCategory.name;
    const parent = categoryById.get(selectedCategory.parentId);
    return parent ? `${parent.name} / ${selectedCategory.name}` : selectedCategory.name;
  }, [categoryById, transactionFilters.categoryId]);
  const filterPanelOptions = useMemo<FilterPanelOption[]>(
    () => [
      {
        key: 'account',
        label: I18n.t('transactions.filters.account'),
        selectedLabel: selectedAccountLabel,
        hasSelection: transactionFilters.accountId !== null,
      },
      {
        key: 'category',
        label: I18n.t('transactions.filters.category'),
        selectedLabel: selectedCategoryLabel,
        hasSelection: transactionFilters.categoryId !== null,
      },
    ],
    [
      selectedAccountLabel,
      selectedCategoryLabel,
      transactionFilters.accountId,
      transactionFilters.categoryId,
    ],
  );
  const activePanelTitle = useMemo(() => {
    if (!activeFilterPanel) return I18n.t('transactions.filters.title');
    const option = filterPanelOptions.find((item) => item.key === activeFilterPanel);
    return option?.label ?? I18n.t('transactions.filters.title');
  }, [activeFilterPanel, filterPanelOptions]);
  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const handlePrevMonth = useCallback(() => animateToMonth(-1), [animateToMonth]);
  const handleNextMonth = useCallback(() => animateToMonth(1), [animateToMonth]);
  const handleOpenFilters = useCallback(() => setShowFilters(true), []);
  const handleCloseFilters = useCallback(() => setShowFilters(false), []);
  const handleCloseTransactionEditor = useCallback(() => setSelectedTransaction(null), []);
  const handleResetFilters = useCallback(() => {
    void triggerHaptic('selection');
    resetTransactionFilters();
  }, [resetTransactionFilters]);
  const handleDoneFilters = useCallback(() => {
    void triggerHaptic('selection');
    if (activeFilterPanel !== null) {
      setActiveFilterPanel(null);
      return;
    }
    setShowFilters(false);
  }, [activeFilterPanel]);
  const handleOpenFilterPanel = useCallback((panelKey: FilterPanelKey) => {
    void triggerHaptic('selection');
    setActiveFilterPanel(panelKey);
  }, []);
  const handleSelectAccountFilter = useCallback(
    (accountId: string) => {
      setTransactionFilters({ accountId });
      setActiveFilterPanel(null);
    },
    [setTransactionFilters],
  );
  const handleSelectCategoryFilter = useCallback(
    (categoryId: string) => {
      setTransactionFilters({ categoryId });
      setActiveFilterPanel(null);
    },
    [setTransactionFilters],
  );
  const handleResetAccountFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ accountId: null });
    setActiveFilterPanel(null);
  }, [setTransactionFilters]);
  const handleResetCategoryFilter = useCallback(() => {
    void triggerHaptic('selection');
    setTransactionFilters({ categoryId: null });
    setActiveFilterPanel(null);
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
  const onPageScrollStateChanged = useCallback(
    (event: { nativeEvent: { pageScrollState: string } }) => {
      if (event.nativeEvent.pageScrollState === 'dragging') {
        resetAdjacentPagesToTop();
        return;
      }
      if (event.nativeEvent.pageScrollState === 'idle') {
        settlePagerWindow();
      }
    },
    [resetAdjacentPagesToTop, settlePagerWindow],
  );

  const renderAllFilterOption = useCallback(
    (label: string, isActive: boolean, onPress: () => void) => (
      <View className="px-5 pb-2">
        <Pressable
          onPress={onPress}
          className={cn(
            'rounded-xl border px-3 py-2.5',
            isActive ? 'border-primary/45 bg-primary/10' : 'border-border/30 bg-card',
          )}
        >
          <Text
            variant="caption"
            className={cn(isActive ? 'text-primary' : 'text-muted-foreground')}
          >
            {label}
          </Text>
        </Pressable>
      </View>
    ),
    [],
  );

  const renderActiveFilterPanel = useCallback(() => {
    if (activeFilterPanel === 'account') {
      return (
        <View className="flex-1">
          {renderAllFilterOption(
            I18n.t('transactions.filters.all_accounts'),
            transactionFilters.accountId === null,
            handleResetAccountFilter,
          )}
          <AccountPanel
            accounts={accounts}
            accountGroups={accountGroups}
            selectedId={transactionFilters.accountId}
            onSelect={handleSelectAccountFilter}
          />
        </View>
      );
    }

    if (activeFilterPanel === 'category') {
      return (
        <View className="flex-1">
          {renderAllFilterOption(
            I18n.t('transactions.filters.all_categories'),
            transactionFilters.categoryId === null,
            handleResetCategoryFilter,
          )}
          <CategoryPanel
            parents={categoryPanelParents}
            childByParent={categoryPanelChildren}
            selectedCategoryId={transactionFilters.categoryId}
            onSelect={handleSelectCategoryFilter}
          />
        </View>
      );
    }

    return null;
  }, [
    activeFilterPanel,
    accounts,
    accountGroups,
    categoryPanelChildren,
    categoryPanelParents,
    handleResetAccountFilter,
    handleResetCategoryFilter,
    handleSelectAccountFilter,
    handleSelectCategoryFilter,
    renderAllFilterOption,
    transactionFilters.accountId,
    transactionFilters.categoryId,
  ]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MonthControlsHeader
        title={I18n.t('transactions.title')}
        monthLabel={activeMonthLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        actions={
          <View className="flex-row items-center gap-2">
            <DisplayModeToggle />
            <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
          </View>
        }
      >
        <View>
          <InOutHeader
            incomeValue={formatSummaryValue(monthSummary.income)}
            expenseValue={formatSummaryValue(monthSummary.expense)}
          />
        </View>
      </MonthControlsHeader>

      <View className="flex-1 overflow-hidden bg-background">
        <PagerView
          ref={pagerRef}
          initialPage={1}
          offscreenPageLimit={1}
          style={FLEX_ONE_STYLE}
          onPageSelected={onPageSelected}
          onPageScrollStateChanged={onPageScrollStateChanged}
        >
          <View key="prev" style={FLEX_ONE_STYLE} className="bg-background">
            <ActivityTransactionList
              transactions={prevTransactions}
              onTransactionPress={setSelectedTransaction}
              emptyTitle={I18n.t('transactions.empty_month_title')}
              emptyMessage={I18n.t('transactions.empty_month_message')}
              contentPaddingBottom={110}
              disableItemAnimations
              compactItems
              scrollToTopRef={prevListScrollToTopRef}
            />
          </View>
          <View key="current" style={FLEX_ONE_STYLE} className="bg-background">
            <ActivityTransactionList
              transactions={visibleTransactions}
              onTransactionPress={setSelectedTransaction}
              emptyTitle={I18n.t('transactions.empty_month_title')}
              emptyMessage={I18n.t('transactions.empty_month_message')}
              contentPaddingBottom={110}
              disableItemAnimations
              compactItems
              scrollToTopRef={currentListScrollToTopRef}
            />
          </View>
          <View key="next" style={FLEX_ONE_STYLE} className="bg-background">
            <ActivityTransactionList
              transactions={nextTransactions}
              onTransactionPress={setSelectedTransaction}
              emptyTitle={I18n.t('transactions.empty_month_title')}
              emptyMessage={I18n.t('transactions.empty_month_message')}
              contentPaddingBottom={110}
              disableItemAnimations
              compactItems
              scrollToTopRef={nextListScrollToTopRef}
            />
          </View>
        </PagerView>
      </View>

      {onPressAddTransaction ? (
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
        {selectedTransaction ? (
          <EditTransactionScreen
            transaction={selectedTransaction}
            onClose={handleCloseTransactionEditor}
          />
        ) : null}
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
              <Text variant="subheading">{activePanelTitle}</Text>
              {activeFilterPanel === null ? (
                <Text variant="friendly" tone="muted">
                  {I18n.t('transactions.filters.subtitle')}
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-2">
              {activeFilterPanel === null ? (
                <Pressable
                  onPress={handleResetFilters}
                  className="px-3 py-2 rounded-full bg-secondary/70"
                >
                  <Text variant="caption" tone="muted">
                    {I18n.t('common.reset')}
                  </Text>
                </Pressable>
              ) : null}
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

          {activeFilterPanel ? (
            renderActiveFilterPanel()
          ) : (
            <ScrollView className="flex-1" contentContainerStyle={FILTER_SCROLL_CONTENT_STYLE}>
              <Input
                label={I18n.t('transactions.filters.search')}
                placeholder={I18n.t('transactions.filters.search_placeholder')}
                value={transactionFilters.search}
                onChangeText={handleSearchChange}
              />

              <View className="gap-2">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.filters.type')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={FILTER_CHIPS_CONTENT_STYLE}
                >
                  {TYPE_FILTERS.map((item) => (
                    <FilterChip
                      key={item.value}
                      label={item.label}
                      emoji={item.emoji}
                      value={item.value}
                      selected={transactionFilters.type === item.value}
                      onSelect={handleTypeChange}
                    />
                  ))}
                </ScrollView>
              </View>

              {filterPanelOptions.map((option) => (
                <View key={option.key} className="gap-2">
                  <Text variant="caption" tone="muted">
                    {option.label}
                  </Text>
                  <Pressable
                    onPress={() => handleOpenFilterPanel(option.key)}
                    className={cn(
                      'h-[54px] rounded-3xl border border-border/40 bg-card/95 px-4 flex-row items-center',
                    )}
                  >
                    <Text
                      numberOfLines={1}
                      className={cn(
                        'flex-1',
                        option.hasSelection ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {option.selectedLabel}
                    </Text>
                  </Pressable>
                </View>
              ))}

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

              <SelectField
                label={I18n.t('transactions.filters.sort')}
                value={transactionFilters.sortBy}
                onChange={handleSortChange}
                options={sortOptions}
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </ThemeModal>
    </SafeAreaView>
  );
}

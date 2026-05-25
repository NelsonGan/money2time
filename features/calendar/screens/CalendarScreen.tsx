import { ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  AccountPickerSheet,
  CategoryPickerSheet,
  Input,
  Text,
  ThemeModal,
  TimeValueInline,
} from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { DisplayModeToggle, MonthJumpPopover } from '~/features/transactions/components';
import { DatePanel } from '~/features/transactions/components/editor';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  addMonthsAtMonthStart,
  dayKeyFromDateLocal,
  formatAmount,
  formatDateInput,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import { filterTransactionsByWallet } from '~/utils/transactions';

import { CalendarMonthPage } from '../components/CalendarMonthPage';
import { buildCalendarMonth, getCalendarWeekdayLabels } from '../lib/calendarBuild';

const CALENDAR_HORIZONTAL_PADDING = spacing.screenHorizontal;
const CALENDAR_GRID_HORIZONTAL_PADDING = spacing.xs;
const BULK_DATE_PANEL_HEIGHT = 360;

const FILTER_MODAL_CONTENT_STYLE = {
  padding: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;

function toggleStringId(previous: string[], targetId: string): string[] {
  return previous.includes(targetId)
    ? previous.filter((id) => id !== targetId)
    : [...previous, targetId];
}

interface CategoryPickerData {
  parents: { id: string; name: string; icon: string }[];
  childByParent: Map<string, { id: string; name: string; icon: string }[]>;
}

function buildCategoryPickerData(
  categories: Category[],
  categoryType: CategoryType,
): CategoryPickerData {
  const parentCategories = categories.filter(
    (category) => category.type === categoryType && category.parentId === null,
  );
  const parentIds = new Set(parentCategories.map((parent) => parent.id));
  const parentIconById = new Map<string, string>();
  parentCategories.forEach((category) => {
    parentIconById.set(category.id, category.icon);
  });
  const parents = parentCategories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: resolveCategoryIcon(category.icon),
  }));
  const childByParent = new Map<string, { id: string; name: string; icon: string }[]>();

  categories.forEach((category) => {
    const parentId = category.parentId;
    if (category.type !== categoryType || !parentId || !parentIds.has(parentId)) return;
    const child = {
      id: category.id,
      name: category.name,
      icon: resolveCategoryIcon(category.icon, parentIconById.get(parentId) ?? null),
    };
    const existing = childByParent.get(parentId);
    if (existing) {
      existing.push(child);
    } else {
      childByParent.set(parentId, [child]);
    }
  });

  return { parents, childByParent };
}

type FilterPickerKind = 'accounts' | 'incomeCategories' | 'expenseCategories';

export interface CalendarScreenProps {
  scrollToTopToken?: number;
  resetToCurrentMonthToken?: number;
  onOpenTransaction: (tx: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (tx: TransactionWithRelations) => void;
  onOpenBreakdownInsight?: (
    insightType: 'expense_breakdown' | 'income_breakdown',
    monthKey: string,
  ) => void;
}

function monthOffsetFromAnchor(anchor: Date, target: Date): number {
  // year*12 + month delta — independent of variable month length so the
  // round-trip from index → month → index is exact.
  return (
    (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth())
  );
}

export function CalendarScreen({
  scrollToTopToken = 0,
  resetToCurrentMonthToken = 0,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenBreakdownInsight,
}: CalendarScreenProps) {
  const {
    transactions,
    settings,
    isSimpleMode,
    simpleWalletId,
    accounts,
    accountGroups,
    categories,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    updateTransactionsBulk,
    deleteTransactionsBulk,
  } = useApp();
  const themeColors = useThemeColors();
  const { contentWidth } = useDeviceLayout();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const isTimeMode = settings.displayMode === 'time';

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() =>
    dayKeyFromDateLocal(new Date()),
  );
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerAnchorRect, setMonthPickerAnchorRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPicker, setActiveFilterPicker] = useState<FilterPickerKind | null>(null);
  const [excludedAccountIds, setExcludedAccountIds] = useState<string[]>([]);
  const [excludedIncomeCategoryIds, setExcludedIncomeCategoryIds] = useState<string[]>([]);
  const [excludedExpenseCategoryIds, setExcludedExpenseCategoryIds] = useState<string[]>([]);

  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;

  const closeFilterPicker = useCallback(() => setActiveFilterPicker(null), []);
  useEffect(() => {
    if (!showFilters) setActiveFilterPicker(null);
  }, [showFilters]);

  const monthPickerTriggerRef = useRef<View>(null);
  const horizontalListRef = useRef<FlatList<number> | null>(null);

  const pageWidth = Math.max(1, screenWidth);
  const monthPagerAnchorDate = useMemo(() => startOfMonthDate(new Date()), []);

  const {
    activeIndex: activeMonthIndex,
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

  const activeMonthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, activeMonthIndex - MONTH_PAGER_CENTER_INDEX),
    [activeMonthIndex, monthPagerAnchorDate],
  );

  const scopedTransactions = useMemo(
    () => filterTransactionsByWallet(transactions, isSimpleMode ? simpleWalletId : null),
    [transactions, isSimpleMode, simpleWalletId],
  );

  const excludedAccountIdSet = useMemo(() => new Set(excludedAccountIds), [excludedAccountIds]);
  const excludedIncomeCategoryIdSet = useMemo(
    () => new Set(excludedIncomeCategoryIds),
    [excludedIncomeCategoryIds],
  );
  const excludedExpenseCategoryIdSet = useMemo(
    () => new Set(excludedExpenseCategoryIds),
    [excludedExpenseCategoryIds],
  );

  const filteredTransactions = useMemo(() => {
    return scopedTransactions.filter((tx) => {
      if (tx.accountId && excludedAccountIdSet.has(tx.accountId)) return false;
      // Excluding a parent category also excludes its child sub-categories, so
      // match the transaction's own category id or its parent's id.
      if (
        tx.type === 'income' &&
        tx.categoryId &&
        (excludedIncomeCategoryIdSet.has(tx.categoryId) ||
          (tx.categoryParentId && excludedIncomeCategoryIdSet.has(tx.categoryParentId)))
      ) {
        return false;
      }
      if (
        tx.type === 'expense' &&
        tx.categoryId &&
        (excludedExpenseCategoryIdSet.has(tx.categoryId) ||
          (tx.categoryParentId && excludedExpenseCategoryIdSet.has(tx.categoryParentId)))
      ) {
        return false;
      }
      return true;
    });
  }, [
    scopedTransactions,
    excludedAccountIdSet,
    excludedIncomeCategoryIdSet,
    excludedExpenseCategoryIdSet,
  ]);

  const incomeCategoryPickerData = useMemo(
    () => buildCategoryPickerData(categories, 'income'),
    [categories],
  );
  const expenseCategoryPickerData = useMemo(
    () => buildCategoryPickerData(categories, 'expense'),
    [categories],
  );

  const activeFilterCount =
    excludedAccountIds.length +
    excludedIncomeCategoryIds.length +
    excludedExpenseCategoryIds.length;

  const handleResetFilters = useCallback(() => {
    void triggerHaptic('selection');
    setExcludedAccountIds([]);
    setExcludedIncomeCategoryIds([]);
    setExcludedExpenseCategoryIds([]);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setIsMonthPickerOpen(false);
    setShowFilters(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    if (activeFilterPicker) {
      setActiveFilterPicker(null);
      return;
    }
    setShowFilters(false);
  }, [activeFilterPicker]);

  const handleDoneFilters = useCallback(() => {
    void triggerHaptic('selection');
    setShowFilters(false);
  }, []);

  const todayDayKey = dayKeyFromDateLocal(new Date());

  // Build month data for the *active* month so the header summary always
  // reflects what the user is looking at. Each page computes its own
  // month data internally — duplicated work for the active page, but it
  // keeps the page component self-contained and renders the header in
  // one place without prop-drilling per-page data out.
  const activeMonthData = useMemo(
    () =>
      buildCalendarMonth({
        monthAnchor: activeMonthDate,
        transactions: filteredTransactions,
        locale: activeLocale,
        isTimeMode,
        getDisplayValueForTransaction,
        todayDayKey,
      }),
    [
      activeMonthDate,
      filteredTransactions,
      activeLocale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
    ],
  );

  const weekdayLabels = useMemo(() => getCalendarWeekdayLabels(activeLocale), [activeLocale]);

  const activeMonthLabel = useMemo(
    () => formatMonthYearLabel(activeMonthDate, activeLocale),
    [activeMonthDate, activeLocale],
  );
  const activeMonthKey = useMemo(() => monthKeyFromDateLocal(activeMonthDate), [activeMonthDate]);

  const selectedTransactionTotalLabel = useMemo(() => {
    if (selectedTransactionIds.length === 0) return '';
    const selectedIdSet = new Set(selectedTransactionIds);
    let total = 0;
    filteredTransactions.forEach((transaction) => {
      if (!selectedIdSet.has(transaction.id)) return;
      total += transaction.amount;
    });
    return formatAmount(
      Math.abs(total),
      { currencySymbol: settings.currencySymbol, displayMode: 'money' },
      { showSign: false, trueHourlyRate: 0 },
    );
  }, [filteredTransactions, selectedTransactionIds, settings.currencySymbol]);

  // Drop any selected ids that are no longer present (e.g. after a delete or a
  // filter change) so the toolbar count and bulk actions stay accurate.
  useEffect(() => {
    if (selectedTransactionIds.length === 0) return;
    const availableIds = new Set(filteredTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [filteredTransactions, selectedTransactionIds.length]);

  // When the active month changes, default-pick a day inside it for the
  // lifted selection — today if it falls inside, else the 1st.
  useEffect(() => {
    setSelectedDayKey((prev) => {
      if (prev && prev >= activeMonthData.firstDayKey && prev <= activeMonthData.lastDayKey) {
        return prev;
      }
      const inMonth =
        activeMonthData.firstDayKey <= todayDayKey && activeMonthData.lastDayKey >= todayDayKey;
      return inMonth ? todayDayKey : activeMonthData.firstDayKey;
    });
  }, [activeMonthData.firstDayKey, activeMonthData.lastDayKey, todayDayKey]);

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

  const handlePrevMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(-1);
  }, [scrollToRelativeMonth]);

  const handleNextMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(1);
  }, [scrollToRelativeMonth]);

  const handleSelectDay = useCallback((dayKey: string) => {
    setSelectedDayKey(dayKey);
  }, []);

  const handleOpenIncomeBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('income_breakdown', activeMonthKey);
  }, [activeMonthKey, onOpenBreakdownInsight]);

  const handleOpenExpenseBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('expense_breakdown', activeMonthKey);
  }, [activeMonthKey, onOpenBreakdownInsight]);

  const clearSelection = useCallback(() => {
    void triggerHaptic('selection');
    setSelectedTransactionIds([]);
  }, []);

  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) => {
      const index = previous.indexOf(transactionId);
      if (index === -1) return [...previous, transactionId];
      if (previous.length === 1) return [];
      const next = [...previous];
      next.splice(index, 1);
      return next;
    });
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

  const handleTransactionSplitBadgePress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      onOpenTransactionSplitBadge?.(transaction);
    },
    [isSelectionMode, onOpenTransactionSplitBadge, toggleTransactionSelection],
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

    updateTransactionsBulk(
      selectedTransactionIds.map((transactionId) => ({ id: transactionId, input: updates })),
    );
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
    updateTransactionsBulk,
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
            deleteTransactionsBulk(idsToDelete);
            setShowBulkUpdate(false);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransactionsBulk, selectedTransactionIds]);

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

  const handleJumpToMonth = useCallback(
    (monthDate: Date) => {
      const offset = monthOffsetFromAnchor(monthPagerAnchorDate, monthDate);
      const nextIndex = clampMonthIndex(MONTH_PAGER_CENTER_INDEX + offset);
      setActiveMonthIndex(nextIndex);
      horizontalListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
      setIsMonthPickerOpen(false);
    },
    [clampMonthIndex, monthPagerAnchorDate, setActiveMonthIndex],
  );

  useEffect(() => {
    if (!resetToCurrentMonthToken) return;
    setActiveMonthIndex(MONTH_PAGER_CENTER_INDEX);
    setSelectedDayKey(dayKeyFromDateLocal(new Date()));
    horizontalListRef.current?.scrollToIndex({
      index: MONTH_PAGER_CENTER_INDEX,
      animated: false,
    });
  }, [resetToCurrentMonthToken, setActiveMonthIndex]);

  const gridChartWidth = useMemo(() => {
    const horizontal = CALENDAR_GRID_HORIZONTAL_PADDING * 2;
    return Math.max(280, contentWidth - horizontal);
  }, [contentWidth]);

  const bottomPad = useMemo(
    () => getBottomNavReservedInset(safeAreaInsets.bottom) + spacing.lg,
    [safeAreaInsets.bottom],
  );

  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      const offset = item - MONTH_PAGER_CENTER_INDEX;
      const pageMonth = addMonthsAtMonthStart(monthPagerAnchorDate, offset);
      const isActive = item === activeMonthIndex;
      return (
        <CalendarMonthPage
          pageWidth={pageWidth}
          monthAnchor={pageMonth}
          transactions={filteredTransactions}
          locale={activeLocale}
          isTimeMode={isTimeMode}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          todayDayKey={todayDayKey}
          weekdayLabels={weekdayLabels}
          gridChartWidth={gridChartWidth}
          bottomPad={bottomPad}
          contentPaddingHorizontal={CALENDAR_HORIZONTAL_PADDING}
          gridPaddingHorizontal={CALENDAR_GRID_HORIZONTAL_PADDING}
          displaySettings={transactionDisplaySettings}
          fullSettings={settings}
          selectedDayKey={selectedDayKey}
          isActive={isActive}
          scrollToTopToken={scrollToTopToken}
          onSelectDay={handleSelectDay}
          onOpenTransaction={handleTransactionPress}
          onOpenTransactionSplitBadge={handleTransactionSplitBadgePress}
          onLongPressTransaction={handleTransactionLongPress}
          selectionMode={isSelectionMode}
          selectedTransactionIds={selectedTransactionIds}
        />
      );
    },
    [
      activeLocale,
      activeMonthIndex,
      bottomPad,
      getDisplayValueForTransaction,
      getTrueHourlyRateForDate,
      gridChartWidth,
      handleSelectDay,
      handleTransactionLongPress,
      handleTransactionPress,
      handleTransactionSplitBadgePress,
      isSelectionMode,
      isTimeMode,
      monthPagerAnchorDate,
      pageWidth,
      filteredTransactions,
      scrollToTopToken,
      selectedDayKey,
      selectedTransactionIds,
      settings,
      todayDayKey,
      transactionDisplaySettings,
      weekdayLabels,
    ],
  );

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
        actions={
          <>
            <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
            <DisplayModeToggle />
          </>
        }
      >
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
                    <Text variant="label" className="text-foreground">
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
              incomeValue={formatSummaryValue(activeMonthData.totalIncome)}
              expenseValue={formatSummaryValue(activeMonthData.totalExpense)}
              onIncomePress={onOpenBreakdownInsight ? handleOpenIncomeBreakdown : undefined}
              onExpensePress={onOpenBreakdownInsight ? handleOpenExpenseBreakdown : undefined}
            />
          )}
        </View>
      </MonthControlsHeader>

      <View className="flex-1 overflow-hidden bg-background">
        <FlatList
          ref={horizontalListRef}
          data={monthPagerSlots}
          keyExtractor={monthPagerKeyExtractor}
          style={styles.flexOne}
          {...MONTH_PAGER_LIST_CONFIG}
          renderItem={renderMonthPage}
          initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
          getItemLayout={getHorizontalItemLayout}
          onScrollEndDrag={handleHorizontalScrollEndDrag}
          onMomentumScrollEnd={handleHorizontalMomentumEnd}
          onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
        />
      </View>

      <MonthJumpPopover
        visible={isMonthPickerOpen}
        anchorRect={monthPickerAnchorRect}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        locale={activeLocale}
        currentMonthDate={activeMonthDate}
        onSelectMonth={handleJumpToMonth}
        onClose={handleCloseMonthPicker}
      />

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

          <ScrollView className="flex-1" contentContainerStyle={FILTER_MODAL_CONTENT_STYLE}>
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
              <Text variant="subheading">{I18n.t('insights.filters.title')}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleResetFilters}
                className="rounded-full bg-secondary/70"
                style={styles.modalActionButton}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.reset')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.reset')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDoneFilters}
                className="rounded-full bg-secondary"
                style={styles.modalActionButton}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.done')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={FILTER_MODAL_CONTENT_STYLE}>
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('insights.filters.exclude_accounts')}
              </Text>
              <Pressable
                onPress={() => setActiveFilterPicker('accounts')}
                className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
              >
                <Text variant="body" tone={excludedAccountIds.length > 0 ? undefined : 'muted'}>
                  {excludedAccountIds.length > 0
                    ? `${excludedAccountIds.length} ${I18n.t('insights.filters.excluded')}`
                    : I18n.t('common.none')}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>

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
                  tone={excludedIncomeCategoryIds.length > 0 ? undefined : 'muted'}
                >
                  {excludedIncomeCategoryIds.length > 0
                    ? `${excludedIncomeCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                    : I18n.t('common.none')}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>

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
                  tone={excludedExpenseCategoryIds.length > 0 ? undefined : 'muted'}
                >
                  {excludedExpenseCategoryIds.length > 0
                    ? `${excludedExpenseCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                    : I18n.t('common.none')}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
          </ScrollView>

          <AccountPickerSheet
            overlay
            visible={activeFilterPicker === 'accounts'}
            onClose={closeFilterPicker}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedIds={excludedAccountIds}
            onToggleSelect={(accountId) =>
              setExcludedAccountIds((previous) => toggleStringId(previous, accountId))
            }
            onClear={() => setExcludedAccountIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeFilterPicker === 'incomeCategories'}
            onClose={closeFilterPicker}
            parents={incomeCategoryPickerData.parents}
            childByParent={incomeCategoryPickerData.childByParent}
            selectedCategoryIds={excludedIncomeCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedIncomeCategoryIds((previous) => toggleStringId(previous, categoryId))
            }
            onClear={() => setExcludedIncomeCategoryIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeFilterPicker === 'expenseCategories'}
            onClose={closeFilterPicker}
            parents={expenseCategoryPickerData.parents}
            childByParent={expenseCategoryPickerData.childByParent}
            selectedCategoryIds={excludedExpenseCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedExpenseCategoryIds((previous) => toggleStringId(previous, categoryId))
            }
            onClear={() => setExcludedExpenseCategoryIds([])}
          />
        </SafeAreaView>
      </ThemeModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  summarySlot: {
    minHeight: 56,
    justifyContent: 'center',
  },
  bulkDatePanel: {
    height: BULK_DATE_PANEL_HEIGHT,
  },
  modalHeaderRow: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

import { ChevronDown, ChevronRight, ChevronUp, Pencil, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { InOutHeader } from '~/components/navigation/InOutHeader';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
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
import {
  DisplayModeToggle,
  MonthJumpPopover,
  TransactionItem,
} from '~/features/transactions/components';
import { DatePickerModal } from '~/components/datePicker';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useMonthPager } from '~/hooks/useMonthPager';
import { usePersistedJsonSnapshot } from '~/hooks/usePersistedJsonSnapshot';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  addMonthsAtMonthStart,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatDateInput,
  formatHours,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  startOfMonthDate,
} from '~/utils/formatters';
import { compareTransactionsByDateDesc } from '~/utils/transactionSorting';
import { filterTransactionsByWallet } from '~/utils/transactions';

import { CalendarMonthGrid } from '../components/CalendarMonthGrid';
import { CalendarWeekStrip, CENTER_WEEK_INDEX } from '../components/CalendarWeekStrip';
import {
  buildCalendarMonth,
  dayKeyToUtcDate,
  formatCalendarDate,
  getCalendarWeekdayLabels,
  weekStartDayKey,
} from '../lib/calendarBuild';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CALENDAR_HORIZONTAL_PADDING = spacing.screenHorizontal;
const CALENDAR_GRID_HORIZONTAL_PADDING = spacing.xs;

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

type CalendarPreferencesSnapshot = {
  version: 1;
  excludedAccountIds: string[];
  excludedIncomeCategoryIds: string[];
  excludedExpenseCategoryIds: string[];
};

const CALENDAR_PREFERENCES_VERSION = 1;

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

function parseCalendarPreferencesPayload(
  rawValue: string | null,
): Partial<CalendarPreferencesSnapshot> | null {
  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    return {
      excludedAccountIds: toUniqueStringList(record.excludedAccountIds),
      excludedIncomeCategoryIds: toUniqueStringList(record.excludedIncomeCategoryIds),
      excludedExpenseCategoryIds: toUniqueStringList(record.excludedExpenseCategoryIds),
    };
  } catch {
    return null;
  }
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
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
}

function monthOffsetFromAnchor(anchor: Date, target: Date): number {
  return (
    (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth())
  );
}

const EXPAND_ANIM_CONFIG = {
  duration: 300,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
} as const;

export function CalendarScreen({
  scrollToTopToken = 0,
  resetToCurrentMonthToken = 0,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenBreakdownInsight,
  onSelectionModeChange,
}: CalendarScreenProps) {
  const {
    transactions,
    settings,
    isLoading,
    isSimpleMode,
    simpleWalletId,
    accounts,
    accountGroups,
    categories,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    updateTransactionsBulk,
    deleteTransactionsBulk,
    calendarPreferencesJson,
    updateCalendarPreferencesJson,
  } = useApp();
  const themeColors = useThemeColors();
  const { contentWidth } = useDeviceLayout();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const isTimeMode = settings.displayMode === 'time';
  const reportBottomNavScroll = useBottomNavScrollReporter();

  const todayDayKey = dayKeyFromDateLocal(new Date());

  // --- View mode: 'week' (collapsed) or 'month' (expanded) ---
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayDayKey);

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
  const [bulkDateModalVisible, setBulkDateModalVisible] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;

  const closeFilterPicker = useCallback(() => setActiveFilterPicker(null), []);
  useEffect(() => {
    if (!showFilters) setActiveFilterPicker(null);
  }, [showFilters]);

  // --- Preferences persistence ---
  const applyCalendarPreferencesSnapshot = useCallback(
    (saved: Partial<CalendarPreferencesSnapshot>) => {
      if (saved.excludedAccountIds) setExcludedAccountIds(saved.excludedAccountIds);
      if (saved.excludedIncomeCategoryIds) {
        setExcludedIncomeCategoryIds(saved.excludedIncomeCategoryIds);
      }
      if (saved.excludedExpenseCategoryIds) {
        setExcludedExpenseCategoryIds(saved.excludedExpenseCategoryIds);
      }
    },
    [],
  );

  const calendarPreferencesSnapshot = useMemo<CalendarPreferencesSnapshot>(
    () => ({
      version: CALENDAR_PREFERENCES_VERSION,
      excludedAccountIds,
      excludedIncomeCategoryIds,
      excludedExpenseCategoryIds,
    }),
    [excludedAccountIds, excludedIncomeCategoryIds, excludedExpenseCategoryIds],
  );

  usePersistedJsonSnapshot<CalendarPreferencesSnapshot, Partial<CalendarPreferencesSnapshot>>({
    isLoading,
    storedJson: calendarPreferencesJson,
    snapshot: calendarPreferencesSnapshot,
    parseStoredJson: parseCalendarPreferencesPayload,
    applyParsedSnapshot: applyCalendarPreferencesSnapshot,
    writeStoredJson: updateCalendarPreferencesJson,
  });

  // --- Month pager (for expanded month view) ---
  const monthPickerTriggerRef = useRef<View>(null);
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const weekStripListRef = useRef<FlatList<number> | null>(null);

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

  // --- Transactions filtering ---
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

  // --- Build a global daily aggregate map for the week strip ---
  const globalDailyByDayKey = useMemo(() => {
    const map = new Map<string, { dayKey: string; income: number; expense: number; net: number; transactionCount: number; transactions: TransactionWithRelations[] }>();
    for (const tx of filteredTransactions) {
      if (tx.type !== 'income' && tx.type !== 'expense') continue;
      const dayKey = dayKeyFromIsoLocal(tx.date);
      let agg = map.get(dayKey);
      if (!agg) {
        agg = { dayKey, income: 0, expense: 0, net: 0, transactionCount: 0, transactions: [] };
        map.set(dayKey, agg);
      }
      const value = isTimeMode ? getDisplayValueForTransaction(tx) : (tx.reportingAmount ?? tx.amount);
      if (tx.type === 'income') {
        agg.income += value;
      } else {
        agg.expense += value;
      }
      agg.transactionCount += 1;
      agg.transactions.push(tx);
    }
    map.forEach((agg) => {
      agg.net = agg.income - agg.expense;
    });
    return map;
  }, [filteredTransactions, isTimeMode, getDisplayValueForTransaction]);

  // --- Week strip anchor ---
  const anchorWeekStart = useMemo(
    () => weekStartDayKey(todayDayKey, settings.weekStartsOn),
    [todayDayKey, settings.weekStartsOn],
  );

  const weekdayLabels = useMemo(
    () => getCalendarWeekdayLabels(activeLocale, settings.weekStartsOn),
    [activeLocale, settings.weekStartsOn],
  );

  // --- Selected day's month for header label ---
  const selectedMonthDate = useMemo(() => {
    const d = dayKeyToUtcDate(selectedDayKey);
    return d ?? new Date();
  }, [selectedDayKey]);

  const selectedMonthLabel = useMemo(
    () => formatMonthYearLabel(selectedMonthDate, activeLocale),
    [selectedMonthDate, activeLocale],
  );

  const activeMonthLabel = useMemo(
    () => formatMonthYearLabel(activeMonthDate, activeLocale),
    [activeMonthDate, activeLocale],
  );

  const displayedMonthLabel = viewMode === 'week' ? selectedMonthLabel : activeMonthLabel;

  const activeMonthKey = useMemo(() => monthKeyFromDateLocal(activeMonthDate), [activeMonthDate]);
  const selectedMonthKey = useMemo(() => {
    const d = dayKeyToUtcDate(selectedDayKey);
    return d ? monthKeyFromDateLocal(d) : monthKeyFromDateLocal(new Date());
  }, [selectedDayKey]);

  const displayedMonthKey = viewMode === 'week' ? selectedMonthKey : activeMonthKey;

  // --- Build month data for the active month (header summary + month grid) ---
  const activeMonthData = useMemo(
    () =>
      buildCalendarMonth({
        monthAnchor: viewMode === 'month' ? activeMonthDate : selectedMonthDate,
        transactions: filteredTransactions,
        locale: activeLocale,
        isTimeMode,
        getDisplayValueForTransaction,
        todayDayKey,
        weekStartsOn: settings.weekStartsOn,
      }),
    [
      viewMode,
      activeMonthDate,
      selectedMonthDate,
      filteredTransactions,
      activeLocale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
      settings.weekStartsOn,
    ],
  );

  // --- Selected day transactions ---
  const selectedDayAggregate = useMemo(
    () => globalDailyByDayKey.get(selectedDayKey) ?? null,
    [globalDailyByDayKey, selectedDayKey],
  );

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDayAggregate) return [];
    return [...selectedDayAggregate.transactions].sort(compareTransactionsByDateDesc);
  }, [selectedDayAggregate]);

  const isFutureDay = selectedDayKey > todayDayKey;
  const selectedDayLabel = formatCalendarDate(selectedDayKey, activeLocale);

  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
    }),
    [settings.currencySymbol, settings.displayMode],
  );

  // --- Selection mode ---
  const selectedTransactionTotalLabel = useMemo(() => {
    if (selectedTransactionIds.length === 0) return '';
    const selectedIdSet = new Set(selectedTransactionIds);
    let total = 0;
    filteredTransactions.forEach((transaction) => {
      if (!selectedIdSet.has(transaction.id)) return;
      total += transaction.reportingAmount ?? transaction.amount;
    });
    return formatAmount(
      Math.abs(total),
      { currencySymbol: settings.currencySymbol, displayMode: 'money' },
      { showSign: false, trueHourlyRate: 0 },
    );
  }, [filteredTransactions, selectedTransactionIds, settings.currencySymbol]);

  useEffect(() => {
    if (selectedTransactionIds.length === 0) return;
    const availableIds = new Set(filteredTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [filteredTransactions, selectedTransactionIds.length]);

  useEffect(() => {
    setSelectedTransactionIds([]);
  }, [selectedDayKey]);

  useEffect(() => {
    if (!isSelectionMode) setShowBulkUpdate(false);
  }, [isSelectionMode]);

  useLayoutEffect(() => {
    onSelectionModeChange?.(isSelectionMode);
    return () => {
      onSelectionModeChange?.(false);
    };
  }, [isSelectionMode, onSelectionModeChange]);

  // Pending scroll target after view mode switches — the target FlatList
  // may not be mounted yet when we toggle, so we store the index and apply
  // it once the list appears.
  const pendingMonthScrollRef = useRef<number | null>(null);
  const pendingWeekScrollRef = useRef<number | null>(null);

  const getMonthIndexForDay = useCallback(
    (dayKey: string) => {
      const d = dayKeyToUtcDate(dayKey);
      if (!d) return MONTH_PAGER_CENTER_INDEX;
      const monthDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const offset = monthOffsetFromAnchor(monthPagerAnchorDate, monthDate);
      return clampMonthIndex(MONTH_PAGER_CENTER_INDEX + offset);
    },
    [clampMonthIndex, monthPagerAnchorDate],
  );

  const getWeekIndexForDay = useCallback(
    (dayKey: string) => {
      const ws = weekStartDayKey(dayKey, settings.weekStartsOn);
      const anchorDate = dayKeyToUtcDate(anchorWeekStart);
      const targetDate = dayKeyToUtcDate(ws);
      if (!anchorDate || !targetDate) return CENTER_WEEK_INDEX;
      const diffMs = targetDate.getTime() - anchorDate.getTime();
      return CENTER_WEEK_INDEX + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    },
    [anchorWeekStart, settings.weekStartsOn],
  );

  // Apply pending scrolls when the target list mounts
  const handleMonthListRef = useCallback(
    (ref: FlatList<number> | null) => {
      (horizontalListRef as React.MutableRefObject<FlatList<number> | null>).current = ref;
      if (ref && pendingMonthScrollRef.current != null) {
        const idx = pendingMonthScrollRef.current;
        pendingMonthScrollRef.current = null;
        setActiveMonthIndex(idx);
        requestAnimationFrame(() => {
          ref.scrollToIndex({ index: idx, animated: false });
        });
      }
    },
    [setActiveMonthIndex],
  );

  const handleWeekListRef = useCallback(
    (ref: FlatList<number> | null) => {
      (weekStripListRef as React.MutableRefObject<FlatList<number> | null>).current = ref;
      if (ref && pendingWeekScrollRef.current != null) {
        const idx = pendingWeekScrollRef.current;
        pendingWeekScrollRef.current = null;
        requestAnimationFrame(() => {
          ref.scrollToIndex({ index: idx, animated: false });
        });
      }
    },
    [],
  );

  // --- Toggle expand/collapse ---
  const handleToggleViewMode = useCallback(() => {
    void triggerHaptic('selection');
    LayoutAnimation.configureNext(EXPAND_ANIM_CONFIG);
    if (viewMode === 'week') {
      const idx = getMonthIndexForDay(selectedDayKey);
      setActiveMonthIndex(idx);
      pendingMonthScrollRef.current = idx;
      setViewMode('month');
    } else {
      const idx = getWeekIndexForDay(selectedDayKey);
      pendingWeekScrollRef.current = idx;
      setViewMode('week');
    }
  }, [viewMode, selectedDayKey, getMonthIndexForDay, getWeekIndexForDay, setActiveMonthIndex]);

  // --- Day selection from week strip ---
  const handleSelectDayFromWeek = useCallback((dayKey: string) => {
    setSelectedDayKey(dayKey);
  }, []);

  // --- Day selection from month grid — collapse back to week ---
  const handleSelectDayFromMonth = useCallback(
    (dayKey: string) => {
      void triggerHaptic('selection');
      setSelectedDayKey(dayKey);
      LayoutAnimation.configureNext(EXPAND_ANIM_CONFIG);
      pendingWeekScrollRef.current = getWeekIndexForDay(dayKey);
      setViewMode('week');
    },
    [getWeekIndexForDay],
  );

  // When active month changes in month view, pick a day inside it
  useEffect(() => {
    if (viewMode !== 'month') return;
    setSelectedDayKey((prev) => {
      if (prev && prev >= activeMonthData.firstDayKey && prev <= activeMonthData.lastDayKey) {
        return prev;
      }
      const inMonth =
        activeMonthData.firstDayKey <= todayDayKey && activeMonthData.lastDayKey >= todayDayKey;
      return inMonth ? todayDayKey : activeMonthData.firstDayKey;
    });
  }, [viewMode, activeMonthData.firstDayKey, activeMonthData.lastDayKey, todayDayKey]);

  // --- Month pager navigation ---
  const handlePrevMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(-1);
  }, [scrollToRelativeMonth]);

  const handleNextMonth = useCallback(() => {
    void triggerHaptic('selection');
    scrollToRelativeMonth(1);
  }, [scrollToRelativeMonth]);

  const handleMonthMomentumEnd = useCallback(
    (e: Parameters<typeof handleHorizontalMomentumEnd>[0]) => {
      void triggerHaptic('selection');
      handleHorizontalMomentumEnd(e);
    },
    [handleHorizontalMomentumEnd],
  );

  // --- Filters ---
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

  // --- Month jump picker ---
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
      if (viewMode === 'month') {
        const offset = monthOffsetFromAnchor(monthPagerAnchorDate, monthDate);
        const nextIndex = clampMonthIndex(MONTH_PAGER_CENTER_INDEX + offset);
        setActiveMonthIndex(nextIndex);
        horizontalListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
      } else {
        const y = monthDate.getFullYear();
        const m = String(monthDate.getMonth() + 1).padStart(2, '0');
        const dayKey = `${y}-${m}-01`;
        setSelectedDayKey(dayKey);
        const idx = getWeekIndexForDay(dayKey);
        requestAnimationFrame(() => {
          weekStripListRef.current?.scrollToIndex({ index: idx, animated: false });
        });
      }
      setIsMonthPickerOpen(false);
    },
    [viewMode, clampMonthIndex, monthPagerAnchorDate, setActiveMonthIndex, getWeekIndexForDay],
  );

  // Reset to current month/today
  useEffect(() => {
    if (!resetToCurrentMonthToken) return;
    setSelectedDayKey(todayDayKey);
    if (viewMode === 'month') {
      setActiveMonthIndex(MONTH_PAGER_CENTER_INDEX);
      horizontalListRef.current?.scrollToIndex({
        index: MONTH_PAGER_CENTER_INDEX,
        animated: false,
      });
    } else {
      const idx = getWeekIndexForDay(todayDayKey);
      requestAnimationFrame(() => {
        weekStripListRef.current?.scrollToIndex({ index: idx, animated: false });
      });
    }
  }, [resetToCurrentMonthToken, setActiveMonthIndex, todayDayKey, viewMode, getWeekIndexForDay]);

  // --- Summary formatting ---
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
          {formatAmount(value, settings, { showSign: false })}
        </Text>
      );
    },
    [isTimeMode, settings, themeColors.success, themeColors.error],
  );

  // --- Transaction press handlers ---
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

  // --- Bulk operations ---
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

  const handleOpenIncomeBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('income_breakdown', displayedMonthKey);
  }, [displayedMonthKey, onOpenBreakdownInsight]);

  const handleOpenExpenseBreakdown = useCallback(() => {
    if (!onOpenBreakdownInsight) return;
    void triggerHaptic('selection');
    onOpenBreakdownInsight('expense_breakdown', displayedMonthKey);
  }, [displayedMonthKey, onOpenBreakdownInsight]);

  // --- Month grid rendering for expanded view ---
  const gridChartWidth = useMemo(() => {
    const horizontal = CALENDAR_GRID_HORIZONTAL_PADDING * 2;
    return Math.max(280, contentWidth - horizontal);
  }, [contentWidth]);

  const bottomPad = useMemo(
    () => getBottomNavReservedInset(safeAreaInsets.bottom) + spacing.lg,
    [safeAreaInsets.bottom],
  );

  const selectedTransactionIdSet = useMemo(
    () => new Set(selectedTransactionIds),
    [selectedTransactionIds],
  );

  // --- Month page renderer for month mode FlatList ---
  const renderMonthPage = useCallback(
    ({ item }: { item: number }) => {
      const offset = item - MONTH_PAGER_CENTER_INDEX;
      const pageMonth = addMonthsAtMonthStart(monthPagerAnchorDate, offset);
      return (
        <View style={{ width: pageWidth }}>
          <View style={[styles.calendarWrapper, { paddingHorizontal: CALENDAR_GRID_HORIZONTAL_PADDING }]}>
            <CalendarMonthGrid
              monthData={buildCalendarMonth({
                monthAnchor: pageMonth,
                transactions: filteredTransactions,
                locale: activeLocale,
                isTimeMode,
                getDisplayValueForTransaction,
                todayDayKey,
                weekStartsOn: settings.weekStartsOn,
              })}
              weekdayLabels={weekdayLabels}
              selectedDayKey={selectedDayKey}
              isTimeMode={isTimeMode}
              locale={activeLocale}
              onSelectDay={handleSelectDayFromMonth}
              chartWidth={gridChartWidth}
            />
          </View>
        </View>
      );
    },
    [
      activeLocale,
      filteredTransactions,
      getDisplayValueForTransaction,
      gridChartWidth,
      handleSelectDayFromMonth,
      isTimeMode,
      monthPagerAnchorDate,
      pageWidth,
      selectedDayKey,
      settings.weekStartsOn,
      todayDayKey,
      weekdayLabels,
    ],
  );

  // --- The expand/collapse toggle button ---
  const ExpandCollapseButton = useMemo(
    () => (
      <Pressable
        onPress={handleToggleViewMode}
        accessibilityRole="button"
        accessibilityLabel={viewMode === 'week' ? I18n.t('calendar.expand') : I18n.t('calendar.collapse')}
        className="h-9 w-9 rounded-full items-center justify-center bg-secondary/60 active:scale-95"
      >
        {viewMode === 'week' ? (
          <ChevronDown size={18} color={themeColors.textSoft} />
        ) : (
          <ChevronUp size={18} color={themeColors.textSoft} />
        )}
      </Pressable>
    ),
    [handleToggleViewMode, viewMode, themeColors.textSoft],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* --- Header --- */}
      <TabletContentContainer>
        <View className="bg-background pb-1.5 pt-1">
          <View className="px-5 pt-1.5 gap-2.5">
            {/* Title row */}
            <View className="flex-row items-center justify-between gap-3" style={{ minHeight: 40 }}>
              <View className="flex-row items-center gap-2 flex-1">
                {ExpandCollapseButton}
                <View ref={monthPickerTriggerRef} onLayout={handleMonthTriggerLayout}>
                  <Pressable
                    onPress={handleOpenMonthPicker}
                    accessibilityRole="button"
                    accessibilityLabel={displayedMonthLabel}
                    className="active:opacity-80"
                  >
                    <Text variant="heading" className="tracking-tight" numberOfLines={1}>
                      {displayedMonthLabel}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
                <DisplayModeToggle />
              </View>
            </View>

            {/* Summary row */}
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
          </View>
        </View>
      </TabletContentContainer>

      {/* --- Calendar area --- */}
      <View className="flex-1 overflow-hidden bg-background">
        {viewMode === 'week' ? (
          // WEEK MODE: week strip + day transactions
          <View style={styles.flexOne}>
            <View className="border-b border-border/30">
              <CalendarWeekStrip
                selectedDayKey={selectedDayKey}
                todayDayKey={todayDayKey}
                weekdayLabels={weekdayLabels}
                anchorWeekStart={anchorWeekStart}
                dailyByDayKey={globalDailyByDayKey}
                onSelectDay={handleSelectDayFromWeek}
                onListRef={handleWeekListRef}
              />
            </View>
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={reportBottomNavScroll}
              scrollEventThrottle={32}
            >
              <View style={[styles.daySection, { paddingHorizontal: CALENDAR_HORIZONTAL_PADDING }]}>
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

                {selectedDayTransactions.length === 0 ? (
                  <EmptyState
                    title={I18n.t('calendar.empty_title')}
                    message={
                      isFutureDay
                        ? I18n.t('calendar.future_empty')
                        : I18n.t('calendar.empty_day')
                    }
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
                        onPressTransaction={handleTransactionPress}
                        onPressSplitBadge={handleTransactionSplitBadgePress}
                        onLongPressTransaction={handleTransactionLongPress}
                        selectionMode={isSelectionMode}
                        selected={selectedTransactionIdSet.has(tx.id)}
                        settings={transactionDisplaySettings}
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
        ) : (
          // MONTH MODE: full calendar grid (swipeable months) + day transactions
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={reportBottomNavScroll}
            scrollEventThrottle={32}
          >
            <View style={{ height: undefined }}>
              <FlatList
                ref={handleMonthListRef}
                data={monthPagerSlots}
                keyExtractor={monthPagerKeyExtractor}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                directionalLockEnabled
                decelerationRate="fast"
                overScrollMode="never"
                renderItem={renderMonthPage}
                initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
                getItemLayout={getHorizontalItemLayout}
                onScrollEndDrag={handleHorizontalScrollEndDrag}
                onMomentumScrollEnd={handleMonthMomentumEnd}
                onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                removeClippedSubviews
                nestedScrollEnabled
                style={styles.monthPager}
              />
            </View>

            {/* Month navigation capsule */}
            <View style={{ paddingHorizontal: CALENDAR_HORIZONTAL_PADDING }}>
              <View className="rounded-pill bg-secondary/40 px-1.5 py-1.5 mt-1">
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={handlePrevMonth}
                    className="h-8 w-8 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                  >
                    <ChevronRight
                      size={14}
                      color={themeColors.textSoft}
                      style={{ transform: [{ scaleX: -1 }] }}
                    />
                  </Pressable>
                  <Text variant="caption" tone="muted">
                    {I18n.t('calendar.swipe_months')}
                  </Text>
                  <Pressable
                    onPress={handleNextMonth}
                    className="h-8 w-8 rounded-full items-center justify-center bg-card shadow-soft active:scale-95"
                  >
                    <ChevronRight size={14} color={themeColors.textSoft} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Day detail below the grid */}
            <View style={[styles.daySection, { paddingHorizontal: CALENDAR_HORIZONTAL_PADDING }]}>
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

              {selectedDayTransactions.length === 0 ? (
                <EmptyState
                  title={I18n.t('calendar.empty_title')}
                  message={
                    isFutureDay
                      ? I18n.t('calendar.future_empty')
                      : I18n.t('calendar.empty_day')
                  }
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
                      onPressTransaction={handleTransactionPress}
                      onPressSplitBadge={handleTransactionSplitBadgePress}
                      onLongPressTransaction={handleTransactionLongPress}
                      selectionMode={isSelectionMode}
                      selected={selectedTransactionIdSet.has(tx.id)}
                      settings={transactionDisplaySettings}
                      getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                      compact
                      disableAnimations
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* --- Popovers and modals --- */}
      <MonthJumpPopover
        visible={isMonthPickerOpen}
        anchorRect={monthPickerAnchorRect}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        locale={activeLocale}
        currentMonthDate={viewMode === 'month' ? activeMonthDate : selectedMonthDate}
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
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setBulkDateModalVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('transactions.editor.date')}
                className="rounded-2xl border border-border/30 bg-card px-3.5 py-3.5"
              >
                <Text variant="caption">{bulkDate}</Text>
              </Pressable>
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
          <DatePickerModal
            visible={bulkDateModalVisible}
            value={bulkDate}
            overlay
            onSelect={(value) => {
              setBulkDate(value);
              setBulkDateTouched(true);
              setBulkDateModalVisible(false);
            }}
            onClose={() => setBulkDateModalVisible(false)}
          />
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
  monthPager: {
    flexGrow: 0,
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

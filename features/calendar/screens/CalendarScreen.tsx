import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  Easing as REasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  ActivitySearchRow,
  DisplayModeToggle,
  TransactionItem,
} from '~/features/transactions/components';
import { DatePickerModal } from '~/components/datePicker';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
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
import { CalendarWeekStrip } from '../components/CalendarWeekStrip';
import { CalendarYearView, CENTER_YEAR_INDEX } from '../components/CalendarYearView';
import type { CalendarDayAggregate } from '../lib/calendarBuild';
import {
  buildCalendarMonthFromGrouped,
  dayKeyToUtcDate,
  formatCalendarDate,
  getCalendarWeekdayLabels,
} from '../lib/calendarBuild';

const CALENDAR_HORIZONTAL_PADDING = spacing.screenHorizontal;
const CALENDAR_GRID_HORIZONTAL_PADDING = spacing.xs;
const ZOOM_TIMING = { duration: 350, easing: REasing.out(REasing.cubic) } as const;

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

export function CalendarScreen({
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
  const { contentWidth, isTablet } = useDeviceLayout();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const isTimeMode = settings.displayMode === 'time';
  const reportBottomNavScroll = useBottomNavScrollReporter();

  const todayDayKey = useMemo(() => dayKeyFromDateLocal(new Date()), []);

  // --- View mode: 'day' | 'month' | 'year' (Apple Calendar-like zoom) ---
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayDayKey);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput | null>(null);
  const hasActiveSearch = searchQuery.trim().length > 0;

  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPicker, setActiveFilterPicker] = useState<FilterPickerKind | null>(null);
  const [excludedAccountIds, setExcludedAccountIds] = useState<string[]>([]);
  const [excludedIncomeCategoryIds, setExcludedIncomeCategoryIds] = useState<string[]>([]);
  const [excludedExpenseCategoryIds, setExcludedExpenseCategoryIds] = useState<string[]>([]);

  // --- Zoom animations (reanimated) ---
  // dayMonthZoom: 0 = day view, 1 = month view
  const dayMonthZoom = useSharedValue(0);
  // monthYearZoom: 0 = month view, 1 = year view
  const monthYearZoom = useSharedValue(0);

  const dayLayerStyle = useAnimatedStyle(() => {
    const t = dayMonthZoom.value;
    if (t <= 0) return { opacity: 1, zIndex: 3 };
    if (t >= 1) return { opacity: 0, zIndex: 0 };
    return {
      opacity: 1 - t,
      zIndex: t < 0.5 ? 3 : 0,
    };
  });

  const monthLayerStyle = useAnimatedStyle(() => {
    const dm = dayMonthZoom.value;
    const my = monthYearZoom.value;
    if (dm <= 0) return { opacity: 0, zIndex: 0 };
    if (dm >= 1 && my <= 0) return { opacity: 1, transform: [{ scale: 1 }], zIndex: 2 };
    let opacity = dm;
    let scale = 1;
    if (my > 0) {
      scale = 1 - my * 0.85;
      opacity = Math.min(opacity, Math.max(0, 1 - my * 1.5));
    }
    return { opacity, transform: [{ scale }], zIndex: dm >= 0.5 && my < 0.5 ? 2 : 0 };
  });

  const yearLayerStyle = useAnimatedStyle(() => {
    const my = monthYearZoom.value;
    if (my >= 1) return { opacity: 1, transform: [{ scale: 1 }], zIndex: 2 };
    if (my <= 0) return { opacity: 0, transform: [{ scale: 0.3 }], zIndex: 0 };
    const scale = 0.3 + my * 0.7;
    const opacity = Math.min(1, my * 2);
    return { opacity, transform: [{ scale }], zIndex: my > 0.5 ? 2 : 0 };
  });

  // --- Year view ---
  const centerYear = useMemo(() => new Date().getFullYear(), []);
  const yearViewListRef = useRef<FlatList<number> | null>(null);

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

  // --- Refs ---
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

  const incomeCategoryPickerDataRef = useRef<CategoryPickerData | null>(null);
  const expenseCategoryPickerDataRef = useRef<CategoryPickerData | null>(null);
  if (showFilters) {
    incomeCategoryPickerDataRef.current = buildCategoryPickerData(categories, 'income');
    expenseCategoryPickerDataRef.current = buildCategoryPickerData(categories, 'expense');
  }
  const incomeCategoryPickerData = incomeCategoryPickerDataRef.current;
  const expenseCategoryPickerData = expenseCategoryPickerDataRef.current;

  const activeFilterCount =
    excludedAccountIds.length +
    excludedIncomeCategoryIds.length +
    excludedExpenseCategoryIds.length;

  // --- Search filtering ---
  const searchFilteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredTransactions;
    return filteredTransactions.filter((tx) => {
      if (tx.note && tx.note.toLowerCase().includes(q)) return true;
      if (tx.categoryName && tx.categoryName.toLowerCase().includes(q)) return true;
      if (tx.categoryParentName && tx.categoryParentName.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [filteredTransactions, searchQuery]);

  // --- Pre-group transactions by month key (single pass) ---
  const transactionsByMonthKey = useMemo(() => {
    const map = new Map<string, TransactionWithRelations[]>();
    for (const tx of searchFilteredTransactions) {
      const mk = dayKeyFromIsoLocal(tx.date).slice(0, 7);
      let arr = map.get(mk);
      if (!arr) {
        arr = [];
        map.set(mk, arr);
      }
      arr.push(tx);
    }
    return map;
  }, [searchFilteredTransactions]);

  // --- Build a global daily aggregate map for the week strip (no transaction arrays) ---
  const globalDailyByDayKey = useMemo(() => {
    const map = new Map<string, CalendarDayAggregate>();
    for (const tx of searchFilteredTransactions) {
      if (tx.type !== 'income' && tx.type !== 'expense') continue;
      const dayKey = dayKeyFromIsoLocal(tx.date);
      let agg = map.get(dayKey);
      if (!agg) {
        agg = { dayKey, income: 0, expense: 0, net: 0, transactionCount: 0, transactions: [] };
        map.set(dayKey, agg);
      }
      const value = isTimeMode
        ? getDisplayValueForTransaction(tx)
        : (tx.reportingAmount ?? tx.amount);
      if (tx.type === 'income') {
        agg.income += value;
      } else {
        agg.expense += value;
      }
      agg.transactionCount += 1;
    }
    map.forEach((agg) => {
      agg.net = agg.income - agg.expense;
    });
    return map;
  }, [searchFilteredTransactions, isTimeMode, getDisplayValueForTransaction]);

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

  const displayedMonthLabel = viewMode === 'day' ? selectedMonthLabel : activeMonthLabel;

  const activeMonthKey = useMemo(() => monthKeyFromDateLocal(activeMonthDate), [activeMonthDate]);
  const selectedMonthKey = useMemo(() => {
    const d = dayKeyToUtcDate(selectedDayKey);
    return d ? monthKeyFromDateLocal(d) : monthKeyFromDateLocal(new Date());
  }, [selectedDayKey]);

  const displayedMonthKey = viewMode === 'day' ? selectedMonthKey : activeMonthKey;

  // --- Build month data for the active month (header summary + month grid) ---
  const activeMonthData = useMemo(() => {
    const anchor = viewMode !== 'day' ? activeMonthDate : selectedMonthDate;
    const mk = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
    return buildCalendarMonthFromGrouped({
      monthAnchor: anchor,
      transactions: transactionsByMonthKey.get(mk) ?? [],
      locale: activeLocale,
      isTimeMode,
      getDisplayValueForTransaction,
      todayDayKey,
      weekStartsOn: settings.weekStartsOn,
    });
  }, [
    viewMode,
    activeMonthDate,
    selectedMonthDate,
    transactionsByMonthKey,
    activeLocale,
    isTimeMode,
    getDisplayValueForTransaction,
    todayDayKey,
    settings.weekStartsOn,
  ]);

  // --- Selected day transactions ---
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

  const handleMonthListRef = useCallback((ref: FlatList<number> | null) => {
    (horizontalListRef as React.MutableRefObject<FlatList<number> | null>).current = ref;
  }, []);

  const handleYearListRef = useCallback((ref: FlatList<number> | null) => {
    yearViewListRef.current = ref;
  }, []);

  // --- Back / zoom out: day → month → year ---
  const handleZoomOut = useCallback(() => {
    void triggerHaptic('selection');
    if (viewMode === 'day') {
      const idx = getMonthIndexForDay(selectedDayKey);
      setActiveMonthIndex(idx);
      requestAnimationFrame(() => {
        horizontalListRef.current?.scrollToIndex({ index: idx, animated: false });
      });
      setViewMode('month');
      dayMonthZoom.value = withTiming(1, ZOOM_TIMING);
    } else if (viewMode === 'month') {
      const d = dayKeyToUtcDate(selectedDayKey);
      const yr = d ? d.getUTCFullYear() : centerYear;
      const yearIdx = CENTER_YEAR_INDEX + (yr - centerYear);
      requestAnimationFrame(() => {
        yearViewListRef.current?.scrollToIndex({ index: yearIdx, animated: false });
      });
      setViewMode('year');
      monthYearZoom.value = withTiming(1, ZOOM_TIMING);
    }
  }, [
    viewMode,
    selectedDayKey,
    getMonthIndexForDay,
    setActiveMonthIndex,
    centerYear,
    dayMonthZoom,
    monthYearZoom,
  ]);

  // --- Day selection from week strip ---
  const handleSelectDayFromWeek = useCallback((dayKey: string) => {
    setSelectedDayKey(dayKey);
  }, []);

  // --- Day selection from month grid — zoom in to day view ---
  const handleSelectDayFromMonth = useCallback(
    (dayKey: string) => {
      void triggerHaptic('selection');
      setSelectedDayKey(dayKey);
      setViewMode('day');
      dayMonthZoom.value = withTiming(0, ZOOM_TIMING);
    },
    [dayMonthZoom],
  );

  // --- Month selection from year view — zoom in to month view ---
  const handleSelectMonthFromYear = useCallback(
    (year: number, monthIndex: number) => {
      void triggerHaptic('selection');
      const monthDate = new Date(Date.UTC(year, monthIndex, 1));
      const offset = monthOffsetFromAnchor(monthPagerAnchorDate, monthDate);
      const idx = clampMonthIndex(MONTH_PAGER_CENTER_INDEX + offset);
      const m = String(monthIndex + 1).padStart(2, '0');
      const dayKey = `${year}-${m}-01`;
      setSelectedDayKey(dayKey);
      setActiveMonthIndex(idx);
      requestAnimationFrame(() => {
        horizontalListRef.current?.scrollToIndex({ index: idx, animated: false });
      });
      setViewMode('month');
      monthYearZoom.value = withTiming(0, ZOOM_TIMING);
    },
    [monthPagerAnchorDate, clampMonthIndex, setActiveMonthIndex, monthYearZoom],
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
  const handleMonthMomentumEnd = useCallback(
    (e: Parameters<typeof handleHorizontalMomentumEnd>[0]) => {
      void triggerHaptic('selection');
      handleHorizontalMomentumEnd(e);
    },
    [handleHorizontalMomentumEnd],
  );

  // --- Search ---
  const handleOpenSearch = useCallback(() => {
    void triggerHaptic('light');
    if (isSearchOpen) {
      searchInputRef.current?.focus();
      return;
    }
    setIsSearchOpen(true);
  }, [isSearchOpen]);

  const handleCloseSearch = useCallback(() => {
    void triggerHaptic('light');
    setSearchQuery('');
    searchInputRef.current?.blur();
    setIsSearchOpen(false);
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  // --- Filters ---
  const handleResetFilters = useCallback(() => {
    void triggerHaptic('selection');
    setExcludedAccountIds([]);
    setExcludedIncomeCategoryIds([]);
    setExcludedExpenseCategoryIds([]);
  }, []);

  const handleOpenFilters = useCallback(() => {
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

  // Reset to current month/today
  useEffect(() => {
    if (!resetToCurrentMonthToken) return;
    setSelectedDayKey(todayDayKey);
    if (viewMode === 'year') {
      yearViewListRef.current?.scrollToIndex({ index: CENTER_YEAR_INDEX, animated: false });
    } else if (viewMode === 'month') {
      setActiveMonthIndex(MONTH_PAGER_CENTER_INDEX);
      horizontalListRef.current?.scrollToIndex({
        index: MONTH_PAGER_CENTER_INDEX,
        animated: false,
      });
    }
  }, [resetToCurrentMonthToken, setActiveMonthIndex, todayDayKey, viewMode]);

  const isOnToday = selectedDayKey === todayDayKey && viewMode === 'day';

  const handleGoToToday = useCallback(() => {
    void triggerHaptic('selection');
    setSelectedDayKey(todayDayKey);
    if (viewMode === 'year') {
      yearViewListRef.current?.scrollToIndex({ index: CENTER_YEAR_INDEX, animated: false });
      setViewMode('day');
      monthYearZoom.value = withTiming(0, ZOOM_TIMING);
      dayMonthZoom.value = withTiming(0, ZOOM_TIMING);
    } else if (viewMode === 'month') {
      setActiveMonthIndex(MONTH_PAGER_CENTER_INDEX);
      horizontalListRef.current?.scrollToIndex({
        index: MONTH_PAGER_CENTER_INDEX,
        animated: false,
      });
      setViewMode('day');
      dayMonthZoom.value = withTiming(0, ZOOM_TIMING);
    }
  }, [todayDayKey, viewMode, setActiveMonthIndex, dayMonthZoom, monthYearZoom]);

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
      const mk = `${pageMonth.getFullYear()}-${String(pageMonth.getMonth() + 1).padStart(2, '0')}`;
      return (
        <View style={{ width: pageWidth }}>
          <View
            style={[
              styles.calendarWrapper,
              { paddingHorizontal: CALENDAR_GRID_HORIZONTAL_PADDING },
            ]}
          >
            <CalendarMonthGrid
              monthData={buildCalendarMonthFromGrouped({
                monthAnchor: pageMonth,
                transactions: transactionsByMonthKey.get(mk) ?? [],
                locale: activeLocale,
                isTimeMode,
                getDisplayValueForTransaction,
                todayDayKey,
                weekStartsOn: settings.weekStartsOn,
              })}
              weekdayLabels={weekdayLabels}
              selectedDayKey={null}
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
      transactionsByMonthKey,
      getDisplayValueForTransaction,
      gridChartWidth,
      handleSelectDayFromMonth,
      isTimeMode,
      monthPagerAnchorDate,
      pageWidth,
      settings.weekStartsOn,
      todayDayKey,
      weekdayLabels,
    ],
  );

  // --- Selected day data ---
  const selectedDayLabel = useMemo(
    () => formatCalendarDate(selectedDayKey, activeLocale),
    [selectedDayKey, activeLocale],
  );

  const selectedDayAgg = useMemo(
    () => globalDailyByDayKey.get(selectedDayKey) ?? null,
    [globalDailyByDayKey, selectedDayKey],
  );

  const selectedDayTxs = useMemo(() => {
    const mk = selectedDayKey.slice(0, 7);
    const monthTxs = transactionsByMonthKey.get(mk);
    if (!monthTxs) return [];
    return monthTxs
      .filter(
        (tx) =>
          (tx.type === 'income' || tx.type === 'expense') &&
          dayKeyFromIsoLocal(tx.date) === selectedDayKey,
      )
      .sort(compareTransactionsByDateDesc);
  }, [transactionsByMonthKey, selectedDayKey]);

  const isSelectedDayFuture = selectedDayKey > todayDayKey;

  const activeYearLabel = useMemo(() => String(activeMonthDate.getFullYear()), [activeMonthDate]);

  // --- Back/zoom-out button ---
  const backButtonLabel = useMemo(() => {
    if (viewMode === 'day') return displayedMonthLabel;
    if (viewMode === 'month') return activeYearLabel;
    return '';
  }, [viewMode, displayedMonthLabel, activeYearLabel]);

  const BackButton = useMemo(
    () =>
      viewMode === 'year' ? null : (
        <Pressable
          onPress={handleZoomOut}
          accessibilityRole="button"
          accessibilityLabel={backButtonLabel}
          className="flex-row items-center gap-0.5 active:opacity-70"
          hitSlop={8}
        >
          <ChevronLeft size={22} color={themeColors.primary} />
          <Text variant="body" style={{ color: themeColors.primary }}>
            {backButtonLabel}
          </Text>
        </Pressable>
      ),
    [viewMode, handleZoomOut, backButtonLabel, themeColors.primary],
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
                {BackButton}
                {viewMode === 'month' ? (
                  <Text variant="subheading" className="tracking-tight">
                    {activeMonthLabel}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.filters.search')}
                  onPress={handleOpenSearch}
                  className={cn(
                    'h-10 w-10 items-center justify-center rounded-full border active:opacity-85',
                    isSearchOpen || hasActiveSearch
                      ? 'border-primary/45 bg-primary/10'
                      : 'border-border/40 bg-card',
                  )}
                >
                  <Search
                    size={15}
                    color={
                      isSearchOpen || hasActiveSearch ? themeColors.primary : themeColors.textMuted
                    }
                  />
                </Pressable>
                <FilterIconButton onPress={handleOpenFilters} count={activeFilterCount} />
                <DisplayModeToggle />
              </View>
            </View>

            {/* Search row */}
            <ActivitySearchRow
              inputRef={searchInputRef}
              visible={isSearchOpen || hasActiveSearch}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onClose={handleCloseSearch}
            />

            {/* Summary row */}
            {viewMode !== 'year' && (
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
            )}
          </View>
        </View>
      </TabletContentContainer>

      {/* --- Calendar area: three stacked reanimated layers --- */}
      <View className="flex-1 overflow-hidden bg-background">
        {/* Day layer */}
        <Reanimated.View
          style={[styles.zoomLayer, dayLayerStyle]}
          pointerEvents={viewMode === 'day' ? 'auto' : 'none'}
        >
          <View style={styles.flexOne}>
            <View className="border-b border-border/30">
              <CalendarWeekStrip
                selectedDayKey={selectedDayKey}
                todayDayKey={todayDayKey}
                weekdayLabels={weekdayLabels}
                weekStartsOn={settings.weekStartsOn}
                dailyByDayKey={globalDailyByDayKey}
                onSelectDay={handleSelectDayFromWeek}
              />
            </View>
            <ScrollView
              style={styles.flexOne}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={reportBottomNavScroll}
              scrollEventThrottle={32}
            >
              <View style={[styles.daySection, { paddingHorizontal: CALENDAR_HORIZONTAL_PADDING }]}>
                <View style={styles.daySectionHeader}>
                  <View style={styles.daySectionTitleGroup}>
                    <Text variant="bodyStrong" className="tracking-tight">
                      {selectedDayLabel}
                    </Text>
                  </View>
                  <View style={styles.daySectionSubtotals}>
                    {selectedDayAgg && selectedDayAgg.income > 0 ? (
                      <View className="rounded-full bg-success/10 px-2 py-0.5">
                        {formatDaySubtotal(selectedDayAgg.income, 'income')}
                      </View>
                    ) : null}
                    {selectedDayAgg && selectedDayAgg.expense > 0 ? (
                      <View className="rounded-full bg-destructive/10 px-2 py-0.5">
                        {formatDaySubtotal(selectedDayAgg.expense, 'expense')}
                      </View>
                    ) : null}
                  </View>
                </View>

                {selectedDayTxs.length === 0 ? (
                  <EmptyState
                    title={I18n.t('calendar.empty_title')}
                    message={
                      isSelectedDayFuture
                        ? I18n.t('calendar.future_empty')
                        : I18n.t('calendar.empty_day')
                    }
                    mascotMood="curious"
                    animateIn={false}
                    compact
                  />
                ) : (
                  <View style={styles.transactionList}>
                    {selectedDayTxs.map((tx) => (
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
        </Reanimated.View>

        {/* Month layer */}
        <Reanimated.View
          style={[styles.zoomLayer, monthLayerStyle]}
          pointerEvents={viewMode === 'month' ? 'auto' : 'none'}
        >
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
            style={styles.flexOne}
          />
        </Reanimated.View>

        {/* Year layer */}
        <Reanimated.View
          style={[styles.zoomLayer, yearLayerStyle]}
          pointerEvents={viewMode === 'year' ? 'auto' : 'none'}
        >
          <CalendarYearView
            centerYear={centerYear}
            todayDayKey={todayDayKey}
            dailyByDayKey={globalDailyByDayKey}
            weekStartsOn={settings.weekStartsOn}
            locale={activeLocale}
            onSelectMonth={handleSelectMonthFromYear}
            onListRef={handleYearListRef}
          />
        </Reanimated.View>
      </View>

      {/* Floating Today button — bottom left */}
      {!isOnToday && !isSelectionMode ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: getBottomNavReservedInset(safeAreaInsets.bottom) + 12,
          }}
        >
          <View
            pointerEvents="box-none"
            style={[
              { paddingLeft: spacing.lg },
              isTablet && {
                maxWidth: TABLET_CONTENT_MAX_WIDTH,
                alignSelf: 'center' as const,
                width: '100%',
              },
            ]}
          >
            <Pressable
              onPress={handleGoToToday}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.today')}
              className="flex-row items-center gap-1.5 rounded-full bg-card border border-border/40 px-3.5 py-2.5 active:opacity-85"
              style={styles.todayFab}
            >
              <CalendarDays size={15} color={themeColors.primary} />
              <Text variant="caption" style={{ color: themeColors.primary }}>
                {I18n.t('common.today')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
          {incomeCategoryPickerData ? (
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
          ) : null}
          {expenseCategoryPickerData ? (
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
          ) : null}
        </SafeAreaView>
      </ThemeModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  zoomLayer: {
    ...StyleSheet.absoluteFillObject,
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
  todayFab: {
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
});

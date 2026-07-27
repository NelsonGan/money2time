import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Svg, { G, Polyline, Text as SvgText } from 'react-native-svg';

import {
  CategoryEmoji,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  TimeValueInline,
} from '~/components/ui';
import { categoryIconToEmoji } from '~/constants/categoryIcons';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import {
  BREAKDOWN_PIE_LABEL_HEIGHT,
  BREAKDOWN_PIE_LABEL_LINE_LENGTH,
  BREAKDOWN_PIE_LABEL_MARGIN,
  BREAKDOWN_PIE_LABEL_MAX_WIDTH,
  BREAKDOWN_PIE_LABEL_MIN_WIDTH,
  BREAKDOWN_PIE_LABEL_TAIL_LENGTH,
  BREAKDOWN_PIE_MAX_RADIUS,
  BREAKDOWN_PIE_MIN_RADIUS,
  layoutBreakdownPieLabels,
} from '~/features/insights/breakdownPieLayout';
import {
  ActivityTransactionList,
  buildBulkUpdateInputs,
  BulkEditTransactionsSheet,
  type BulkTransactionChanges,
  TransactionSelectionToolbar,
} from '~/features/transactions/components';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { FONT } from '~/utils/fonts';
import { formatAmount, formatHours } from '~/utils/formatters';

type DrilldownSortOption = 'default' | 'largest_value';
type DrilldownTransactionFilter = 'income' | 'expense';

const DRILLDOWN_DIRECT_PARENT_ROW_ID = '__direct-parent__';
const EMPTY_DRILLDOWN_TRANSACTIONS: TransactionWithRelations[] = [];

const INSIGHTS_CHART_COLORS = [
  '#E53935',
  '#FB8C00',
  '#FDD835',
  '#43A047',
  '#00897B',
  '#00ACC1',
  '#1E88E5',
  '#3949AB',
  '#8E24AA',
  '#D81B60',
  '#6D4C41',
  '#546E7A',
];

const BREAKDOWN_TINT_EXPENSE = '#D24B36';
const BREAKDOWN_TINT_INCOME = '#1D9B63';

function buildSizeStyle(width: number, height: number) {
  return { width, height };
}

function pieSliceIdFromTouch(
  point: { x: number; y: number },
  slices: { id: string; amount: number }[],
  totalAmount: number,
  radius: number,
) {
  if (slices.length === 0 || totalAmount <= 0 || radius <= 0) return null;
  const center = radius;
  const dx = point.x - center;
  const dy = point.y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > radius) return null;

  const fullCircle = Math.PI * 2;
  const startAngle = -Math.PI / 2;
  let normalizedAngle = Math.atan2(dy, dx) - startAngle;
  if (normalizedAngle < 0) normalizedAngle += fullCircle;

  let cursor = 0;
  for (const slice of slices) {
    cursor += (slice.amount / totalAmount) * fullCircle;
    if (normalizedAngle <= cursor) return slice.id;
  }
  return slices[slices.length - 1]?.id ?? null;
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  sortControlsContent: {
    gap: spacing.xs,
    alignItems: 'center',
    paddingRight: spacing.xs,
  },
  chartSizeCenter: {
    alignSelf: 'center',
  },
  breakdownPercentBadge: {
    borderRadius: 999,
  },
  subcategoryScrollContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: LIST_BOTTOM_PADDING,
    paddingTop: spacing.xxs,
  },
});

interface DrilldownSubcategoryRow {
  id: string;
  label: string;
  emoji: string;
  totalValue: number;
  sharePct: number;
  count: number;
  transactions: TransactionWithRelations[];
}

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
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

export interface InsightsDrilldownPayload {
  label: string;
  transactionIds: string[];
  showTypeFilter?: boolean;
  categoryRootId?: string;
  categoryRootLabel?: string;
  categoryRootEmoji?: string;
  categoryRootColor?: string;
  showSubcategorySelection?: boolean;
  /**
   * When set, this drilldown was opened from an album. The selection delete
   * action removes transactions from that album instead of deleting them, and
   * subcategory drilldowns carry the same album context.
   */
  albumId?: string;
}

interface InsightsDrilldownScreenProps {
  payload: InsightsDrilldownPayload;
  onBack: () => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (transaction: TransactionWithRelations) => void;
  onOpenSubcategoryDrilldown?: (payload: InsightsDrilldownPayload) => void;
  /**
   * Album-context override: when provided, the selection delete button removes
   * the transactions from the album rather than deleting them outright.
   */
  onRemoveFromAlbum?: (transactionIds: string[]) => void;
}

export function InsightsDrilldownScreen({
  payload,
  onBack,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenSubcategoryDrilldown,
  onRemoveFromAlbum,
}: InsightsDrilldownScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';
  const { width } = useWindowDimensions();
  const { isTablet } = useDeviceLayout();
  const {
    albums,
    categories,
    settings,
    updateTransactionsBulk,
    deleteTransactionsBulk,
    getAlbumTransactionIds,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
  } = useApp();
  const { transactions } = useTransactions();
  const [drilldownTypeFilter, setDrilldownTypeFilter] =
    useState<DrilldownTransactionFilter>('expense');
  const [drilldownSortOption, setDrilldownSortOption] = useState<DrilldownSortOption>('default');
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [activeBreakdownSliceId, setActiveBreakdownSliceId] = useState<string | null>(null);
  const activeBreakdownSliceIdRef = useRef<string | null>(null);
  const setActiveBreakdownSlice = useCallback((nextId: string | null, withHaptic = false) => {
    if (activeBreakdownSliceIdRef.current === nextId) return;
    activeBreakdownSliceIdRef.current = nextId;
    setActiveBreakdownSliceId(nextId);
    if (withHaptic && nextId) {
      void triggerHaptic('selection');
    }
  }, []);
  const drilldownScrollToTopRef = useRef<(() => void) | null>(null);
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
    }),
    [settings.currencySymbol, settings.displayMode],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const rootCategoryId = payload.categoryRootId ?? null;
  const rootCategory = useMemo(
    () => (rootCategoryId ? (categoryById.get(rootCategoryId) ?? null) : null),
    [categoryById, rootCategoryId],
  );
  const { rootChildCategories, rootChildCategoryIdSet } = useMemo(() => {
    if (!rootCategoryId) {
      return {
        rootChildCategories: [] as Category[],
        rootChildCategoryIdSet: new Set<string>(),
      };
    }

    const children: Category[] = [];
    const childIds = new Set<string>();
    categories.forEach((category) => {
      if (category.parentId !== rootCategoryId) return;
      children.push(category);
      childIds.add(category.id);
    });
    children.sort((a, b) => {
      const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDelta !== 0) return orderDelta;
      return a.name.localeCompare(b.name);
    });

    return { rootChildCategories: children, rootChildCategoryIdSet: childIds };
  }, [categories, rootCategoryId]);
  const hasRootChildCategories = rootChildCategories.length > 0;
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;

  const sortTransactions = useCallback(
    (items: TransactionWithRelations[]) => {
      if (drilldownSortOption !== 'largest_value' || items.length < 2) return items;
      const valueById = new Map<string, number>();
      items.forEach((item) => {
        valueById.set(
          item.id,
          settings.displayMode === 'time'
            ? getDisplayValueForTransaction(item)
            : (item.reportingAmount ?? item.amount),
        );
      });
      const sorted = [...items];
      sorted.sort((a, b) => {
        const aValue = valueById.get(a.id) ?? 0;
        const bValue = valueById.get(b.id) ?? 0;
        const amountDelta = Math.abs(bValue) - Math.abs(aValue);
        if (amountDelta !== 0) return amountDelta;
        const dateDelta = b.date.localeCompare(a.date);
        if (dateDelta !== 0) return dateDelta;
        return b.createdAt.localeCompare(a.createdAt);
      });
      return sorted;
    },
    [drilldownSortOption, getDisplayValueForTransaction, settings.displayMode],
  );
  // In album mode, restrict to transactions still in the album so removals
  // disappear immediately (membership edits trigger a full reload of `albums`).
  // `albums` is included so membership edits (which trigger a full reload)
  // recompute this immediately.
  const albumMemberIds = useMemo(
    () => (payload.albumId ? new Set(getAlbumTransactionIds(payload.albumId)) : null),
    [payload.albumId, getAlbumTransactionIds, albums],
  );
  const { resolvedTransactions, payloadTransactionById } = useMemo(() => {
    const requestedTransactionIds = new Set(payload.transactionIds);
    const nextTransactionById = new Map<string, TransactionWithRelations>();
    transactions.forEach((transaction) => {
      if (!requestedTransactionIds.has(transaction.id)) return;
      if (albumMemberIds && !albumMemberIds.has(transaction.id)) return;
      // When scoped to a category, drop transactions whose category was changed
      // away from this root (e.g. via bulk edit) so they disappear immediately
      // instead of lingering until the next reload.
      if (
        rootCategoryId &&
        transaction.categoryId !== rootCategoryId &&
        !(transaction.categoryId !== null && rootChildCategoryIdSet.has(transaction.categoryId))
      ) {
        return;
      }
      nextTransactionById.set(transaction.id, transaction);
    });

    const resolved: TransactionWithRelations[] = [];
    payload.transactionIds.forEach((id) => {
      const transaction = nextTransactionById.get(id);
      if (transaction) {
        resolved.push(transaction);
      }
    });
    return {
      resolvedTransactions: sortTransactions(resolved),
      payloadTransactionById: nextTransactionById,
    };
  }, [
    albumMemberIds,
    payload.transactionIds,
    rootCategoryId,
    rootChildCategoryIdSet,
    sortTransactions,
    transactions,
  ]);
  const subcategoryRows = useMemo<DrilldownSubcategoryRow[]>(() => {
    if (!rootCategoryId || !hasRootChildCategories) return [];

    const rowsById = new Map<string, DrilldownSubcategoryRow>();
    const parentLabel = String(
      payload.categoryRootLabel?.trim() || rootCategory?.name || I18n.t('common.other'),
    );
    const parentEmoji = resolveCategoryIcon(
      payload.categoryRootEmoji ?? rootCategory?.icon ?? null,
      null,
    );
    const addRow = (
      rowId: string,
      label: string,
      emoji: string,
      transaction: TransactionWithRelations,
      value: number,
    ) => {
      const existing = rowsById.get(rowId);
      if (existing) {
        existing.totalValue += value;
        existing.count += 1;
        existing.transactions.push(transaction);
        return;
      }
      rowsById.set(rowId, {
        id: rowId,
        label,
        emoji,
        totalValue: value,
        sharePct: 0,
        count: 1,
        transactions: [transaction],
      });
    };

    resolvedTransactions.forEach((transaction) => {
      const value =
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(transaction)
          : (transaction.reportingAmount ?? transaction.amount);
      const categoryId = transaction.categoryId ?? null;
      const transactionCategory = transaction.categoryId
        ? (categoryById.get(transaction.categoryId) ?? null)
        : null;

      if (categoryId && rootChildCategoryIdSet.has(categoryId)) {
        const label = String(
          transactionCategory?.name ?? transaction.categoryName ?? I18n.t('common.other'),
        );
        const emoji = resolveCategoryIcon(
          transactionCategory?.icon ?? transaction.categoryIcon ?? null,
          rootCategory?.icon ?? payload.categoryRootEmoji ?? null,
        );
        addRow(categoryId, label, emoji, transaction, value);
        return;
      }

      if (categoryId === rootCategoryId || transactionCategory?.id === rootCategoryId) {
        addRow(DRILLDOWN_DIRECT_PARENT_ROW_ID, parentLabel, parentEmoji, transaction, value);
        return;
      }

      if (transactionCategory?.parentId === rootCategoryId) {
        const label = transactionCategory.name;
        const emoji = resolveCategoryIcon(
          transactionCategory.icon,
          rootCategory?.icon ?? payload.categoryRootEmoji ?? null,
        );
        addRow(transactionCategory.id, label, emoji, transaction, value);
        return;
      }

      const fallbackLabel = String(transaction.categoryName?.trim() || I18n.t('common.other'));
      const fallbackEmoji = resolveCategoryIcon(
        transaction.categoryIcon ?? null,
        rootCategory?.icon ?? payload.categoryRootEmoji ?? null,
      );
      addRow(
        `legacy-subcategory:${fallbackLabel.toLowerCase()}`,
        fallbackLabel,
        fallbackEmoji,
        transaction,
        value,
      );
    });

    const sortedRows = Array.from(rowsById.values()).sort((a, b) => {
      const valueDelta = Math.abs(b.totalValue) - Math.abs(a.totalValue);
      if (valueDelta !== 0) return valueDelta;
      const countDelta = b.count - a.count;
      if (countDelta !== 0) return countDelta;
      return a.label.localeCompare(b.label);
    });
    const totalAbs = sortedRows.reduce((sum, row) => sum + Math.abs(row.totalValue), 0);
    return sortedRows.map((row) => ({
      ...row,
      sharePct: totalAbs > 0 ? (Math.abs(row.totalValue) / totalAbs) * 100 : 0,
    }));
  }, [
    categoryById,
    getDisplayValueForTransaction,
    hasRootChildCategories,
    payload.categoryRootEmoji,
    payload.categoryRootLabel,
    resolvedTransactions,
    rootCategory?.icon,
    rootCategory?.name,
    rootCategoryId,
    rootChildCategoryIdSet,
    settings.displayMode,
  ]);
  const hasSubcategorySelectionStage = hasRootChildCategories && subcategoryRows.length > 0;
  const shouldShowSubcategoryList =
    (payload.showSubcategorySelection ?? true) && hasSubcategorySelectionStage;
  const scopedTransactions = useMemo(
    () => (shouldShowSubcategoryList ? EMPTY_DRILLDOWN_TRANSACTIONS : resolvedTransactions),
    [resolvedTransactions, shouldShowSubcategoryList],
  );
  const displayedTransactions = useMemo(() => {
    if (!payload.showTypeFilter) return scopedTransactions;

    const targetType = drilldownTypeFilter === 'income' ? 'income' : 'expense';
    const filtered: TransactionWithRelations[] = [];
    scopedTransactions.forEach((transaction) => {
      if (transaction.type === targetType) {
        filtered.push(transaction);
      }
    });
    return sortTransactions(filtered);
  }, [drilldownTypeFilter, payload.showTypeFilter, scopedTransactions, sortTransactions]);
  const selectedTransactionTotal = useMemo(() => {
    if (selectedTransactionIds.length === 0) return 0;

    const selectedIdSet = new Set(selectedTransactionIds);
    let total = 0;
    displayedTransactions.forEach((transaction) => {
      if (!selectedIdSet.has(transaction.id)) return;
      total +=
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(transaction)
          : (transaction.reportingAmount ?? transaction.amount);
    });
    return total;
  }, [
    displayedTransactions,
    getDisplayValueForTransaction,
    selectedTransactionIds,
    settings.displayMode,
  ]);
  const selectedTransactionTotalLabel = useMemo(
    () =>
      settings.displayMode === 'time'
        ? formatHours(Math.abs(selectedTransactionTotal))
        : formatAmount(Math.abs(selectedTransactionTotal), settings, { showSign: false }),
    [selectedTransactionTotal, settings],
  );
  const renderDisplayValueNode = useCallback(
    (
      value: string,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        iconColor?: string;
        iconSize?: number;
        style?: React.ComponentProps<typeof Text>['style'];
      } = {},
    ) => {
      const {
        variant = 'label',
        tone = 'default',
        textClassName,
        iconColor,
        iconSize,
        style,
      } = options;
      if (settings.displayMode === 'time') {
        return (
          <TimeValueInline
            value={value}
            variant={variant}
            tone={tone}
            textClassName={textClassName}
            iconColor={iconColor}
            iconSize={iconSize}
            style={style}
          />
        );
      }
      return (
        <Text variant={variant} tone={tone} className={textClassName} style={style}>
          {value}
        </Text>
      );
    },
    [settings.displayMode],
  );
  const selectedTransactionTotalToneClass = 'text-foreground';
  const shouldGroupByDate = drilldownSortOption !== 'largest_value';
  const handleSortOptionChange = useCallback(
    (nextOption: DrilldownSortOption) => {
      if (drilldownSortOption === nextOption) return;
      setDrilldownSortOption(nextOption);
      requestAnimationFrame(() => {
        drilldownScrollToTopRef.current?.();
      });
    },
    [drilldownSortOption],
  );
  const handleSelectSubcategory = useCallback(
    (row: DrilldownSubcategoryRow) => {
      if (!onOpenSubcategoryDrilldown) return;
      void triggerHaptic('selection');
      onOpenSubcategoryDrilldown({
        ...payload,
        label: `${categoryIconToEmoji(row.emoji)} ${row.label}`.trim(),
        transactionIds: row.transactions.map((transaction) => transaction.id),
        showSubcategorySelection: false,
      });
    },
    [onOpenSubcategoryDrilldown, payload],
  );
  const renderSubcategoryValue = useCallback(
    (value: number) => {
      const label =
        settings.displayMode === 'time'
          ? formatHours(Math.abs(value))
          : formatAmount(value, settings, { showSign: false });
      return renderDisplayValueNode(label, {
        variant: 'label',
        textClassName: 'text-foreground',
        iconColor: themeColors.text,
      });
    },
    [renderDisplayValueNode, settings, themeColors.text],
  );
  const handleTypeFilterChange = useCallback(
    (type: DrilldownTransactionFilter) => {
      if (drilldownTypeFilter === type) return;
      void triggerHaptic('selection');
      setDrilldownTypeFilter(type);
    },
    [drilldownTypeFilter],
  );

  const clearSelection = useCallback(() => {
    setSelectedTransactionIds([]);
  }, []);
  const handleInterceptBack = useCallback(() => {
    if (showBulkUpdate) {
      setShowBulkUpdate(false);
      return;
    }
    if (isSelectionMode) {
      clearSelection();
      return;
    }
    onBack();
  }, [clearSelection, isSelectionMode, onBack, showBulkUpdate]);
  const handleHeaderBack = useCallback(() => {
    handleInterceptBack();
  }, [handleInterceptBack]);
  const shouldInterceptRouteBack = showBulkUpdate || isSelectionMode;
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !shouldInterceptRouteBack });
    return () => {
      navigation.setOptions({ gestureEnabled: true });
    };
  }, [navigation, shouldInterceptRouteBack]);
  useEffect(() => {
    if (!shouldInterceptRouteBack) return;
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleInterceptBack();
      return true;
    });
    return () => {
      backSubscription.remove();
    };
  }, [handleInterceptBack, shouldInterceptRouteBack]);
  const toggleSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) => {
      const index = previous.indexOf(transactionId);
      if (index === -1) return [...previous, transactionId];
      if (previous.length === 1) return [];
      const next = [...previous];
      next.splice(index, 1);
      return next;
    });
  }, []);
  const toggleDaySelection = useCallback((dayTransactionIds: string[]) => {
    if (dayTransactionIds.length === 0) return;
    void triggerHaptic('selection');
    setSelectedTransactionIds((previous) => {
      const previousSet = new Set(previous);
      const allSelected = dayTransactionIds.every((id) => previousSet.has(id));
      if (allSelected) {
        const dayIdSet = new Set(dayTransactionIds);
        return previous.filter((id) => !dayIdSet.has(id));
      }
      const next = [...previous];
      for (const id of dayTransactionIds) {
        if (!previousSet.has(id)) next.push(id);
      }
      return next;
    });
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      onOpenTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleSelection],
  );
  const handleTransactionSplitBadgePress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      if (onOpenTransactionSplitBadge) {
        onOpenTransactionSplitBadge(transaction);
        return;
      }
      onOpenTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, onOpenTransactionSplitBadge, toggleSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleSelection],
  );

  const selectionCategoryTypes = useMemo<CategoryType[]>(() => {
    let hasIncome = false;
    let hasExpense = false;
    selectedTransactionIds.forEach((id) => {
      const transaction = payloadTransactionById.get(id);
      if (transaction?.type === 'income') hasIncome = true;
      else if (transaction?.type === 'expense') hasExpense = true;
    });
    const types: CategoryType[] = [];
    if (hasIncome) types.push('income');
    if (hasExpense) types.push('expense');
    return types;
  }, [payloadTransactionById, selectedTransactionIds]);
  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(
    (changes: BulkTransactionChanges) => {
      if (selectedTransactionIds.length === 0) return;
      const updates = buildBulkUpdateInputs(
        selectedTransactionIds,
        changes,
        (id) => payloadTransactionById.get(id)?.type,
      );
      if (updates.length > 0) {
        updateTransactionsBulk(updates);
        void triggerHaptic('success');
      }
      setShowBulkUpdate(false);
      setSelectedTransactionIds([]);
    },
    [selectedTransactionIds, payloadTransactionById, updateTransactionsBulk],
  );
  const handleDeleteSelectedTransactions = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToDelete = [...selectedTransactionIds];
    if (onRemoveFromAlbum) {
      Alert.alert(
        I18n.t('albums.remove_from_album'),
        I18n.t('albums.remove_selected_body', { count: idsToDelete.length }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.remove'),
            onPress: () => {
              onRemoveFromAlbum(idsToDelete);
              setShowBulkUpdate(false);
              setSelectedTransactionIds([]);
            },
          },
        ],
      );
      return;
    }
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
  }, [deleteTransactionsBulk, onRemoveFromAlbum, selectedTransactionIds]);

  useEffect(() => {
    if (!isSelectionMode) {
      setShowBulkUpdate(false);
      return;
    }
  }, [isSelectionMode]);

  useEffect(() => {
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
    setActiveBreakdownSlice(null, false);
  }, [payload.categoryRootId, payload.label, setActiveBreakdownSlice]);

  useEffect(() => {
    if (!shouldShowSubcategoryList) return;
    if (selectedTransactionIds.length > 0) {
      setSelectedTransactionIds([]);
    }
    if (showBulkUpdate) {
      setShowBulkUpdate(false);
    }
  }, [selectedTransactionIds.length, shouldShowSubcategoryList, showBulkUpdate]);

  useEffect(() => {
    if (selectedTransactionIds.length === 0) return;
    const availableIds = new Set(displayedTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [displayedTransactions, selectedTransactionIds.length]);

  const shouldShowTransactions = !shouldShowSubcategoryList;
  const shouldShowSortControls = shouldShowTransactions;
  const shouldShowTypeFilter = payload.showTypeFilter && shouldShowTransactions;
  const headerTitle = payload.label || I18n.t('insights.category_fallback');
  const totalRowAccentColor =
    rootCategory?.type === 'income' ? BREAKDOWN_TINT_INCOME : BREAKDOWN_TINT_EXPENSE;

  const pageWidth = Math.max(1, width);
  const effectiveChartBasis = isTablet ? Math.min(width, TABLET_CONTENT_MAX_WIDTH) : width;
  const chartWidth = Math.max(260, effectiveChartBasis - 76);

  const pagePieData = useMemo(() => {
    return subcategoryRows.map((row, i) => {
      const absAmount = Math.abs(row.totalValue);
      return {
        id: row.id,
        name: row.label,
        amount: absAmount,
        emoji: row.emoji,
        pct: row.sharePct,
        color: INSIGHTS_CHART_COLORS[i % INSIGHTS_CHART_COLORS.length],
        transactions: row.transactions,
        count: row.count,
        totalValue: row.totalValue,
      };
    });
  }, [subcategoryRows]);

  const pageTotalAmount = useMemo(
    () => pagePieData.reduce((sum, item) => sum + item.amount, 0),
    [pagePieData],
  );
  const activeBreakdownSlice = activeBreakdownSliceId
    ? (pagePieData.find((item) => item.id === activeBreakdownSliceId) ?? null)
    : null;

  const pieLayoutBleed = Math.max(24, spacing.screenHorizontal * 2);
  const pieSideMargin = 14;
  const pieLayoutWidth = Math.max(chartWidth, pageWidth + pieLayoutBleed - pieSideMargin * 2);
  const pieLabelWidth = Math.max(
    BREAKDOWN_PIE_LABEL_MIN_WIDTH,
    Math.min(BREAKDOWN_PIE_LABEL_MAX_WIDTH, Math.floor(pieLayoutWidth * 0.25)),
  );
  const pieLabelMaxChars = Math.max(7, Math.min(13, Math.floor((pieLabelWidth - 14) / 5)));
  const pieExtraRadius =
    pieLabelWidth + BREAKDOWN_PIE_LABEL_LINE_LENGTH + BREAKDOWN_PIE_LABEL_MARGIN + 6;
  const pieRadius = Math.max(
    BREAKDOWN_PIE_MIN_RADIUS,
    Math.min(BREAKDOWN_PIE_MAX_RADIUS, Math.floor((pieLayoutWidth - pieExtraRadius * 2) / 2)),
  );
  const pieStageWidth = (pieRadius + pieExtraRadius) * 2;
  const pieStageHeight = Math.max(
    pieRadius * 2 + 24,
    pieStageWidth - Math.min(140, Math.max(92, pieExtraRadius * 1.2)),
  );
  const pieStageVerticalInset = Math.max(0, Math.floor((pieStageWidth - pieStageHeight) / 2));

  // Custom collision-avoiding label overlay (shared with the insights breakdown
  // and album charts), instead of gifted-charts' built-in external labels.
  const pieLabelStyleById = new Map<
    string,
    {
      categoryLabel: string;
      labelStroke: string;
      labelTextColor: string;
      lineThickness: number;
      emoji: string;
      pct: number;
      dimmed: boolean;
    }
  >();
  const interactivePieData = pagePieData.map((item) => {
    const isSelected = activeBreakdownSlice?.id === item.id;
    const hasSelection = activeBreakdownSlice !== null;
    const categoryLabel =
      item.name.length <= pieLabelMaxChars
        ? item.name
        : `${item.name.slice(0, Math.max(1, pieLabelMaxChars - 3)).trimEnd()}...`;
    const sliceColor = hasSelection && !isSelected ? withColorAlpha(item.color, 0.28) : item.color;
    pieLabelStyleById.set(item.id, {
      categoryLabel,
      labelStroke: isSelected
        ? withColorAlpha(item.color, 0.72)
        : hasSelection
          ? withColorAlpha(item.color, 0.18)
          : withColorAlpha(item.color, isDark ? 0.46 : 0.28),
      labelTextColor:
        hasSelection && !isSelected ? withColorAlpha(themeColors.text, 0.62) : themeColors.text,
      lineThickness: isSelected ? 1.7 : 1.2,
      emoji: item.emoji,
      pct: item.pct,
      dimmed: hasSelection && !isSelected,
    });
    return { ...item, value: item.amount, color: sliceColor };
  });
  const pieLabels = layoutBreakdownPieLabels(pagePieData, {
    cx: pieStageWidth / 2,
    cy: pieStageWidth / 2 - pieStageVerticalInset,
    radius: pieRadius,
    elbowLength: BREAKDOWN_PIE_LABEL_LINE_LENGTH,
    tailLength: BREAKDOWN_PIE_LABEL_TAIL_LENGTH,
    labelWidth: pieLabelWidth,
    labelHeight: BREAKDOWN_PIE_LABEL_HEIGHT,
    labelGap: BREAKDOWN_PIE_LABEL_HEIGHT + BREAKDOWN_PIE_LABEL_MARGIN,
    stageHeight: pieStageHeight,
    totalAmount: pageTotalAmount,
  });

  return (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader className="px-0 pt-5 pb-3" onBack={handleHeaderBack} title={headerTitle} />
      </View>

      {isSelectionMode ? (
        <TransactionSelectionToolbar
          selectedCount={selectedTransactionCount}
          totalNode={renderDisplayValueNode(selectedTransactionTotalLabel, {
            variant: 'label',
            textClassName: selectedTransactionTotalToneClass,
            iconColor: themeColors.text,
          })}
          onCancel={clearSelection}
          onEdit={handleOpenBulkUpdate}
          onDelete={handleDeleteSelectedTransactions}
        />
      ) : null}

      {shouldShowSortControls ? (
        <View className="px-5 pb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortControlsContent}
          >
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.filters.sort')}
            </Text>
            <FilterPill
              label={I18n.t('transactions.sort.newest')}
              active={drilldownSortOption === 'default'}
              onPress={() => handleSortOptionChange('default')}
            />
            <FilterPill
              label={I18n.t('transactions.sort.high')}
              active={drilldownSortOption === 'largest_value'}
              onPress={() => handleSortOptionChange('largest_value')}
            />
          </ScrollView>
        </View>
      ) : null}

      {shouldShowSubcategoryList ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.subcategoryScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1">
            <View className="items-center px-1">
              <View className="w-full items-center gap-0.5 py-1">
                {renderDisplayValueNode(
                  settings.displayMode === 'time'
                    ? formatHours(pageTotalAmount)
                    : formatAmount(pageTotalAmount, settings, { showSign: false }),
                  {
                    variant: 'heading',
                    textClassName:
                      'text-[24px] leading-[38px] font-black tracking-tight text-center',
                    iconColor: totalRowAccentColor,
                    iconSize: 22,
                    style: { color: totalRowAccentColor },
                  },
                )}
                <View
                  style={{
                    width: 36,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: withColorAlpha(totalRowAccentColor, isDark ? 0.38 : 0.28),
                    marginTop: 1,
                  }}
                />
              </View>

              <View className="mt-2 w-full items-center overflow-visible">
                {pagePieData.length > 0 && pageTotalAmount > 0 ? (
                  <View className="w-full items-center" style={styles.chartSizeCenter}>
                    <View
                      style={buildSizeStyle(pieStageWidth, pieStageHeight)}
                      onStartShouldSetResponder={() => true}
                      onResponderRelease={(event) => {
                        const { locationX, locationY } = event.nativeEvent;
                        const nextId = pieSliceIdFromTouch(
                          {
                            x: locationX - pieExtraRadius,
                            y: locationY + pieStageVerticalInset - pieExtraRadius,
                          },
                          pagePieData,
                          pageTotalAmount,
                          pieRadius,
                        );
                        if (!nextId) {
                          setActiveBreakdownSlice(null, false);
                          return;
                        }
                        if (activeBreakdownSliceId === nextId) return;
                        setActiveBreakdownSlice(nextId, true);
                      }}
                    >
                      <View pointerEvents="none" style={{ marginTop: -pieStageVerticalInset }}>
                        <PieChart
                          data={interactivePieData}
                          radius={pieRadius}
                          extraRadius={pieExtraRadius}
                        />
                      </View>
                      <Svg
                        pointerEvents="none"
                        width={pieStageWidth}
                        height={pieStageHeight}
                        style={StyleSheet.absoluteFill}
                      >
                        {pieLabels.map((label) => {
                          const labelStyle = pieLabelStyleById.get(label.id);
                          if (!labelStyle) return null;
                          return (
                            <G key={label.id} opacity={labelStyle.dimmed ? 0.72 : 1}>
                              <Polyline
                                points={`${label.anchorX},${label.anchorY} ${label.outerX},${label.outerY} ${label.innerX},${label.labelY}`}
                                fill="none"
                                stroke={labelStyle.labelStroke}
                                strokeWidth={labelStyle.lineThickness}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                              <G x={label.boxLeft} y={label.labelY}>
                                <SvgText
                                  x={pieLabelWidth / 2}
                                  y={-4}
                                  textAnchor="middle"
                                  alignmentBaseline="middle"
                                  fontSize={9.2}
                                  fontFamily={FONT.bold}
                                  fontWeight="700"
                                  fill={labelStyle.labelTextColor}
                                >
                                  {`${categoryIconToEmoji(labelStyle.emoji)} ${labelStyle.categoryLabel}`.trim()}
                                </SvgText>
                                <SvgText
                                  x={pieLabelWidth / 2}
                                  y={8}
                                  textAnchor="middle"
                                  alignmentBaseline="middle"
                                  fontSize={8}
                                  fontFamily={FONT.semibold}
                                  fontWeight="600"
                                  fill={withColorAlpha(
                                    labelStyle.labelTextColor,
                                    isDark ? 0.75 : 0.55,
                                  )}
                                >
                                  {`${labelStyle.pct.toFixed(1)}%`}
                                </SvgText>
                              </G>
                            </G>
                          );
                        })}
                      </Svg>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="gap-1.5">
              {pagePieData.map((item) => {
                const isSelected = activeBreakdownSliceId === item.id;
                const hasSelection = activeBreakdownSliceId !== null;
                const pctRatio = Math.min(1, Math.max(0, item.pct / 100));
                const rowBackgroundColor = isSelected
                  ? withColorAlpha(item.color, 0.28)
                  : hasSelection
                    ? withColorAlpha(item.color, 0.04)
                    : withColorAlpha(item.color, 0.07 + pctRatio * 0.22);
                const rowBorderColor = isSelected
                  ? withColorAlpha(item.color, 0.7)
                  : hasSelection
                    ? withColorAlpha(item.color, 0.1)
                    : withColorAlpha(item.color, 0.2 + pctRatio * 0.32);
                const percentBadgeColor = isSelected
                  ? withColorAlpha(item.color, 0.38)
                  : withColorAlpha(item.color, 0.24);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setActiveBreakdownSlice(null, false);
                      handleSelectSubcategory({
                        id: item.id,
                        label: item.name,
                        emoji: item.emoji,
                        totalValue: item.totalValue,
                        sharePct: item.pct,
                        count: item.count,
                        transactions: item.transactions,
                      });
                    }}
                    disabled={!onOpenSubcategoryDrilldown}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.emoji} ${item.name}`}
                    accessibilityState={{ disabled: !onOpenSubcategoryDrilldown }}
                    className="rounded-xl px-2.5 py-1.5 active:opacity-85 border"
                    style={[
                      { backgroundColor: rowBackgroundColor, borderColor: rowBorderColor },
                      isSelected && { borderWidth: 2 },
                      hasSelection && !isSelected && { opacity: 0.5 },
                    ]}
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="flex-1 flex-row items-center gap-1.5 pr-2">
                        <CategoryEmoji icon={item.emoji} size={16} />
                        <Text variant="caption" className="flex-1" numberOfLines={2}>
                          {item.name}
                        </Text>
                      </View>
                      <View className="items-end">
                        <View className="flex-row items-center gap-1.5">
                          {renderSubcategoryValue(item.totalValue)}
                          <View
                            className="rounded-full px-1.5 py-0.5"
                            style={[
                              styles.breakdownPercentBadge,
                              { backgroundColor: percentBadgeColor },
                            ]}
                          >
                            <Text variant="label" className="text-foreground">
                              {item.pct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                        <Text variant="label" tone="muted" className="mt-0.5">
                          {item.count} {I18n.t('calendar.transactions')}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : null}

      {shouldShowTypeFilter ? (
        <View className="px-5 pb-2">
          <View className="border-b border-border/35">
            <View className="flex-row items-center">
              <Pressable
                onPress={() => handleTypeFilterChange('income')}
                accessibilityRole="tab"
                accessibilityLabel={I18n.t('calendar.income')}
                accessibilityState={{ selected: drilldownTypeFilter === 'income' }}
                className="flex-1 items-center py-2.5 active:opacity-85"
              >
                <Text
                  variant="bodyStrong"
                  className={cn(
                    drilldownTypeFilter === 'income' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {I18n.t('calendar.income')}
                </Text>
                <View
                  className={cn(
                    'mt-1 h-0.5 w-10 rounded-full',
                    drilldownTypeFilter === 'income' ? 'bg-success' : 'bg-transparent',
                  )}
                />
              </Pressable>
              <Pressable
                onPress={() => handleTypeFilterChange('expense')}
                accessibilityRole="tab"
                accessibilityLabel={I18n.t('calendar.expense')}
                accessibilityState={{ selected: drilldownTypeFilter === 'expense' }}
                className="flex-1 items-center py-2.5 active:opacity-85"
              >
                <Text
                  variant="bodyStrong"
                  className={cn(
                    drilldownTypeFilter === 'expense' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {I18n.t('calendar.expense')}
                </Text>
                <View
                  className={cn(
                    'mt-1 h-0.5 w-10 rounded-full',
                    drilldownTypeFilter === 'expense' ? 'bg-destructive' : 'bg-transparent',
                  )}
                />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {shouldShowTransactions ? (
        <ActivityTransactionList
          transactions={displayedTransactions}
          displaySettings={transactionDisplaySettings}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          onTransactionPress={handleTransactionPress}
          onTransactionLongPress={handleTransactionLongPress}
          onTransactionSplitBadgePress={handleTransactionSplitBadgePress}
          selectedTransactionIds={selectedTransactionIds}
          selectionMode={isSelectionMode}
          onToggleDaySelection={toggleDaySelection}
          emptyTitle={I18n.t('insights.empty_category.title')}
          emptyMessage={I18n.t('insights.empty_category.message')}
          contentPaddingBottom={30}
          disableItemAnimations
          disableScrollBounce
          compactItems
          groupByDate={shouldGroupByDate}
          scrollToTopRef={drilldownScrollToTopRef}
        />
      ) : null}
      <BulkEditTransactionsSheet
        visible={showBulkUpdate}
        selectedCount={selectedTransactionCount}
        categoryTypes={selectionCategoryTypes}
        onClose={handleCloseBulkUpdate}
        onApply={handleApplyBulkUpdate}
      />
    </SettingsPageLayout>
  );
}

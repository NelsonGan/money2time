import { Pencil, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Input,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList } from '~/features/transactions/components';
import { DatePanel } from '~/features/transactions/components/editor';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import { triggerHaptic } from '~/services/haptics';
import type { Category, TransactionType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { formatAmount, formatDateInput, formatHours } from '~/utils/formatters';

type DrilldownSortOption = 'default' | 'largest_value';
type DrilldownTransactionFilter = 'income' | 'expense';
type EditableTransactionType = Exclude<TransactionType, 'balance_adjustment'>;

const DRILLDOWN_BULK_SCROLL_CONTENT_STYLE = {
  padding: spacing.screenHorizontal,
  paddingBottom: spacing.listBottom + spacing.xs,
  gap: spacing.sm,
} as const;
const DRILLDOWN_BULK_TYPE_PILLS_STYLE = { gap: spacing.xs } as const;
const DRILLDOWN_DIRECT_PARENT_ROW_ID = '__direct-parent__';
const EMPTY_DRILLDOWN_TRANSACTIONS: TransactionWithRelations[] = [];

const styles = StyleSheet.create({
  bulkDatePanelContainer: {
    height: 360,
  },
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  selectionOverlay: {
    position: 'absolute',
    top: spacing.xs,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  sortControlsContent: {
    gap: spacing.xs,
    alignItems: 'center',
    paddingRight: spacing.xs,
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
}

interface InsightsDrilldownScreenProps {
  payload: InsightsDrilldownPayload;
  onBack: () => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenSubcategoryDrilldown?: (payload: InsightsDrilldownPayload) => void;
}

export function InsightsDrilldownScreen({
  payload,
  onBack,
  onOpenTransaction,
  onOpenSubcategoryDrilldown,
}: InsightsDrilldownScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = useThemeColors();
  const {
    categories,
    transactions,
    settings,
    updateTransactionsBulk,
    deleteTransactionsBulk,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
  } = useApp();
  const [drilldownTypeFilter, setDrilldownTypeFilter] =
    useState<DrilldownTransactionFilter>('expense');
  const [drilldownSortOption, setDrilldownSortOption] = useState<DrilldownSortOption>('default');
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkType, setBulkType] = useState<EditableTransactionType | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const drilldownScrollToTopRef = useRef<(() => void) | null>(null);
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
      hourRounding: settings.hourRounding,
    }),
    [settings.currencySymbol, settings.displayMode, settings.hourRounding],
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
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched || bulkType !== null;
  const drilldownBulkTypeOptions = useMemo(
    () =>
      [
        { value: 'expense', label: I18n.t('transactions.filters.spent') },
        { value: 'income', label: I18n.t('transactions.filters.earned') },
        { value: 'transfer', label: I18n.t('transactions.filters.moved') },
      ] satisfies Array<{ value: EditableTransactionType; label: string }>,
    [],
  );

  const sortTransactions = useCallback(
    (items: TransactionWithRelations[]) => {
      if (drilldownSortOption !== 'largest_value' || items.length < 2) return items;
      const valueById = new Map<string, number>();
      items.forEach((item) => {
        valueById.set(
          item.id,
          settings.displayMode === 'time' ? getDisplayValueForTransaction(item) : item.amount,
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
  const { resolvedTransactions, payloadTransactionById } = useMemo(() => {
    const requestedTransactionIds = new Set(payload.transactionIds);
    const nextTransactionById = new Map<string, TransactionWithRelations>();
    transactions.forEach((transaction) => {
      if (!requestedTransactionIds.has(transaction.id)) return;
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
  }, [payload.transactionIds, sortTransactions, transactions]);
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
          : transaction.amount;
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
          : transaction.amount;
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
  const selectedTransactionTotalToneClass =
    selectedTransactionTotal > 0
      ? 'text-success'
      : selectedTransactionTotal < 0
        ? 'text-destructive'
        : 'text-muted-foreground';
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
        label: `${row.emoji} ${row.label}`,
        transactionIds: row.transactions.map((transaction) => transaction.id),
        showSubcategorySelection: false,
      });
    },
    [onOpenSubcategoryDrilldown, payload],
  );
  const renderSubcategoryValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? formatHours(Math.abs(value))
        : formatAmount(value, settings, { showSign: false }),
    [settings],
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

  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setBulkDate(formatDateInput(new Date()));
    setBulkDateTouched(false);
    setBulkType(null);
    setBulkNote('');
    setBulkNoteTouched(false);
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(() => {
    if (selectedTransactionIds.length === 0 || !hasBulkChanges) return;

    const baseUpdates: { date?: string; note?: string | null } = {};
    if (bulkDateTouched) baseUpdates.date = bulkDate;
    if (bulkNoteTouched) {
      const normalizedNote = bulkNote.trim();
      baseUpdates.note = normalizedNote.length > 0 ? normalizedNote : null;
    }

    const updatesById: Array<{
      id: string;
      input: {
        date?: string;
        note?: string | null;
        type?: EditableTransactionType;
        accountId?: string | null;
        categoryId?: string | null;
        fromAccountId?: string | null;
        toAccountId?: string | null;
      };
    }> = [];

    selectedTransactionIds.forEach((transactionId) => {
      const existing = payloadTransactionById.get(transactionId);
      const updates: {
        date?: string;
        note?: string | null;
        type?: EditableTransactionType;
        accountId?: string | null;
        categoryId?: string | null;
        fromAccountId?: string | null;
        toAccountId?: string | null;
      } = { ...baseUpdates };

      if (bulkType === 'transfer') {
        if (existing?.type === 'income' || existing?.type === 'expense') {
          if (!existing.accountId) return;
          updates.type = 'transfer';
          updates.accountId = null;
          updates.categoryId = null;
          updates.fromAccountId = existing.accountId;
          updates.toAccountId = null;
        } else {
          updates.type = 'transfer';
          updates.accountId = null;
          updates.categoryId = null;
        }
      } else if (bulkType) {
        updates.type = bulkType;
        updates.categoryId = null;
        updates.fromAccountId = null;
        updates.toAccountId = null;
      }

      if (Object.keys(updates).length === 0) return;
      updatesById.push({ id: transactionId, input: updates });
    });

    if (updatesById.length === 0) return;

    updateTransactionsBulk(updatesById);

    setShowBulkUpdate(false);
    setSelectedTransactionIds([]);
  }, [
    bulkDate,
    bulkDateTouched,
    bulkNote,
    bulkNoteTouched,
    bulkType,
    hasBulkChanges,
    selectedTransactionIds,
    payloadTransactionById,
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

  useEffect(() => {
    if (!isSelectionMode) {
      setShowBulkUpdate(false);
      return;
    }
  }, [isSelectionMode]);

  useEffect(() => {
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
  }, [payload.categoryRootId, payload.label]);

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
  const rootAccentColor =
    typeof payload.categoryRootColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(payload.categoryRootColor)
      ? payload.categoryRootColor
      : null;

  return (
    <SettingsPageLayout>
      {showBulkUpdate ? (
        <>
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

          <ScrollView
            className="flex-1"
            contentContainerStyle={DRILLDOWN_BULK_SCROLL_CONTENT_STYLE}
          >
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.filters.type')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={DRILLDOWN_BULK_TYPE_PILLS_STYLE}
              >
                {drilldownBulkTypeOptions.map((option) => (
                  <FilterPill
                    key={option.value}
                    label={option.label}
                    active={bulkType === option.value}
                    onPress={() =>
                      setBulkType((current) => (current === option.value ? null : option.value))
                    }
                  />
                ))}
              </ScrollView>
            </View>

            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.editor.date')}
              </Text>
              <View
                className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                style={styles.bulkDatePanelContainer}
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
        </>
      ) : (
        <>
          <View style={styles.headerContainer}>
            <SettingsHeader
              className="px-0 pt-5 pb-3"
              onBack={handleHeaderBack}
              title={headerTitle}
            />
          </View>

          {isSelectionMode ? (
            <View pointerEvents="box-none" style={styles.selectionOverlay}>
              <View style={styles.headerContainer}>
                <View className="rounded-[26px] bg-card border border-border/40 px-3 py-2.5 flex-row items-center justify-between gap-2">
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      clearSelection();
                    }}
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

                  <View className="flex-row items-center gap-2">
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
              </View>
            </View>
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
            <View className="px-5 pb-2">
              <Text variant="caption" tone="muted">
                {I18n.t('categories.subcategories')}
              </Text>
              <View className="mt-1.5 gap-1.5">
                {subcategoryRows.map((row) => {
                  const pctRatio = Math.min(1, Math.max(0, row.sharePct / 100));
                  const rowBackgroundColor = rootAccentColor
                    ? withColorAlpha(rootAccentColor, 0.07 + pctRatio * 0.22)
                    : null;
                  const rowBorderColor = rootAccentColor
                    ? withColorAlpha(rootAccentColor, 0.2 + pctRatio * 0.32)
                    : null;
                  const percentBadgeColor = rootAccentColor
                    ? withColorAlpha(rootAccentColor, 0.24)
                    : null;
                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => handleSelectSubcategory(row)}
                      disabled={isSelectionMode || !onOpenSubcategoryDrilldown}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.emoji} ${row.label}`}
                      accessibilityState={{
                        disabled: isSelectionMode || !onOpenSubcategoryDrilldown,
                      }}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 active:opacity-85',
                        'border-border/35 bg-card/90',
                      )}
                      style={
                        rowBackgroundColor && rowBorderColor
                          ? { backgroundColor: rowBackgroundColor, borderColor: rowBorderColor }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text variant="caption" className="flex-1 pr-2" numberOfLines={2}>
                          {row.emoji} {row.label}
                        </Text>
                        <View className="items-end">
                          <View className="flex-row items-center gap-1.5">
                            <Text variant="label" className="text-foreground">
                              {renderSubcategoryValue(row.totalValue)}
                            </Text>
                            <View
                              className="rounded-full px-1.5 py-0.5"
                              style={
                                percentBadgeColor
                                  ? { backgroundColor: percentBadgeColor }
                                  : undefined
                              }
                            >
                              <Text variant="label" className="text-foreground">
                                {row.sharePct.toFixed(1)}%
                              </Text>
                            </View>
                          </View>
                          <Text variant="label" tone="muted" className="mt-0.5">
                            {row.count} {I18n.t('insights.calendar.transactions')}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {shouldShowTypeFilter ? (
            <View className="px-5 pb-2">
              <View className="border-b border-border/35">
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => handleTypeFilterChange('income')}
                    accessibilityRole="tab"
                    accessibilityLabel={I18n.t('insights.calendar.income')}
                    accessibilityState={{ selected: drilldownTypeFilter === 'income' }}
                    className="flex-1 items-center py-2.5 active:opacity-85"
                  >
                    <Text
                      variant="bodyStrong"
                      className={cn(
                        drilldownTypeFilter === 'income'
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {I18n.t('insights.calendar.income')}
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
                    accessibilityLabel={I18n.t('insights.calendar.expense')}
                    accessibilityState={{ selected: drilldownTypeFilter === 'expense' }}
                    className="flex-1 items-center py-2.5 active:opacity-85"
                  >
                    <Text
                      variant="bodyStrong"
                      className={cn(
                        drilldownTypeFilter === 'expense'
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {I18n.t('insights.calendar.expense')}
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
              selectedTransactionIds={selectedTransactionIds}
              selectionMode={isSelectionMode}
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
        </>
      )}
    </SettingsPageLayout>
  );
}

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, type GestureResponderEvent, Pressable, ScrollView, View } from 'react-native';

import {
  Input,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList } from '~/features/transactions/components';
import { DatePanel } from '~/features/transactions/components/editor';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { formatAmount, formatDateInput, formatHours } from '~/utils/formatters';

type DrilldownSortOption = 'default' | 'largest_value';
type DrilldownTransactionFilter = 'income' | 'expense';
type EditableTransactionType = Exclude<TransactionType, 'balance_adjustment'>;

const DRILLDOWN_BULK_SCROLL_CONTENT_STYLE = { padding: 20, paddingBottom: 34, gap: 14 } as const;
const DRILLDOWN_BULK_TYPE_PILLS_STYLE = { gap: 8 } as const;
const DRILLDOWN_DIRECT_PARENT_ROW_ID = '__direct-parent__';
const EMPTY_DRILLDOWN_TRANSACTIONS: TransactionWithRelations[] = [];
const DRILLDOWN_BULK_TYPE_OPTIONS: { value: EditableTransactionType; label: string }[] = [
  { value: 'expense', label: I18n.t('transactions.filters.spent') },
  { value: 'income', label: I18n.t('transactions.filters.earned') },
  { value: 'transfer', label: I18n.t('transactions.filters.moved') },
];
const TYPE_FILTER_TAP_MAX_DRIFT = 8;

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
  const navigation = useNavigation();
  const {
    categories,
    transactions,
    settings,
    updateTransaction,
    deleteTransaction,
    getDisplayValueForTransaction,
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
  const typeFilterTouchRef = useRef<{
    type: DrilldownTransactionFilter;
    pageX: number;
    pageY: number;
  } | null>(null);

  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [
    categories,
  ]);
  const rootCategoryId = payload.categoryRootId ?? null;
  const rootCategory = useMemo(
    () => (rootCategoryId ? (categoryById.get(rootCategoryId) ?? null) : null),
    [categoryById, rootCategoryId],
  );
  const rootChildCategories = useMemo(
    () =>
      rootCategoryId
        ? categories
            .filter((category) => category.parentId === rootCategoryId)
            .sort((a, b) => {
              const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
              if (orderDelta !== 0) return orderDelta;
              return a.name.localeCompare(b.name);
            })
        : [],
    [categories, rootCategoryId],
  );
  const rootChildCategoryIdSet = useMemo(
    () => new Set(rootChildCategories.map((category) => category.id)),
    [rootChildCategories],
  );
  const hasRootChildCategories = rootChildCategories.length > 0;
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched || bulkType !== null;

  const sortTransactions = useCallback(
    (items: TransactionWithRelations[]) => {
      if (drilldownSortOption !== 'largest_value') return items;
      const sorted = [...items];
      sorted.sort((a, b) => {
        const aValue =
          settings.displayMode === 'time' ? getDisplayValueForTransaction(a) : a.amount;
        const bValue =
          settings.displayMode === 'time' ? getDisplayValueForTransaction(b) : b.amount;
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
  const resolvedTransactions = useMemo(
    () =>
      sortTransactions(
        payload.transactionIds
          .map((id) => transactionById.get(id))
          .filter((transaction): transaction is TransactionWithRelations => Boolean(transaction)),
      ),
    [payload.transactionIds, sortTransactions, transactionById],
  );
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
        settings.displayMode === 'time' ? getDisplayValueForTransaction(transaction) : transaction.amount;
      const categoryId = transaction.categoryId ?? null;
      const transactionCategory = transaction.categoryId
        ? categoryById.get(transaction.categoryId) ?? null
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
        addRow(
          DRILLDOWN_DIRECT_PARENT_ROW_ID,
          parentLabel,
          parentEmoji,
          transaction,
          value,
        );
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
  const incomeTransactions = useMemo(
    () => sortTransactions(scopedTransactions.filter((transaction) => transaction.type === 'income')),
    [scopedTransactions, sortTransactions],
  );
  const expenseTransactions = useMemo(
    () => sortTransactions(scopedTransactions.filter((transaction) => transaction.type === 'expense')),
    [scopedTransactions, sortTransactions],
  );
  const displayedTransactions =
    payload.showTypeFilter && drilldownTypeFilter === 'income'
      ? incomeTransactions
      : payload.showTypeFilter
        ? expenseTransactions
        : scopedTransactions;
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
  const handleTypeFilterPressIn = useCallback(
    (type: DrilldownTransactionFilter, event: GestureResponderEvent) => {
      typeFilterTouchRef.current = {
        type,
        pageX: event.nativeEvent.pageX,
        pageY: event.nativeEvent.pageY,
      };
    },
    [],
  );
  const handleTypeFilterPressOut = useCallback(
    (type: DrilldownTransactionFilter, event: GestureResponderEvent) => {
      const touchStart = typeFilterTouchRef.current;
      typeFilterTouchRef.current = null;
      if (!touchStart || touchStart.type !== type) return;

      const movedX = Math.abs(event.nativeEvent.pageX - touchStart.pageX);
      const movedY = Math.abs(event.nativeEvent.pageY - touchStart.pageY);
      if (movedX > TYPE_FILTER_TAP_MAX_DRIFT || movedY > TYPE_FILTER_TAP_MAX_DRIFT) return;
      if (drilldownTypeFilter === type) return;

      void triggerHaptic('selection');
      setDrilldownTypeFilter(type);
    },
    [drilldownTypeFilter],
  );

  const clearSelection = useCallback(() => {
    void triggerHaptic('selection');
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
    const navigationWithOptions = navigation as {
      setOptions?: (options: { gestureEnabled?: boolean }) => void;
    };
    navigationWithOptions.setOptions?.({ gestureEnabled: !shouldInterceptRouteBack });
    return () => {
      navigationWithOptions.setOptions?.({ gestureEnabled: true });
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
    setSelectedTransactionIds((previous) =>
      previous.includes(transactionId)
        ? previous.filter((id) => id !== transactionId)
        : [...previous, transactionId],
    );
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

    let appliedCount = 0;

    selectedTransactionIds.forEach((transactionId) => {
      const existing = transactionById.get(transactionId);
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
      updateTransaction(transactionId, updates);
      appliedCount += 1;
    });

    if (appliedCount === 0) return;

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
    transactionById,
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
                {DRILLDOWN_BULK_TYPE_OPTIONS.map((option) => (
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
        </>
      ) : (
        <>
          <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
            {isSelectionMode ? (
              <View className="px-0 pt-5 pb-3">
                <View className="mb-3 rounded-[26px] bg-card border border-border/40 px-3 py-2.5 flex-row items-center justify-between gap-2">
                  <Pressable
                    onPress={clearSelection}
                    className="rounded-full bg-secondary/70 px-3 py-1.5 active:opacity-85"
                  >
                    <Text variant="caption" tone="muted">
                      {I18n.t('common.cancel')}
                    </Text>
                  </Pressable>

                  <Text variant="caption" className="text-foreground">
                    {I18n.t('transactions.selection.selected_count', {
                      count: selectedTransactionCount,
                    })}
                  </Text>

                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={handleOpenBulkUpdate}
                      className="rounded-full bg-primary/12 border border-primary/35 px-3 py-1.5 active:opacity-85"
                    >
                      <Text variant="caption" className="text-primary">
                        {I18n.t('transactions.selection.update')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDeleteSelectedTransactions}
                      className="rounded-full bg-destructive/10 border border-destructive/35 px-3 py-1.5 active:opacity-85"
                    >
                      <Text variant="caption" className="text-destructive">
                        {I18n.t('common.delete')}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Text variant="heading">{headerTitle}</Text>
              </View>
            ) : (
              <SettingsHeader
                className="px-0 pt-5 pb-3"
                onBack={handleHeaderBack}
                title={headerTitle}
              />
            )}
          </View>

          {shouldShowSortControls ? (
            <View className="px-5 pb-2">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, alignItems: 'center', paddingRight: 8 }}
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
                              style={percentBadgeColor ? { backgroundColor: percentBadgeColor } : undefined}
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
              <View className="rounded-2xl border border-border/35 bg-card/90 p-1.5">
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPressIn={(event) => handleTypeFilterPressIn('income', event)}
                    onPressOut={(event) => handleTypeFilterPressOut('income', event)}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2.5 active:opacity-85',
                      drilldownTypeFilter === 'income'
                        ? 'border border-success/35 bg-success/12'
                        : 'border border-transparent bg-transparent',
                    )}
                  >
                    <Text variant="label" className="text-success">
                      {I18n.t('insights.calendar.income')}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {incomeTransactions.length} {I18n.t('insights.calendar.transactions')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPressIn={(event) => handleTypeFilterPressIn('expense', event)}
                    onPressOut={(event) => handleTypeFilterPressOut('expense', event)}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2.5 active:opacity-85',
                      drilldownTypeFilter === 'expense'
                        ? 'border border-destructive/35 bg-destructive/10'
                        : 'border border-transparent bg-transparent',
                    )}
                  >
                    <Text variant="label" className="text-destructive">
                      {I18n.t('insights.calendar.expense')}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {expenseTransactions.length} {I18n.t('insights.calendar.transactions')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {shouldShowTransactions ? (
            <ActivityTransactionList
              transactions={displayedTransactions}
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

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  AllocationCategoryList,
  AllocationOptionRow,
  AllocationStatusBar,
  parseAllocationAmount,
} from '~/features/budget/components/AllocationEditor';
import { CategoryAllocationSheet } from '~/features/budget/components/CategoryAllocationSheet';
import {
  computeAllocationRemaining,
  computeChildAllocationGap,
} from '~/features/budget/lib/budgetMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatMonthYearLabel } from '~/utils/formatters';

interface MonthlyBudgetEditorScreenProps {
  budgetId: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

/**
 * Edits one month's frozen budget in place: total, allocations (including
 * subcategory breakdowns), and the count-unbudgeted option. A local override
 * for that month only; the source template is untouched.
 */
export function MonthlyBudgetEditorScreen({ budgetId, onClose }: MonthlyBudgetEditorScreenProps) {
  const { settings, categories, monthlyBudgets, updateMonthlyBudget } = useApp();
  const themeColors = useThemeColors();

  const budget = useMemo(
    () => monthlyBudgets.find((candidate) => candidate.id === budgetId) ?? null,
    [budgetId, monthlyBudgets],
  );

  const rootExpenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && !category.parentId),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const category of categories) {
      if (category.type !== 'expense' || !category.parentId) continue;
      const list = map.get(category.parentId) ?? [];
      list.push(category);
      map.set(category.parentId, list);
    }
    return map;
  }, [categories]);

  const [total, setTotal] = useState(budget ? String(budget.totalAmount) : '');
  const [countUnbudgeted, setCountUnbudgeted] = useState(budget?.countUnbudgeted ?? true);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of budget?.lines ?? []) {
      if (line.amount > 0) initial[line.categoryId] = String(line.amount);
    }
    return initial;
  });
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parsedTotal = parseAllocationAmount(total);

  const rootAllocations = useMemo(
    () =>
      rootExpenseCategories
        .map((category) => ({
          categoryId: category.id,
          amount: parseAllocationAmount(amounts[category.id] ?? ''),
        }))
        .filter((allocation) => allocation.amount > 0),
    [amounts, rootExpenseCategories],
  );

  const remaining = computeAllocationRemaining(parsedTotal, rootAllocations);

  const childGaps = useMemo(() => {
    const gaps = new Map<string, number>();
    for (const allocation of rootAllocations) {
      const children = childrenByParent.get(allocation.categoryId) ?? [];
      if (children.length === 0) continue;
      const gap = computeChildAllocationGap(
        allocation.amount,
        children.map((child) => ({ amount: parseAllocationAmount(amounts[child.id] ?? '') })),
      );
      if (gap !== 0) gaps.set(allocation.categoryId, gap);
    }
    return gaps;
  }, [amounts, childrenByParent, rootAllocations]);

  const canSave =
    budget != null &&
    parsedTotal > 0 &&
    rootAllocations.length > 0 &&
    remaining === 0 &&
    childGaps.size === 0;

  const handleChangeAmount = useCallback((categoryId: string, next: string) => {
    setAmounts((previous) => ({ ...previous, [categoryId]: next }));
  }, []);

  const handleSave = useCallback(() => {
    if (!canSave || !budget) return;
    void triggerHaptic('success');
    const lines = [...rootAllocations];
    for (const rootAllocation of rootAllocations) {
      for (const child of childrenByParent.get(rootAllocation.categoryId) ?? []) {
        const amount = parseAllocationAmount(amounts[child.id] ?? '');
        if (amount > 0) lines.push({ categoryId: child.id, amount });
      }
    }
    updateMonthlyBudget(budget.id, { totalAmount: parsedTotal, countUnbudgeted, lines });
    onClose();
  }, [
    amounts,
    budget,
    canSave,
    childrenByParent,
    countUnbudgeted,
    onClose,
    parsedTotal,
    rootAllocations,
    updateMonthlyBudget,
  ]);

  if (!budget) return null;

  const monthLabel = formatMonthYearLabel(
    new Date(Number(budget.month.slice(0, 4)), Number(budget.month.slice(5, 7)) - 1, 1),
    settings.locale,
  );

  const sheetCategory = sheetCategoryId
    ? (rootExpenseCategories.find((category) => category.id === sheetCategoryId) ?? null)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={monthLabel}
          infoTooltip={
            budget.templateName
              ? I18n.t('budget.from_template', {
                  name: budget.templateEmoji
                    ? `${budget.templateEmoji} ${budget.templateName}`
                    : budget.templateName,
                })
              : undefined
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <Input
            label={I18n.t('budget.total_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={total}
            onChangeText={setTotal}
            placeholder="0.00"
          />

          <View className="gap-1 pt-1">
            <Text variant="bodyStrong">{I18n.t('budget.allocate_title')}</Text>
            <Text variant="caption" tone="muted">
              {I18n.t('budget.allocate_hint')}
            </Text>
          </View>
        </View>

        <View className="bg-background px-5 py-2">
          <AllocationStatusBar
            total={parsedTotal}
            remaining={remaining}
            settings={settings}
            themeColors={themeColors}
          />
        </View>

        <View className="gap-4 px-5">
          <AllocationCategoryList
            rootCategories={rootExpenseCategories}
            amounts={amounts}
            childGaps={childGaps}
            onPressCategory={setSheetCategoryId}
            settings={settings}
            themeColors={themeColors}
          />

          <AllocationOptionRow
            title={I18n.t('budget.count_unbudgeted_title')}
            caption={I18n.t('budget.count_unbudgeted_caption')}
            value={countUnbudgeted}
            onChange={setCountUnbudgeted}
            themeColors={themeColors}
          />
        </View>
      </ScrollView>

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />

      <CategoryAllocationSheet
        visible={sheetCategory != null}
        onClose={() => setSheetCategoryId(null)}
        category={sheetCategory}
        childCategories={sheetCategory ? (childrenByParent.get(sheetCategory.id) ?? []) : []}
        amounts={amounts}
        onChangeAmount={handleChangeAmount}
        rootRemaining={remaining}
        currencySymbol={currencySymbol}
        settings={settings}
      />
    </SafeAreaView>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input, SettingsHeader } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  AllocationCategoryList,
  AllocationFooter,
  AllocationOptionRow,
} from '~/features/budget/components/AllocationEditor';
import {
  type OpenCategoryAllocationParams,
  useAllocationDraft,
} from '~/features/budget/hooks/useAllocationDraft';
import { budgetPeriodLabel } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetPeriod } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { monthCycleOf } from '~/utils/financialMonth';

interface PeriodBudgetEditorScreenProps {
  /** Existing week, month or year budget to edit in place. */
  budgetId?: string;
  /** Period to create a one-off custom budget for (no template). */
  createFor?: { period: BudgetPeriod; periodKey: string };
  /** Pushes the full-page per-category allocation editor. */
  onOpenCategoryAllocation: (params: OpenCategoryAllocationParams) => void;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

/**
 * Edits one week's, month's or year's frozen budget in place (total,
 * allocations including subcategory breakdowns, count-unbudgeted) — or, with
 * `createFor`, creates a custom budget for that period only. Neither mode
 * touches any template.
 */
export function PeriodBudgetEditorScreen({
  budgetId,
  createFor,
  onOpenCategoryAllocation,
  onClose,
}: PeriodBudgetEditorScreenProps) {
  const { settings, categories, periodBudgets, updatePeriodBudget, createCustomPeriodBudget } =
    useApp();
  const themeColors = useThemeColors();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const budget = useMemo(
    () =>
      budgetId ? (periodBudgets.find((candidate) => candidate.id === budgetId) ?? null) : null,
    [budgetId, periodBudgets],
  );

  const [countUnbudgeted, setCountUnbudgeted] = useState(budget?.countUnbudgeted ?? true);

  const draft = useAllocationDraft({
    categories,
    initialTotal: budget ? String(budget.totalAmount) : '',
    initialAmounts: () => {
      const initial: Record<string, string> = {};
      for (const line of budget?.lines ?? []) {
        if (line.amount > 0) initial[line.categoryId] = String(line.amount);
      }
      return initial;
    },
    initialOrder: () => {
      // Frozen lines arrive in saved sortOrder; keep the root order so editing
      // a month opens in the arrangement it was saved in.
      const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
      return (budget?.lines ?? [])
        .filter((line) => !parentById.get(line.categoryId))
        .map((line) => line.categoryId);
    },
    onOpenCategoryAllocation,
  });

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const target = budget
    ? { period: budget.period, periodKey: budget.periodKey }
    : (createFor ?? null);
  const canSave = target != null && draft.allocationsValid;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    const input = {
      totalAmount: draft.parsedTotal,
      countUnbudgeted,
      lines: draft.buildAllocations(),
    };
    if (budget) {
      updatePeriodBudget(budget.id, input);
    } else if (createFor) {
      createCustomPeriodBudget(createFor.period, createFor.periodKey, input);
    }
    onClose();
  }, [
    budget,
    canSave,
    countUnbudgeted,
    createCustomPeriodBudget,
    createFor,
    draft,
    onClose,
    updatePeriodBudget,
  ]);

  if (!target) return null;

  const title = budgetPeriodLabel(
    target.period,
    target.periodKey,
    settings.locale,
    monthCycleOf(settings),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader className="px-0 pt-5 pb-3" onBack={onClose} title={title} />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <Input
            label={I18n.t(`budget.total_label_${target.period}`)}
            variant="currency"
            currencySymbol={currencySymbol}
            value={draft.total}
            onChangeText={draft.setTotal}
            placeholder="0.00"
          />

          <AllocationCategoryList
            rootCategories={draft.rootExpenseCategories}
            amounts={draft.amounts}
            childGaps={draft.childGaps}
            onPressCategory={draft.openCategoryAllocation}
            onReorder={draft.reorderRootCategories}
            scrollableRef={scrollRef}
            settings={settings}
            themeColors={themeColors}
          />

          <AllocationOptionRow
            title={I18n.t('budget.count_unbudgeted_title')}
            caption={I18n.t(`budget.count_unbudgeted_caption_${target.period}`)}
            value={countUnbudgeted}
            onChange={setCountUnbudgeted}
            themeColors={themeColors}
          />
        </View>
      </Animated.ScrollView>

      {/* The remaining-to-allocate bar sits right above Cancel/Save (and rides
          the keyboard) so the running tally is visible while amounts are
          entered. */}
      <AllocationFooter
        showBar={draft.parsedTotal > 0}
        total={draft.parsedTotal}
        remaining={draft.remaining}
        settings={settings}
        themeColors={themeColors}
        onCancel={onClose}
        onSave={handleSave}
        saveDisabled={!canSave}
      />
    </SafeAreaView>
  );
}

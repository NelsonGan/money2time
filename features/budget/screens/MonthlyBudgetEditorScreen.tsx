import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
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
import { monthKeyLabel } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';

interface MonthlyBudgetEditorScreenProps {
  /** Existing month budget to edit in place. */
  budgetId?: string;
  /** 'YYYY-MM' month to create a one-off custom budget for (no template). */
  createForMonth?: string;
  /** Pushes the full-page per-category allocation editor. */
  onOpenCategoryAllocation: (params: OpenCategoryAllocationParams) => void;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

/**
 * Edits one month's frozen budget in place (total, allocations including
 * subcategory breakdowns, count-unbudgeted) — or, with `createForMonth`,
 * creates a custom budget for that month only. Neither mode touches any
 * template.
 */
export function MonthlyBudgetEditorScreen({
  budgetId,
  createForMonth,
  onOpenCategoryAllocation,
  onClose,
}: MonthlyBudgetEditorScreenProps) {
  const { settings, categories, monthlyBudgets, updateMonthlyBudget, createCustomMonthlyBudget } =
    useApp();
  const themeColors = useThemeColors();

  const budget = useMemo(
    () =>
      budgetId ? (monthlyBudgets.find((candidate) => candidate.id === budgetId) ?? null) : null,
    [budgetId, monthlyBudgets],
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
    onOpenCategoryAllocation,
  });

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const month = budget?.month ?? createForMonth ?? null;
  const canSave = (budget != null || createForMonth != null) && draft.allocationsValid;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    const input = {
      totalAmount: draft.parsedTotal,
      countUnbudgeted,
      lines: draft.buildAllocations(),
    };
    if (budget) {
      updateMonthlyBudget(budget.id, input);
    } else if (createForMonth) {
      createCustomMonthlyBudget(createForMonth, input);
    }
    onClose();
  }, [
    budget,
    canSave,
    countUnbudgeted,
    createCustomMonthlyBudget,
    createForMonth,
    draft,
    onClose,
    updateMonthlyBudget,
  ]);

  if (!month) return null;

  const monthLabel = monthKeyLabel(month, settings.locale);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={monthLabel}
          infoTooltip={
            budget?.templateName
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
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <Input
            label={I18n.t('budget.total_label')}
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

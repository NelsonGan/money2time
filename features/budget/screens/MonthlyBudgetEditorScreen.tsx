import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  AllocationCategoryList,
  AllocationOptionRow,
  AllocationStatusBar,
} from '~/features/budget/components/AllocationEditor';
import {
  type OpenCategoryAllocationParams,
  useAllocationDraft,
} from '~/features/budget/hooks/useAllocationDraft';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatMonthYearLabel, parseMonthKey } from '~/utils/formatters';

interface MonthlyBudgetEditorScreenProps {
  budgetId: string;
  /** Pushes the full-page per-category allocation editor. */
  onOpenCategoryAllocation: (params: OpenCategoryAllocationParams) => void;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

/**
 * Edits one month's frozen budget in place: total, allocations (including
 * subcategory breakdowns), and the count-unbudgeted option. A local override
 * for that month only; the source template is untouched.
 */
export function MonthlyBudgetEditorScreen({
  budgetId,
  onOpenCategoryAllocation,
  onClose,
}: MonthlyBudgetEditorScreenProps) {
  const { settings, categories, monthlyBudgets, updateMonthlyBudget } = useApp();
  const themeColors = useThemeColors();

  const budget = useMemo(
    () => monthlyBudgets.find((candidate) => candidate.id === budgetId) ?? null,
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
  const canSave = budget != null && draft.allocationsValid;

  const handleSave = useCallback(() => {
    if (!canSave || !budget) return;
    void triggerHaptic('success');
    updateMonthlyBudget(budget.id, {
      totalAmount: draft.parsedTotal,
      countUnbudgeted,
      lines: draft.buildAllocations(),
    });
    onClose();
  }, [budget, canSave, countUnbudgeted, draft, onClose, updateMonthlyBudget]);

  if (!budget) return null;

  const monthLabel = formatMonthYearLabel(
    parseMonthKey(budget.month) ?? new Date(),
    settings.locale,
  );

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
            value={draft.total}
            onChangeText={draft.setTotal}
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
            total={draft.parsedTotal}
            remaining={draft.remaining}
            settings={settings}
            themeColors={themeColors}
          />
        </View>

        <View className="gap-4 px-5">
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

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
    </SafeAreaView>
  );
}

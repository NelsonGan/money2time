import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEmoji, Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  computeAllocationRemaining,
  computeBackPopulateRange,
} from '~/features/budget/lib/budgetMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, UserSettings } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatAmount, formatMonthYearLabel, normalizeMoneyAmount } from '~/utils/formatters';

interface BudgetTemplateEditorScreenProps {
  templateId?: string;
  duplicateFromId?: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 40 } as const;

function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

function monthKeyToDate(monthKey: string): Date {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
}

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function AllocationRow({
  category,
  value,
  onChange,
  onFill,
  canFill,
  currencySymbol,
  themeColors,
}: {
  category: Category;
  value: string;
  onChange: (next: string) => void;
  onFill: () => void;
  canFill: boolean;
  currencySymbol: string;
  themeColors: ColorPalette;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border/40 bg-card px-3.5 py-2.5">
      <CategoryEmoji icon={category.icon} size={18} />
      <Text variant="body" numberOfLines={1} className="flex-1">
        {category.name}
      </Text>
      {canFill ? (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onFill();
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('budget.fill_remainder')}
          className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 active:opacity-80"
        >
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('budget.fill_remainder')}
          </Text>
        </Pressable>
      ) : null}
      <View className="w-[110px]">
        <Input
          variant="currency"
          currencySymbol={currencySymbol}
          value={value}
          onChangeText={onChange}
          placeholder="0"
          accessibilityLabel={category.name}
        />
      </View>
    </View>
  );
}

export function BudgetTemplateEditorScreen({
  templateId,
  duplicateFromId,
  onClose,
}: BudgetTemplateEditorScreenProps) {
  const {
    settings,
    categories,
    budgetTemplates,
    monthlyBudgets,
    createBudgetTemplate,
    updateBudgetTemplate,
  } = useApp();
  const { transactions } = useTransactions();
  const themeColors = useThemeColors();

  const existing = useMemo(
    () => budgetTemplates.find((template) => template.id === templateId) ?? null,
    [budgetTemplates, templateId],
  );
  const duplicateSource = useMemo(
    () => budgetTemplates.find((template) => template.id === duplicateFromId) ?? null,
    [budgetTemplates, duplicateFromId],
  );
  const isEditing = existing != null;
  const seed = existing ?? duplicateSource;

  const rootExpenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && !category.parentId),
    [categories],
  );

  const [name, setName] = useState(
    existing?.name ??
      (duplicateSource ? `${duplicateSource.name} ${I18n.t('budget.duplicate_suffix')}` : ''),
  );
  const [total, setTotal] = useState(seed ? String(seed.totalAmount) : '');
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const allocation of seed?.allocations ?? []) {
      if (allocation.amount > 0) initial[allocation.categoryId] = String(allocation.amount);
    }
    return initial;
  });
  const [backPopulate, setBackPopulate] = useState(false);

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parsedTotal = parseAmount(total);

  const allocations = useMemo(
    () =>
      rootExpenseCategories
        .map((category) => ({
          categoryId: category.id,
          amount: parseAmount(amounts[category.id] ?? ''),
        }))
        .filter((allocation) => allocation.amount > 0),
    [amounts, rootExpenseCategories],
  );

  const remaining = computeAllocationRemaining(parsedTotal, allocations);
  const canSave =
    name.trim().length > 0 && parsedTotal > 0 && allocations.length > 0 && remaining === 0;

  // Back-populate is only offered on create, and only when there are missing
  // past months to fill (range copy names the exact span).
  const backPopulateRange = useMemo(() => {
    if (isEditing) return null;
    return computeBackPopulateRange({
      transactions,
      existingLiveMonths: monthlyBudgets.map((budget) => budget.month),
    });
  }, [isEditing, monthlyBudgets, transactions]);

  const handleFill = useCallback(
    (categoryId: string) => {
      if (remaining <= 0) return;
      const current = parseAmount(amounts[categoryId] ?? '');
      setAmounts((previous) => ({
        ...previous,
        [categoryId]: String(normalizeMoneyAmount(current + remaining)),
      }));
    },
    [amounts, remaining],
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    const input = { name: name.trim(), totalAmount: parsedTotal, allocations };
    if (isEditing && existing) {
      updateBudgetTemplate(existing.id, input);
    } else {
      createBudgetTemplate({ ...input, backPopulate: backPopulate && backPopulateRange != null });
    }
    onClose();
  }, [
    allocations,
    backPopulate,
    backPopulateRange,
    canSave,
    createBudgetTemplate,
    existing,
    isEditing,
    name,
    onClose,
    parsedTotal,
    updateBudgetTemplate,
  ]);

  const remainingLabel =
    remaining > 0
      ? I18n.t('budget.allocated_left', { amount: money(remaining, settings) })
      : remaining < 0
        ? I18n.t('budget.allocated_over', { amount: money(Math.abs(remaining), settings) })
        : I18n.t('budget.allocated_done');
  const remainingColor =
    remaining > 0 ? themeColors.coral : remaining < 0 ? themeColors.error : themeColors.success;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={isEditing ? I18n.t('budget.edit_title') : I18n.t('budget.add_title')}
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <Input
            label={I18n.t('budget.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={I18n.t('budget.name_placeholder')}
          />

          <Input
            label={I18n.t('budget.total_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={total}
            onChangeText={setTotal}
            placeholder="0.00"
          />

          {parsedTotal > 0 ? (
            <>
              <View className="mt-1 gap-1">
                <Text variant="bodyStrong">{I18n.t('budget.allocate_title')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('budget.allocate_hint')}
                </Text>
              </View>

              {/* Allocation status — must reach exactly zero before saving. */}
              <View className="flex-row items-center justify-between rounded-2xl border border-border/40 bg-secondary/25 px-4 py-3">
                <Text variant="caption" tone="muted">
                  {I18n.t('budget.allocated_summary', {
                    allocated: money(normalizeMoneyAmount(parsedTotal - remaining), settings),
                    total: money(parsedTotal, settings),
                  })}
                </Text>
                <Text variant="caption" style={{ color: remainingColor }}>
                  {remainingLabel}
                </Text>
              </View>

              <View className="gap-2">
                {rootExpenseCategories.map((category) => (
                  <AllocationRow
                    key={category.id}
                    category={category}
                    value={amounts[category.id] ?? ''}
                    onChange={(next) =>
                      setAmounts((previous) => ({ ...previous, [category.id]: next }))
                    }
                    onFill={() => handleFill(category.id)}
                    canFill={remaining > 0}
                    currencySymbol={currencySymbol}
                    themeColors={themeColors}
                  />
                ))}
              </View>

              {backPopulateRange ? (
                <View className="mt-1 flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text variant="body">{I18n.t('budget.back_populate_title')}</Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {I18n.t('budget.back_populate_caption', {
                        first: formatMonthYearLabel(
                          monthKeyToDate(backPopulateRange.firstMonthKey),
                          settings.locale,
                        ),
                        last: formatMonthYearLabel(
                          monthKeyToDate(backPopulateRange.lastMonthKey),
                          settings.locale,
                        ),
                        count: backPopulateRange.months.length,
                      })}
                    </Text>
                  </View>
                  <Switch
                    value={backPopulate}
                    onValueChange={(next) => {
                      void triggerHaptic('selection');
                      setBackPopulate(next);
                    }}
                    trackColor={{ true: themeColors.primary }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
    </SafeAreaView>
  );
}

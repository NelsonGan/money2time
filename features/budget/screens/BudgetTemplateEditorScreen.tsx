import { SmilePlus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEmoji, Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  AllocationCategoryList,
  AllocationOptionRow,
  AllocationStatusBar,
  parseAllocationAmount,
} from '~/features/budget/components/AllocationEditor';
import { CategoryAllocationSheet } from '~/features/budget/components/CategoryAllocationSheet';
import { EmojiPickerSheet } from '~/features/budget/components/EmojiPickerSheet';
import {
  computeAllocationRemaining,
  computeBackPopulateRange,
  computeChildAllocationGap,
} from '~/features/budget/lib/budgetMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatMonthYearLabel } from '~/utils/formatters';

interface BudgetTemplateEditorScreenProps {
  templateId?: string;
  duplicateFromId?: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

function monthKeyToDate(monthKey: string): Date {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
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

  const [name, setName] = useState(
    existing?.name ??
      (duplicateSource ? `${duplicateSource.name} ${I18n.t('budget.duplicate_suffix')}` : ''),
  );
  const [emoji, setEmoji] = useState<string | null>(seed?.emoji ?? null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [total, setTotal] = useState(seed ? String(seed.totalAmount) : '');
  const [countUnbudgeted, setCountUnbudgeted] = useState(seed?.countUnbudgeted ?? true);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const allocation of seed?.allocations ?? []) {
      if (allocation.amount > 0) initial[allocation.categoryId] = String(allocation.amount);
    }
    return initial;
  });
  const [backPopulate, setBackPopulate] = useState(false);
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parsedTotal = parseAllocationAmount(total);

  // Only root allocations count toward the template total; child allocations
  // are a breakdown *within* their parent and are validated per group.
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
    name.trim().length > 0 &&
    parsedTotal > 0 &&
    rootAllocations.length > 0 &&
    remaining === 0 &&
    childGaps.size === 0;

  // Back-populate is only offered on create, and only when there are missing
  // past months to fill (range copy names the exact span).
  const backPopulateRange = useMemo(() => {
    if (isEditing) return null;
    return computeBackPopulateRange({
      transactions,
      existingLiveMonths: monthlyBudgets.map((budget) => budget.month),
    });
  }, [isEditing, monthlyBudgets, transactions]);

  const handleChangeAmount = useCallback((categoryId: string, next: string) => {
    setAmounts((previous) => ({ ...previous, [categoryId]: next }));
  }, []);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    // Persist root allocations plus any child breakdowns (already validated
    // to sum to their parent).
    const allocations = [...rootAllocations];
    for (const rootAllocation of rootAllocations) {
      for (const child of childrenByParent.get(rootAllocation.categoryId) ?? []) {
        const amount = parseAllocationAmount(amounts[child.id] ?? '');
        if (amount > 0) allocations.push({ categoryId: child.id, amount });
      }
    }
    const input = {
      name: name.trim(),
      emoji,
      totalAmount: parsedTotal,
      countUnbudgeted,
      allocations,
    };
    if (isEditing && existing) {
      updateBudgetTemplate(existing.id, input);
    } else {
      createBudgetTemplate({ ...input, backPopulate: backPopulate && backPopulateRange != null });
    }
    onClose();
  }, [
    amounts,
    backPopulate,
    backPopulateRange,
    canSave,
    childrenByParent,
    countUnbudgeted,
    createBudgetTemplate,
    emoji,
    existing,
    isEditing,
    name,
    onClose,
    parsedTotal,
    rootAllocations,
    updateBudgetTemplate,
  ]);

  const sheetCategory = sheetCategoryId
    ? (rootExpenseCategories.find((category) => category.id === sheetCategoryId) ?? null)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={isEditing ? I18n.t('budget.edit_title') : I18n.t('budget.add_title')}
        />
      </View>

      {/* The allocation bar (index 1) pins to the top while the category list
          scrolls, so how much is left is never off-screen. */}
      <ScrollView
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={parsedTotal > 0 ? [1] : undefined}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <View className="flex-row items-end gap-3">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setShowEmojiPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('budget.choose_emoji')}
              className="h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-border/40 bg-secondary/30"
            >
              {emoji ? (
                <CategoryEmoji icon={emoji} size={26} />
              ) : (
                <SmilePlus size={22} color={themeColors.textMuted} />
              )}
            </Pressable>
            <View className="flex-1">
              <Input
                label={I18n.t('budget.name_label')}
                value={name}
                onChangeText={setName}
                placeholder={I18n.t('budget.name_placeholder')}
              />
            </View>
          </View>

          <Input
            label={I18n.t('budget.total_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={total}
            onChangeText={setTotal}
            placeholder="0.00"
          />

          {parsedTotal > 0 ? (
            <View className="gap-1 pt-1">
              <Text variant="bodyStrong">{I18n.t('budget.allocate_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('budget.allocate_hint')}
              </Text>
            </View>
          ) : null}
        </View>

        {parsedTotal > 0 ? (
          <View className="bg-background px-5 py-2">
            <AllocationStatusBar
              total={parsedTotal}
              remaining={remaining}
              settings={settings}
              themeColors={themeColors}
            />
          </View>
        ) : null}

        {parsedTotal > 0 ? (
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

            {backPopulateRange ? (
              <AllocationOptionRow
                title={I18n.t('budget.back_populate_title')}
                caption={I18n.t('budget.back_populate_caption', {
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
                value={backPopulate}
                onChange={setBackPopulate}
                themeColors={themeColors}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />

      <EmojiPickerSheet
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        selected={emoji}
        onSelect={setEmoji}
      />

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

import { SmilePlus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEmoji, Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { EmojiPickerSheet } from '~/features/budget/components/EmojiPickerSheet';
import {
  computeAllocationRemaining,
  computeBackPopulateRange,
  computeChildAllocationGap,
} from '~/features/budget/lib/budgetMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, UserSettings } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatAmount, formatMonthYearLabel, normalizeMoneyAmount } from '~/utils/formatters';

interface BudgetTemplateEditorScreenProps {
  templateId?: string;
  duplicateFromId?: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

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

function FillChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
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
  );
}

function AmountField({
  value,
  onChange,
  currencySymbol,
  accessibilityLabel,
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  currencySymbol: string;
  accessibilityLabel: string;
  compact?: boolean;
}) {
  return (
    <View className={compact ? 'w-[96px]' : 'w-[112px]'}>
      <Input
        variant="currency"
        currencySymbol={currencySymbol}
        value={value}
        onChangeText={onChange}
        placeholder="0"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

/**
 * One root expense category: emoji + name + amount on the first row; once an
 * amount is set and the category has subcategories, an optional child
 * breakdown expands below (child amounts must sum to the parent when used).
 */
function AllocationGroup({
  category,
  childCategories,
  amounts,
  onChangeAmount,
  rootRemaining,
  currencySymbol,
  settings,
  themeColors,
}: {
  category: Category;
  childCategories: Category[];
  amounts: Record<string, string>;
  onChangeAmount: (categoryId: string, next: string) => void;
  rootRemaining: number;
  currencySymbol: string;
  settings: UserSettings;
  themeColors: ColorPalette;
}) {
  const parentAmount = parseAmount(amounts[category.id] ?? '');
  const childAllocations = childCategories.map((child) => ({
    amount: parseAmount(amounts[child.id] ?? ''),
  }));
  const childGap = computeChildAllocationGap(parentAmount, childAllocations);
  const anyChildAllocated = childAllocations.some((allocation) => allocation.amount > 0);
  const showChildren = parentAmount > 0 && childCategories.length > 0;

  return (
    <View
      className={cn(
        'rounded-2xl border bg-card',
        childGap !== 0 ? 'border-destructive/40' : 'border-border/40',
      )}
    >
      <View className="flex-row items-center gap-3 py-2.5 pl-3.5 pr-2.5">
        <CategoryEmoji icon={category.icon} size={18} />
        <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
          {category.name}
        </Text>
        {parentAmount === 0 && rootRemaining > 0 ? (
          <FillChip
            onPress={() => onChangeAmount(category.id, String(normalizeMoneyAmount(rootRemaining)))}
          />
        ) : null}
        <AmountField
          value={amounts[category.id] ?? ''}
          onChange={(next) => onChangeAmount(category.id, next)}
          currencySymbol={currencySymbol}
          accessibilityLabel={category.name}
        />
      </View>

      {showChildren ? (
        <View className="border-t border-border/30 px-3.5 pb-2.5 pt-1.5">
          {childCategories.map((child) => {
            const childAmount = parseAmount(amounts[child.id] ?? '');
            return (
              <View key={child.id} className="flex-row items-center gap-2.5 py-1">
                <View className="h-4 w-3.5 rounded-bl-lg border-b border-l border-border/50" />
                <CategoryEmoji icon={child.icon} parentIcon={category.icon} size={14} />
                <Text
                  variant="caption"
                  numberOfLines={1}
                  className="min-w-0 flex-1 text-foreground"
                >
                  {child.name}
                </Text>
                {childAmount === 0 && anyChildAllocated && childGap > 0 ? (
                  <FillChip
                    onPress={() => onChangeAmount(child.id, String(normalizeMoneyAmount(childGap)))}
                  />
                ) : null}
                <AmountField
                  value={amounts[child.id] ?? ''}
                  onChange={(next) => onChangeAmount(child.id, next)}
                  currencySymbol={currencySymbol}
                  accessibilityLabel={child.name}
                  compact
                />
              </View>
            );
          })}
          {childGap !== 0 ? (
            <Text variant="caption" className="mt-1.5" style={{ color: themeColors.error }}>
              {I18n.t('budget.children_mismatch', {
                total: money(parentAmount, settings),
                delta: money(Math.abs(childGap), settings),
              })}
            </Text>
          ) : anyChildAllocated ? (
            <Text variant="caption" tone="muted" className="mt-1.5">
              {I18n.t('budget.children_matched')}
            </Text>
          ) : (
            <Text variant="caption" tone="muted" className="mt-1.5">
              {I18n.t('budget.children_hint')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function OptionRow({
  title,
  caption,
  value,
  onChange,
  themeColors,
}: {
  title: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
  themeColors: ColorPalette;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="muted" className="mt-0.5">
          {caption}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          void triggerHaptic('selection');
          onChange(next);
        }}
        trackColor={{ true: themeColors.primary }}
      />
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

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parsedTotal = parseAmount(total);

  // Only root allocations count toward the template total; child allocations
  // are a breakdown *within* their parent and are validated per group.
  const rootAllocations = useMemo(
    () =>
      rootExpenseCategories
        .map((category) => ({
          categoryId: category.id,
          amount: parseAmount(amounts[category.id] ?? ''),
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
        children.map((child) => ({ amount: parseAmount(amounts[child.id] ?? '') })),
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
        const amount = parseAmount(amounts[child.id] ?? '');
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

      {/* The allocation status row (index 1) pins to the top while the
          category list scrolls, so "how much is left" is never off-screen. */}
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

        {/* Sticky allocation status. */}
        {parsedTotal > 0 ? (
          <View className="bg-background px-5 py-2">
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border/40 bg-secondary/25 px-4 py-3">
              <Text variant="caption" tone="muted" numberOfLines={1} className="min-w-0 shrink">
                {I18n.t('budget.allocated_summary', {
                  allocated: money(normalizeMoneyAmount(parsedTotal - remaining), settings),
                  total: money(parsedTotal, settings),
                })}
              </Text>
              <Text variant="caption" numberOfLines={1} style={{ color: remainingColor }}>
                {remainingLabel}
              </Text>
            </View>
          </View>
        ) : null}

        {parsedTotal > 0 ? (
          <View className="gap-4 px-5">
            <View className="gap-2">
              {rootExpenseCategories.map((category) => (
                <AllocationGroup
                  key={category.id}
                  category={category}
                  childCategories={childrenByParent.get(category.id) ?? []}
                  amounts={amounts}
                  onChangeAmount={handleChangeAmount}
                  rootRemaining={remaining}
                  currencySymbol={currencySymbol}
                  settings={settings}
                  themeColors={themeColors}
                />
              ))}
            </View>

            <OptionRow
              title={I18n.t('budget.count_unbudgeted_title')}
              caption={I18n.t('budget.count_unbudgeted_caption')}
              value={countUnbudgeted}
              onChange={setCountUnbudgeted}
              themeColors={themeColors}
            />

            {backPopulateRange ? (
              <OptionRow
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
    </SafeAreaView>
  );
}

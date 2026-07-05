import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  CategoryEmoji,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { BudgetTemplatePickerSheet } from '~/features/budget/components/BudgetTemplatePickerSheet';
import {
  buildBudgetMonthSummary,
  computeBudgetPagerMonths,
} from '~/features/budget/lib/budgetMath';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import type { ColorPalette } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type {
  BudgetCategoryProgress,
  BudgetMonthSummary,
  Category,
  MonthlyBudget,
  UserSettings,
} from '~/types';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, formatMonthYearLabel, monthKeyFromDateLocal } from '~/utils/formatters';

interface BudgetScreenProps {
  onBack?: () => void;
  onOpenTemplates: () => void;
  onOpenTemplateEditor: (params?: { templateId?: string; duplicateFromId?: string }) => void;
  /** Opens the month-budget editor (edits that month only, not the template). */
  onOpenBudgetEditor: (budgetId: string) => void;
  safeAreaEdges?: Edge[];
}

/** Local Date at the first of a 'YYYY-MM' month key. */
function monthKeyToDate(monthKey: string): Date {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
}

/** Money formatting regardless of the global time display mode. */
function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

/** primary while healthy, coral when nearly depleted (≥80%), error when over. */
function usageColor(ratio: number, themeColors: ColorPalette): string {
  if (ratio > 1) return themeColors.error;
  if (ratio >= 0.8) return themeColors.coral;
  return themeColors.primary;
}

function ProgressBar({
  ratio,
  color,
  trackColor,
  height = 6,
}: {
  ratio: number;
  color: string;
  trackColor: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  return (
    <View
      className="w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: trackColor }}
    >
      <View
        className="rounded-full"
        style={{ height, width: `${clamped * 100}%`, backgroundColor: color }}
      />
    </View>
  );
}

function BudgetSummaryCard({
  budget,
  summary,
  settings,
  themeColors,
  onEdit,
  onDelete,
}: {
  budget: MonthlyBudget;
  summary: BudgetMonthSummary;
  settings: UserSettings;
  themeColors: ColorPalette;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOver = summary.remaining < 0;
  const barColor = usageColor(summary.usageRatio, themeColors);

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      <View
        pointerEvents="none"
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full"
        style={{ backgroundColor: barColor, opacity: 0.1 }}
      />

      <View className="px-4 pb-3.5 pt-3.5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text variant="label" className="text-[10px] text-primary">
              {I18n.t('budget.summary_spent')}
            </Text>
            <View className="mt-1 flex-row items-baseline gap-1.5">
              <Text variant="monoLg" numberOfLines={1} className="shrink">
                {money(summary.totalSpent, settings)}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                / {money(summary.totalBudget, settings)}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={onEdit}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('budget.edit_budget')}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary/40 active:opacity-70"
            >
              <Pencil size={14} color={themeColors.textMuted} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('budget.delete_budget')}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary/40 active:opacity-70"
            >
              <Trash2 size={14} color={themeColors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View className="mt-3">
          <ProgressBar
            ratio={summary.usageRatio}
            color={barColor}
            trackColor={withColorAlpha(barColor, 0.14)}
          />
        </View>

        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Text
            variant="caption"
            numberOfLines={1}
            className="min-w-0 shrink-0"
            style={{ color: isOver ? themeColors.error : barColor }}
          >
            {isOver
              ? I18n.t('budget.summary_exceeded', { amount: money(summary.exceededBy, settings) })
              : I18n.t('budget.left', { amount: money(summary.remaining, settings) })}
          </Text>
          {budget.templateName ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="min-w-0 shrink">
              {I18n.t('budget.from_template', {
                name: budget.templateEmoji
                  ? `${budget.templateEmoji} ${budget.templateName}`
                  : budget.templateName,
              })}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="h-px bg-border/40" />

      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <Text variant="label" className="text-[10px]" tone="muted" numberOfLines={1}>
            {I18n.t('budget.summary_budgeted')}
          </Text>
          <Text variant="mono" className="mt-1" numberOfLines={1}>
            {money(summary.budgetedSpent, settings)}
          </Text>
        </View>
        <View className="w-px bg-border/40" />
        <View className="flex-1 px-4 py-2.5">
          <Text variant="label" className="text-[10px]" tone="muted" numberOfLines={1}>
            {summary.countUnbudgeted
              ? I18n.t('budget.summary_unbudgeted')
              : `${I18n.t('budget.summary_unbudgeted')} · ${I18n.t('budget.not_counted')}`}
          </Text>
          <Text variant="mono" className="mt-1" numberOfLines={1}>
            {money(summary.unbudgetedSpent, settings)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function BudgetChildRow({
  line,
  parentIcon,
  categoriesById,
  settings,
  themeColors,
}: {
  line: BudgetCategoryProgress;
  parentIcon: string | undefined;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  themeColors: ColorPalette;
}) {
  const category = categoriesById.get(line.categoryId);
  const barColor = usageColor(line.usageRatio, themeColors);

  return (
    <View className="flex-row items-center gap-2.5 py-1.5">
      <View className="h-4 w-3.5 rounded-bl-lg border-b border-l border-border/50" />
      <CategoryEmoji icon={category?.icon} parentIcon={parentIcon} size={14} />
      <Text variant="caption" numberOfLines={1} className="min-w-0 flex-[1.2] text-foreground">
        {category?.name ?? I18n.t('budget.uncategorized')}
      </Text>
      <View className="flex-1">
        <ProgressBar
          ratio={line.usageRatio}
          color={barColor}
          trackColor={withColorAlpha(barColor, 0.14)}
          height={4}
        />
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        className="shrink-0 text-right"
        style={{ color: line.isOver ? themeColors.error : themeColors.mutedForeground }}
      >
        {money(line.spent, settings)} / {money(line.budgeted, settings)}
      </Text>
    </View>
  );
}

function BudgetCategoryRow({
  line,
  categoriesById,
  settings,
  themeColors,
}: {
  line: BudgetCategoryProgress;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  themeColors: ColorPalette;
}) {
  const category = categoriesById.get(line.categoryId);
  const barColor = usageColor(line.usageRatio, themeColors);

  return (
    <View className="rounded-2xl border border-border/45 bg-card px-4 py-3">
      <View className="flex-row items-center gap-2.5">
        <CategoryEmoji icon={category?.icon} size={18} />
        <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
          {category?.name ?? I18n.t('budget.uncategorized')}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          className="shrink-0"
          style={{ color: line.isOver ? themeColors.error : barColor }}
        >
          {line.isOver
            ? I18n.t('budget.over', { amount: money(Math.abs(line.remaining), settings) })
            : I18n.t('budget.left', { amount: money(line.remaining, settings) })}
        </Text>
      </View>
      <View className="mt-2.5">
        <ProgressBar
          ratio={line.usageRatio}
          color={barColor}
          trackColor={withColorAlpha(barColor, 0.14)}
          height={5}
        />
      </View>
      <View className="mt-1.5 flex-row items-center justify-between gap-3">
        <Text variant="caption" tone="muted" numberOfLines={1} className="min-w-0 shrink">
          {money(line.spent, settings)} / {money(line.budgeted, settings)}
        </Text>
        <Text variant="caption" tone="muted" className="shrink-0">
          {Math.round(line.usageRatio * 100)}%
        </Text>
      </View>

      {line.children.length > 0 ? (
        <View className="mt-2 border-t border-border/30 pt-1">
          {line.children.map((child) => (
            <BudgetChildRow
              key={child.categoryId}
              line={child}
              parentIcon={category?.icon}
              categoriesById={categoriesById}
              settings={settings}
              themeColors={themeColors}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UnbudgetedRow({
  categoryId,
  spent,
  categoriesById,
  settings,
}: {
  categoryId: string | null;
  spent: number;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
}) {
  const category = categoryId ? categoriesById.get(categoryId) : undefined;
  return (
    <View className="flex-row items-center gap-2.5 rounded-2xl border border-border/30 bg-secondary/20 px-4 py-2.5">
      <CategoryEmoji icon={category?.icon} size={16} />
      <Text variant="body" numberOfLines={1} className="flex-1">
        {category?.name ?? I18n.t('budget.uncategorized')}
      </Text>
      <Text variant="mono" className="text-sm">
        {money(spent, settings)}
      </Text>
    </View>
  );
}

export function BudgetScreen({
  onBack,
  onOpenTemplates,
  onOpenTemplateEditor,
  onOpenBudgetEditor,
  safeAreaEdges = ['top'],
}: BudgetScreenProps) {
  const {
    settings,
    categories,
    budgetTemplates,
    monthlyBudgets,
    createMonthlyBudget,
    deleteMonthlyBudget,
  } = useApp();
  const { transactions } = useTransactions();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const { width: pageWidth } = useWindowDimensions();

  const [pickerMonth, setPickerMonth] = useState<string | null>(null);

  const months = useMemo(
    () => computeBudgetPagerMonths({ budgets: monthlyBudgets, transactions }),
    [monthlyBudgets, transactions],
  );

  const currentMonthIndex = useMemo(() => {
    const currentMonth = monthKeyFromDateLocal(new Date());
    const index = months.indexOf(currentMonth);
    return index >= 0 ? index : Math.max(months.length - 2, 0);
  }, [months]);

  const listRef = useRef<FlatList<number>>(null);
  const pager = useMonthPager({
    listRef,
    pageWidth,
    totalSlots: months.length,
    initialIndex: currentMonthIndex,
  });

  const budgetsByMonth = useMemo(
    () => new Map(monthlyBudgets.map((budget) => [budget.month, budget])),
    [monthlyBudgets],
  );

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const activeMonth = months[pager.activeIndex] ?? months[months.length - 1];
  const monthLabel = formatMonthYearLabel(monthKeyToDate(activeMonth), settings.locale);

  const handleCreateForMonth = useCallback(
    (month: string) => {
      if (budgetTemplates.length === 0) {
        onOpenTemplateEditor();
        return;
      }
      if (budgetTemplates.length === 1) {
        void triggerHaptic('success');
        createMonthlyBudget(month, budgetTemplates[0].id);
        return;
      }
      setPickerMonth(month);
    },
    [budgetTemplates, createMonthlyBudget, onOpenTemplateEditor],
  );

  const handleDeleteBudget = useCallback(
    (budget: MonthlyBudget) => {
      void triggerHaptic('warning');
      Alert.alert(I18n.t('budget.delete_budget_title'), I18n.t('budget.delete_budget_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => deleteMonthlyBudget(budget.id),
        },
      ]);
    },
    [deleteMonthlyBudget],
  );

  const renderMonthPage = useCallback(
    ({ item: slotIndex }: { item: number }) => {
      const month = months[slotIndex];
      const budget = budgetsByMonth.get(month) ?? null;
      const summary = buildBudgetMonthSummary({ month, budget, transactions, categories });

      if (!budget || !summary) {
        return (
          <View style={{ width: pageWidth }} className="flex-1">
            <EmptyState
              title={I18n.t('budget.no_budget_title', {
                month: formatMonthYearLabel(monthKeyToDate(month), settings.locale),
              })}
              message={
                budgetTemplates.length === 0
                  ? I18n.t('budget.no_templates_message')
                  : I18n.t('budget.no_budget_message')
              }
              mascotMood="curious"
              animateIn={false}
              action={{
                label:
                  budgetTemplates.length === 0
                    ? I18n.t('budget.create_template')
                    : I18n.t('budget.create_budget'),
                onPress: () => handleCreateForMonth(month),
              }}
            />
          </View>
        );
      }

      // Over-budget lines float to the top; otherwise keep the frozen order.
      const orderedCategories = [...summary.categories].sort(
        (a, b) => Number(b.isOver) - Number(a.isOver),
      );

      return (
        <View style={{ width: pageWidth }} className="flex-1">
          <ScrollView
            contentContainerStyle={[
              { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
              listNavInset,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <BudgetSummaryCard
              budget={budget}
              summary={summary}
              settings={settings}
              themeColors={themeColors}
              onEdit={() => onOpenBudgetEditor(budget.id)}
              onDelete={() => handleDeleteBudget(budget)}
            />

            <View className="mt-4 gap-2.5">
              {orderedCategories.map((line) => (
                <BudgetCategoryRow
                  key={line.categoryId}
                  line={line}
                  categoriesById={categoriesById}
                  settings={settings}
                  themeColors={themeColors}
                />
              ))}
            </View>

            {summary.unbudgeted.length > 0 ? (
              <View className="mt-5">
                <Text variant="label" tone="muted" className="mb-2 px-1 uppercase">
                  {I18n.t('budget.unbudgeted_section')}
                </Text>
                <View className="gap-2">
                  {summary.unbudgeted.map((entry) => (
                    <UnbudgetedRow
                      key={entry.categoryId ?? '__uncategorized__'}
                      categoryId={entry.categoryId}
                      spent={entry.spent}
                      categoriesById={categoriesById}
                      settings={settings}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      );
    },
    [
      budgetsByMonth,
      budgetTemplates.length,
      categories,
      categoriesById,
      handleCreateForMonth,
      handleDeleteBudget,
      listNavInset,
      onOpenBudgetEditor,
      months,
      pageWidth,
      settings,
      themeColors,
      transactions,
    ],
  );

  return (
    <SettingsPageLayout edges={safeAreaEdges}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('budget.title')}
          infoTooltip={I18n.t('budget.subtitle')}
          rightAccessory={
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenTemplates();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('budget.templates_title')}
              className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
            >
              <SlidersHorizontal size={18} color={themeColors.primary} />
            </Pressable>
          }
        />
      </View>

      <MonthControlsHeader
        title=""
        monthLabel={monthLabel}
        onPrevMonth={() => pager.scrollToRelative(-1)}
        onNextMonth={() => pager.scrollToRelative(1)}
        hideTitleRow
        showAccent={false}
      />

      <FlatList
        ref={listRef}
        data={pager.slots}
        renderItem={renderMonthPage}
        keyExtractor={pager.keyExtractor}
        getItemLayout={pager.getItemLayout}
        onMomentumScrollEnd={pager.handleMomentumEnd}
        onScrollEndDrag={pager.handleScrollEndDrag}
        onScrollToIndexFailed={pager.handleScrollToIndexFailed}
        initialScrollIndex={pager.activeIndex}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        className="flex-1"
      />

      <BudgetTemplatePickerSheet
        visible={pickerMonth != null}
        onClose={() => setPickerMonth(null)}
        templates={budgetTemplates}
        settings={settings}
        onSelect={(templateId) => {
          if (pickerMonth) {
            void triggerHaptic('success');
            createMonthlyBudget(pickerMonth, templateId);
          }
          setPickerMonth(null);
        }}
      />
    </SettingsPageLayout>
  );
}

import { Pencil, Trash2 } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  CategoryEmoji,
  SETTINGS_LIST_BOTTOM_PADDING,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { chartCategoryColor } from '~/constants/chartColors';
import type { ColorPalette } from '~/constants/designSystem';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { BudgetTemplatePickerSheet } from '~/features/budget/components/BudgetTemplatePickerSheet';
import {
  buildBudgetMonthSummary,
  computeBudgetPagerMonths,
} from '~/features/budget/lib/budgetMath';
import { money, monthKeyLabel, usageColor, usagePercentLabel } from '~/features/budget/lib/format';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import type { InsightsDrilldownPayload } from '~/features/insights/screens/InsightsDrilldownScreen';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type {
  BudgetCategoryProgress,
  BudgetMonthSummary,
  Category,
  MonthlyBudget,
  TransactionWithRelations,
  UserSettings,
} from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { financialMonthKeyForDate, financialMonthKeyForIso } from '~/utils/financialMonth';

function ProgressBar({
  ratio,
  color,
  trackColor,
  height,
}: {
  ratio: number;
  color: string;
  trackColor: string;
  height: number;
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
  summary,
  settings,
  themeColors,
  onEdit,
  onDelete,
}: {
  summary: BudgetMonthSummary;
  settings: UserSettings;
  themeColors: ColorPalette;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOver = summary.remaining < 0;
  // Health-colored ring: green while healthy, amber from 80%, red when over;
  // isOver wins so a zero-budget overspend (ratio 0) still reads red.
  const ringColor = isOver ? themeColors.error : usageColor(summary.usageRatio, themeColors);

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      {/* Ring gauge (savings-rate style) on a soft tinted disc, figures and a
          remaining chip beside it — structure over plain text lines. */}
      <View className="flex-row items-center gap-4 px-4 py-4">
        <View
          className="items-center justify-center rounded-full p-1.5"
          style={{ backgroundColor: withColorAlpha(ringColor, 0.07) }}
        >
          <SavingsRateRing
            size={88}
            strokeWidth={9}
            progress={Math.min(summary.usageRatio, 1)}
            color={ringColor}
            trackColor={withColorAlpha(ringColor, 0.16)}
          >
            <Text
              variant="bodyStrong"
              className="text-base"
              style={{ color: isOver ? themeColors.error : themeColors.text }}
            >
              {usagePercentLabel(summary.usageRatio)}
            </Text>
          </SavingsRateRing>
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-1.5">
            <Text variant="monoLg" numberOfLines={1} className="shrink">
              {money(summary.totalSpent, settings)}
            </Text>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
            / {money(summary.totalBudget, settings)}
          </Text>
          {/* Remaining as a tinted chip so the key number pops off the card. */}
          <View
            className="mt-2.5 self-start rounded-full px-2.5 py-1"
            style={{
              backgroundColor: withColorAlpha(isOver ? themeColors.error : ringColor, 0.12),
            }}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              className="text-[11px]"
              style={{ color: isOver ? themeColors.error : ringColor }}
            >
              {isOver
                ? I18n.t('budget.summary_exceeded', {
                    amount: money(summary.exceededBy, settings),
                  })
                : I18n.t('budget.left', { amount: money(summary.remaining, settings) })}
            </Text>
          </View>
        </View>

        <View className="gap-1.5">
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

      {/* The budgeted/unbudgeted split only makes sense when unbudgeted spend
          counts toward the month; when it doesn't, the month total already
          says everything. */}
      {summary.countUnbudgeted ? (
        <>
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
                {I18n.t('budget.summary_unbudgeted')}
              </Text>
              <Text variant="mono" className="mt-1" numberOfLines={1}>
                {money(summary.unbudgetedSpent, settings)}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function BudgetChildRow({
  line,
  color,
  categoriesById,
  settings,
  themeColors,
  onPress,
}: {
  line: BudgetCategoryProgress;
  color: string;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  const category = categoriesById.get(line.categoryId);
  const fillColor = line.isOver ? themeColors.error : color;
  const fillPct = Math.max(0, Math.min(line.usageRatio, 1)) * 100;

  return (
    <View className="flex-row items-center gap-2">
      {/* Tree elbow tying the subcategory to its parent row. */}
      <View className="h-4 w-3.5 self-start rounded-bl-lg border-b border-l border-border/50" />
      {/* One-line pill: the tinted fill behind the content IS the progress bar. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={category?.name ?? I18n.t('common.uncategorized')}
        className="relative min-w-0 flex-1 overflow-hidden rounded-xl active:opacity-80"
        style={{ backgroundColor: withColorAlpha(fillColor, 0.08) }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fillPct}%`,
            backgroundColor: withColorAlpha(fillColor, 0.18),
          }}
        />
        <View className="flex-row items-center gap-2 px-3 py-2">
          {/* Only an explicitly-set emoji renders — no falling back to the
              parent's icon, which just repeated it on every child row. */}
          {category?.icon ? <CategoryEmoji icon={category.icon} size={13} /> : null}
          <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1 text-foreground">
            {category?.name ?? I18n.t('common.uncategorized')}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            className="shrink-0 text-right"
            style={{ color: line.isOver ? themeColors.error : themeColors.mutedForeground }}
          >
            {money(line.spent, settings)} / {money(line.budgeted, settings)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function BudgetCategoryRow({
  line,
  color,
  first,
  categoriesById,
  settings,
  themeColors,
  onPress,
  onPressChild,
}: {
  line: BudgetCategoryProgress;
  /** Palette color for this category, shared with the breakdown pie. */
  color: string;
  first: boolean;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  themeColors: ColorPalette;
  /** Opens the drilldown for this root (children rolled up). */
  onPress: () => void;
  /** Opens the drilldown for one subcategory only. */
  onPressChild: (categoryId: string) => void;
}) {
  const category = categoriesById.get(line.categoryId);
  const barColor = line.isOver ? themeColors.error : color;
  // isOver wins so a zero-budget overspend (ratio 0) still reads red.
  const healthColor = line.isOver ? themeColors.error : usageColor(line.usageRatio, themeColors);

  return (
    // The child pills are siblings of the root Pressable, not descendants:
    // an accessible Pressable collapses its subtree for screen readers, which
    // would make the per-subcategory drilldowns unreachable (and pressing a
    // pill would flash the parent's press feedback).
    <View className={cn(!first && 'border-t border-border/25')}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={category?.name ?? I18n.t('common.uncategorized')}
        className={cn('px-4 py-3 active:bg-secondary/20', line.children.length > 0 && 'pb-2')}
      >
        {/* Emoji inline with the title, then a full-width depletion bar with
            the spent/total figures and usage badge beneath it — the bar spans
            the whole row so its length is comparable across categories. */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <CategoryEmoji icon={category?.icon} size={20} />
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
              {category?.name ?? I18n.t('common.uncategorized')}
            </Text>
            <Text
              variant="caption"
              numberOfLines={1}
              className="shrink-0 text-[11px]"
              tone={line.isOver ? undefined : 'muted'}
              style={line.isOver ? { color: themeColors.error } : undefined}
            >
              {line.isOver
                ? I18n.t('budget.over', { amount: money(Math.abs(line.remaining), settings) })
                : I18n.t('budget.left', { amount: money(line.remaining, settings) })}
            </Text>
          </View>
          <View className="gap-1">
            <ProgressBar
              ratio={line.usageRatio}
              color={barColor}
              trackColor={withColorAlpha(barColor, 0.14)}
              height={6}
            />
            <View className="flex-row items-center gap-2">
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1 text-[11px]">
                {money(line.spent, settings)} / {money(line.budgeted, settings)}
              </Text>
              <View
                className="shrink-0 rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: withColorAlpha(healthColor, 0.12) }}
              >
                <Text variant="label" className="text-[10px]" style={{ color: healthColor }}>
                  {usagePercentLabel(line.usageRatio)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>

      {line.children.length > 0 ? (
        <View className="gap-1.5 px-4 pt-1.5 pb-3.5 pl-6">
          {line.children.map((child) => (
            <BudgetChildRow
              key={child.categoryId}
              line={child}
              color={color}
              categoriesById={categoriesById}
              settings={settings}
              themeColors={themeColors}
              onPress={() => onPressChild(child.categoryId)}
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
  onPress,
}: {
  categoryId: string | null;
  spent: number;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  onPress: () => void;
}) {
  const category = categoryId ? categoriesById.get(categoryId) : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category?.name ?? I18n.t('common.uncategorized')}
      className="flex-row items-center gap-2.5 rounded-2xl border border-border/30 bg-secondary/20 px-4 py-2.5 active:opacity-80"
    >
      <CategoryEmoji icon={category?.icon} size={16} />
      <Text variant="body" numberOfLines={1} className="flex-1">
        {category?.name ?? I18n.t('common.uncategorized')}
      </Text>
      <Text variant="mono" className="text-sm">
        {money(spent, settings)}
      </Text>
    </Pressable>
  );
}

export interface BudgetPagerViewHandle {
  scrollToRelative: (direction: 1 | -1) => void;
}

interface BudgetPagerViewProps {
  onOpenTemplateEditor: (params?: { templateId?: string; duplicateFromId?: string }) => void;
  onOpenBudgetEditor: (budgetId: string) => void;
  onCreateCustomBudget: (month: string) => void;
  /** Opens the transactions drilldown for a tapped category. */
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  /** Reports the active month's label so the embedding host (Insights) can
   *  drive the pager from its own header controls. */
  onActiveMonthLabelChange?: (label: string) => void;
}

/**
 * The budget month pager without any screen chrome: month pages (summary
 * ring card, per-category depletion, unbudgeted section) plus the
 * create-from-template picker. Embedded as an insights page.
 */
export const BudgetPagerView = forwardRef<BudgetPagerViewHandle, BudgetPagerViewProps>(
  function BudgetPagerView(
    {
      onOpenTemplateEditor,
      onOpenBudgetEditor,
      onCreateCustomBudget,
      onOpenDrilldown,
      onActiveMonthLabelChange,
    },
    ref,
  ) {
    const {
      settings,
      categories,
      budgetTemplates,
      monthlyBudgets,
      createMonthlyBudget,
      deleteMonthlyBudget,
    } = useApp();
    const { transactions: liveTransactions } = useTransactions();
    // Tabs stay mounted for the app's lifetime, so when this pager is embedded
    // in the Insights tab it must freeze its transaction input while hidden —
    // otherwise every write re-runs the full month aggregation in the
    // background. Root-stack hosts (the standalone screen) are always visible.
    const transactions = useValueWhileTabVisible(liveTransactions);
    const themeColors = useThemeColors();
    const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
    const { width: pageWidth } = useWindowDimensions();

    const [pickerMonth, setPickerMonth] = useState<string | null>(null);

    const months = useMemo(
      () =>
        computeBudgetPagerMonths({
          budgets: monthlyBudgets,
          transactions,
          firstDayOfMonth: settings.firstDayOfMonth,
        }),
      [monthlyBudgets, transactions, settings.firstDayOfMonth],
    );

    const currentMonthIndex = useMemo(() => {
      const currentMonth = financialMonthKeyForDate(new Date(), settings.firstDayOfMonth);
      const index = months.indexOf(currentMonth);
      return index >= 0 ? index : Math.max(months.length - 2, 0);
    }, [months, settings.firstDayOfMonth]);

    const listRef = useRef<FlatList<number>>(null);
    const pager = useMonthPager({
      listRef,
      pageWidth,
      totalSlots: months.length,
      initialIndex: currentMonthIndex,
    });

    useImperativeHandle(ref, () => ({ scrollToRelative: pager.scrollToRelative }), [
      pager.scrollToRelative,
    ]);

    // The pager tracks a bare slot index, but `months` can gain/lose leading
    // entries while mounted (a backdated expense, an import, a bulk delete).
    // Re-anchor the index to the month the user was actually viewing so the
    // page doesn't silently jump.
    const previousMonthsRef = useRef(months);
    useEffect(() => {
      const previousMonths = previousMonthsRef.current;
      if (previousMonths === months) return;
      previousMonthsRef.current = months;
      const previousActiveMonth = previousMonths[pager.activeIndexRef.current];
      if (!previousActiveMonth) return;
      // If the viewed month itself disappeared (its anchoring data was
      // deleted), land on the nearest surviving month instead of letting the
      // slot index silently point at a different month.
      let nextIndex = months.indexOf(previousActiveMonth);
      if (nextIndex < 0) {
        const nearest = months.findIndex((month) => month >= previousActiveMonth);
        nextIndex = nearest >= 0 ? nearest : months.length - 1;
      }
      if (nextIndex === pager.activeIndexRef.current) return;
      pager.setActiveIndex(nextIndex);
      listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
    }, [months, pageWidth, pager]);

    const budgetsByMonth = useMemo(
      () => new Map(monthlyBudgets.map((budget) => [budget.month, budget])),
      [monthlyBudgets],
    );

    // One O(N) pass bucketing expenses by month, so the per-month summaries
    // below don't each rescan the full transaction list (months × N).
    const expensesByMonth = useMemo(() => {
      const map = new Map<string, TransactionWithRelations[]>();
      for (const transaction of transactions) {
        if (transaction.deletedAt || transaction.type !== 'expense') continue;
        const key = financialMonthKeyForIso(transaction.date, settings.firstDayOfMonth);
        const list = map.get(key);
        if (list) list.push(transaction);
        else map.set(key, [transaction]);
      }
      return map;
    }, [transactions, settings.firstDayOfMonth]);

    // Precomputed once per data change — renderItem runs per page swipe and
    // must not re-aggregate a month's transactions or rebuild display maps.
    const pageModelByMonth = useMemo(() => {
      const map = new Map<
        string,
        {
          summary: BudgetMonthSummary;
          /** Over-budget lines floated to the top for display. */
          orderedCategories: BudgetCategoryProgress[];
          /** Colors follow the frozen line order (stable across months from
           *  the same template). */
          colorByCategoryId: Map<string, string>;
        }
      >();
      for (const month of months) {
        const summary = buildBudgetMonthSummary({
          month,
          budget: budgetsByMonth.get(month) ?? null,
          transactions: expensesByMonth.get(month) ?? [],
          categories,
          firstDayOfMonth: settings.firstDayOfMonth,
        });
        if (!summary) continue;
        map.set(month, {
          summary,
          orderedCategories: [...summary.categories].sort(
            (a, b) => Number(b.isOver) - Number(a.isOver),
          ),
          colorByCategoryId: new Map(
            summary.categories.map((line, index) => [line.categoryId, chartCategoryColor(index)]),
          ),
        });
      }
      return map;
    }, [budgetsByMonth, categories, expensesByMonth, months, settings.firstDayOfMonth]);

    const categoriesById = useMemo(
      () => new Map(categories.map((category) => [category.id, category])),
      [categories],
    );

    // Tap-through to the transactions behind a line: a root includes its
    // subcategories' spend, a subcategory only its own, and `null` is the
    // uncategorized bucket. Unlike the breakdown pie, tapping a parent goes
    // straight to its transactions (no subcategory-selection stage).
    const openCategoryDrilldown = useCallback(
      (month: string, categoryId: string | null, includeChildren: boolean) => {
        const transactionIds = (expensesByMonth.get(month) ?? [])
          .filter((transaction) => {
            if (categoryId === null) return !transaction.categoryId;
            if (!transaction.categoryId) return false;
            if (!includeChildren) return transaction.categoryId === categoryId;
            const parentId = categoriesById.get(transaction.categoryId)?.parentId;
            return (parentId ?? transaction.categoryId) === categoryId;
          })
          .map((transaction) => transaction.id);
        const category = categoryId ? categoriesById.get(categoryId) : undefined;
        void triggerHaptic('selection');
        onOpenDrilldown({
          label: category?.name ?? I18n.t('common.uncategorized'),
          transactionIds,
          showTypeFilter: false,
          ...(includeChildren && category
            ? {
                categoryRootId: category.id,
                categoryRootLabel: category.name,
                categoryRootEmoji: category.icon,
                // Show the rolled-up transactions directly; skip the
                // subcategory picker the breakdown pie uses.
                showSubcategorySelection: false,
              }
            : {}),
        });
      },
      [categoriesById, expensesByMonth, onOpenDrilldown],
    );

    const activeMonth = months[pager.activeIndex] ?? months[months.length - 1];
    const monthLabel = monthKeyLabel(activeMonth, settings.locale);

    useEffect(() => {
      onActiveMonthLabelChange?.(monthLabel);
    }, [monthLabel, onActiveMonthLabelChange]);

    // Always route through the picker (even with one template) so the Custom
    // one-off option is always reachable.
    const handleCreateForMonth = useCallback(
      (month: string) => {
        if (budgetTemplates.length === 0) {
          onOpenTemplateEditor();
          return;
        }
        setPickerMonth(month);
      },
      [budgetTemplates.length, onOpenTemplateEditor],
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
        const model = pageModelByMonth.get(month) ?? null;

        if (!budget || !model) {
          return (
            <View style={{ width: pageWidth }} className="flex-1">
              <EmptyState
                title={I18n.t('budget.no_budget_title', {
                  month: monthKeyLabel(month, settings.locale),
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

        const { summary, orderedCategories, colorByCategoryId } = model;

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
                summary={summary}
                settings={settings}
                themeColors={themeColors}
                onEdit={() => onOpenBudgetEditor(budget.id)}
                onDelete={() => handleDeleteBudget(budget)}
              />

              {/* A budget can lose all its lines (category-delete cascade);
                  don't render an empty bordered shell. */}
              {orderedCategories.length > 0 ? (
                <View className="mt-4 overflow-hidden rounded-2xl border border-border/45 bg-card">
                  {orderedCategories.map((line, index) => (
                    <BudgetCategoryRow
                      key={line.categoryId}
                      line={line}
                      color={colorByCategoryId.get(line.categoryId) ?? themeColors.primary}
                      first={index === 0}
                      categoriesById={categoriesById}
                      settings={settings}
                      themeColors={themeColors}
                      onPress={() => openCategoryDrilldown(month, line.categoryId, true)}
                      onPressChild={(childId) => openCategoryDrilldown(month, childId, false)}
                    />
                  ))}
                </View>
              ) : null}

              {summary.countUnbudgeted && summary.unbudgeted.length > 0 ? (
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
                        onPress={() => openCategoryDrilldown(month, entry.categoryId, true)}
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
        categoriesById,
        handleCreateForMonth,
        handleDeleteBudget,
        listNavInset,
        onOpenBudgetEditor,
        openCategoryDrilldown,
        months,
        pageModelByMonth,
        pageWidth,
        settings,
        themeColors,
      ],
    );

    return (
      <>
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
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          className="flex-1"
        />

        <BudgetTemplatePickerSheet
          visible={pickerMonth != null}
          onClose={() => setPickerMonth(null)}
          templates={budgetTemplates}
          categories={categories}
          settings={settings}
          onSelect={(templateId) => {
            if (pickerMonth) {
              void triggerHaptic('success');
              createMonthlyBudget(pickerMonth, templateId);
            }
            setPickerMonth(null);
          }}
          onSelectCustom={() => {
            if (pickerMonth) onCreateCustomBudget(pickerMonth);
            setPickerMonth(null);
          }}
        />
      </>
    );
  },
);

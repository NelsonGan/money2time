import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react-native';
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
import { chartCategoryColor } from '~/constants/chartColors';
import type { ColorPalette } from '~/constants/designSystem';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { BudgetTemplatePickerSheet } from '~/features/budget/components/BudgetTemplatePickerSheet';
import {
  buildBudgetMonthSummary,
  computeBudgetPagerMonths,
} from '~/features/budget/lib/budgetMath';
import { money, usageColor } from '~/features/budget/lib/format';
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
  UserSettings,
} from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import {
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  parseMonthKey,
} from '~/utils/formatters';

interface BudgetScreenProps {
  onBack?: () => void;
  onOpenTemplates: () => void;
  onOpenTemplateEditor: (params?: { templateId?: string; duplicateFromId?: string }) => void;
  /** Opens the month-budget editor (edits that month only, not the template). */
  onOpenBudgetEditor: (budgetId: string) => void;
  /** Opens the month-budget creator for a one-off custom budget (no template). */
  onCreateCustomBudget: (month: string) => void;
  /** Opens the transactions drilldown for a tapped category. */
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  safeAreaEdges?: Edge[];
}

/** Month label for a 'YYYY-MM' key (keys are always locally generated). */
function monthKeyLabel(monthKey: string, locale: string | undefined): string {
  return formatMonthYearLabel(parseMonthKey(monthKey) ?? new Date(), locale);
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
  const ringColor = usageColor(summary.usageRatio, themeColors);

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      {/* Ring gauge (savings-rate style) + figures side by side. */}
      <View className="flex-row items-center gap-4 px-4 py-4">
        <SavingsRateRing
          size={92}
          strokeWidth={9}
          progress={Math.min(summary.usageRatio, 1)}
          color={ringColor}
          trackColor={withColorAlpha(ringColor, 0.15)}
        >
          <Text
            variant="bodyStrong"
            className="text-base"
            style={{ color: isOver ? themeColors.error : themeColors.text }}
          >
            {Math.round(summary.usageRatio * 100)}%
          </Text>
        </SavingsRateRing>

        <View className="min-w-0 flex-1">
          <Text variant="monoLg" numberOfLines={1}>
            {money(summary.totalSpent, settings)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
            / {money(summary.totalBudget, settings)}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            className="mt-2"
            style={{ color: isOver ? themeColors.error : ringColor }}
          >
            {isOver
              ? I18n.t('budget.summary_exceeded', { amount: money(summary.exceededBy, settings) })
              : I18n.t('budget.left', { amount: money(summary.remaining, settings) })}
          </Text>
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
        accessibilityLabel={category?.name ?? I18n.t('budget.uncategorized')}
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
            {category?.name ?? I18n.t('budget.uncategorized')}
          </Text>
          {/* Fixed columns so spent, the slash, and budgeted line up down the
              whole list instead of drifting with each amount's width. */}
          <Text
            variant="caption"
            numberOfLines={1}
            className="w-[82px] text-right"
            style={{ color: line.isOver ? themeColors.error : themeColors.mutedForeground }}
          >
            {money(line.spent, settings)}
          </Text>
          <Text variant="caption" tone="muted" className="shrink-0">
            /
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} className="w-[82px] text-right">
            {money(line.budgeted, settings)}
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

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category?.name ?? I18n.t('budget.uncategorized')}
      className={cn('px-4 py-3.5 active:bg-secondary/20', !first && 'border-t border-border/25')}
    >
      <View className="flex-row items-center gap-3">
        {/* Emoji chip tinted with the category's palette color. */}
        <View
          className="h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: withColorAlpha(color, 0.14) }}
        >
          <CategoryEmoji icon={category?.icon} size={17} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {category?.name ?? I18n.t('budget.uncategorized')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
            {money(line.spent, settings)} / {money(line.budgeted, settings)}
          </Text>
        </View>
        <View className="items-end gap-1">
          {/* Neutral status chip; only over-budget tints red. */}
          <View
            className={cn('rounded-full px-2.5 py-1', !line.isOver && 'bg-secondary/50')}
            style={
              line.isOver ? { backgroundColor: withColorAlpha(themeColors.error, 0.12) } : undefined
            }
          >
            <Text
              variant="caption"
              numberOfLines={1}
              tone={line.isOver ? undefined : 'muted'}
              style={line.isOver ? { color: themeColors.error } : undefined}
            >
              {line.isOver
                ? I18n.t('budget.over', { amount: money(Math.abs(line.remaining), settings) })
                : I18n.t('budget.left', { amount: money(line.remaining, settings) })}
            </Text>
          </View>
          <Text variant="caption" tone="muted" className="text-[10px]">
            {Math.round(line.usageRatio * 100)}%
          </Text>
        </View>
      </View>
      <View className="mt-2.5">
        <ProgressBar
          ratio={line.usageRatio}
          color={barColor}
          trackColor={withColorAlpha(barColor, 0.14)}
          height={5}
        />
      </View>

      {line.children.length > 0 ? (
        <View className="mt-2.5 gap-1.5 pl-2">
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
    </Pressable>
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
      accessibilityLabel={category?.name ?? I18n.t('budget.uncategorized')}
      className="flex-row items-center gap-2.5 rounded-2xl border border-border/30 bg-secondary/20 px-4 py-2.5 active:opacity-80"
    >
      <CategoryEmoji icon={category?.icon} size={16} />
      <Text variant="body" numberOfLines={1} className="flex-1">
        {category?.name ?? I18n.t('budget.uncategorized')}
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
  /** Render the built-in month prev/next row (the standalone screen). */
  showMonthControls?: boolean;
  /** Reports the active month's label so an embedding host (Insights) can
   *  drive the pager from its own header controls. */
  onActiveMonthLabelChange?: (label: string) => void;
}

/**
 * The budget month pager without any screen chrome: month pages (summary
 * ring card, per-category depletion, unbudgeted section) plus the
 * create-from-template picker. Hosted by the standalone BudgetScreen and
 * embedded as an insights page.
 */
export const BudgetPagerView = forwardRef<BudgetPagerViewHandle, BudgetPagerViewProps>(
  function BudgetPagerView(
    {
      onOpenTemplateEditor,
      onOpenBudgetEditor,
      onCreateCustomBudget,
      onOpenDrilldown,
      showMonthControls = false,
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
      const nextIndex = months.indexOf(previousActiveMonth);
      if (nextIndex < 0 || nextIndex === pager.activeIndexRef.current) return;
      pager.setActiveIndex(nextIndex);
      listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
    }, [months, pageWidth, pager]);

    const budgetsByMonth = useMemo(
      () => new Map(monthlyBudgets.map((budget) => [budget.month, budget])),
      [monthlyBudgets],
    );

    // Precomputed once per data change — renderItem runs per page swipe and
    // must not re-aggregate a month's transactions each time.
    const summariesByMonth = useMemo(
      () =>
        new Map(
          months.map((month) => [
            month,
            buildBudgetMonthSummary({
              month,
              budget: budgetsByMonth.get(month) ?? null,
              transactions,
              categories,
            }),
          ]),
        ),
      [budgetsByMonth, categories, months, transactions],
    );

    const categoriesById = useMemo(
      () => new Map(categories.map((category) => [category.id, category])),
      [categories],
    );

    // Tap-through to the transactions behind a line, mirroring the breakdown
    // pie: a root includes its subcategories' spend, a subcategory only its
    // own, and `null` is the uncategorized bucket.
    const openCategoryDrilldown = useCallback(
      (month: string, categoryId: string | null, includeChildren: boolean) => {
        const transactionIds = transactions
          .filter((transaction) => {
            if (transaction.deletedAt || transaction.type !== 'expense') return false;
            if (monthKeyFromIsoLocal(transaction.date) !== month) return false;
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
          label: category?.name ?? I18n.t('budget.uncategorized'),
          transactionIds,
          showTypeFilter: false,
          ...(includeChildren && category
            ? {
                categoryRootId: category.id,
                categoryRootLabel: category.name,
                categoryRootEmoji: category.icon,
              }
            : {}),
        });
      },
      [categoriesById, onOpenDrilldown, transactions],
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
        const summary = summariesByMonth.get(month) ?? null;

        if (!budget || !summary) {
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

        // Colors follow the frozen line order (stable across months from the
        // same template); over-budget lines then float to the top for display.
        const colorByCategoryId = new Map(
          summary.categories.map((line, index) => [line.categoryId, chartCategoryColor(index)]),
        );
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
                summary={summary}
                settings={settings}
                themeColors={themeColors}
                onEdit={() => onOpenBudgetEditor(budget.id)}
                onDelete={() => handleDeleteBudget(budget)}
              />

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
        pageWidth,
        settings,
        summariesByMonth,
        themeColors,
      ],
    );

    return (
      <>
        {showMonthControls ? (
          <MonthControlsHeader
            title=""
            monthLabel={monthLabel}
            onPrevMonth={() => pager.scrollToRelative(-1)}
            onNextMonth={() => pager.scrollToRelative(1)}
            hideTitleRow
            showAccent={false}
          />
        ) : null}

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

/** Standalone budget screen (widget deep link and direct navigation). */
export function BudgetScreen({
  onBack,
  onOpenTemplates,
  onOpenTemplateEditor,
  onOpenBudgetEditor,
  onCreateCustomBudget,
  onOpenDrilldown,
  safeAreaEdges = ['top'],
}: BudgetScreenProps) {
  const themeColors = useThemeColors();

  return (
    <SettingsPageLayout edges={safeAreaEdges}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('budget.title')}
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

      <BudgetPagerView
        showMonthControls
        onOpenTemplateEditor={onOpenTemplateEditor}
        onOpenBudgetEditor={onOpenBudgetEditor}
        onCreateCustomBudget={onCreateCustomBudget}
        onOpenDrilldown={onOpenDrilldown}
      />
    </SettingsPageLayout>
  );
}

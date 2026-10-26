import { ChevronLeft, Pencil, Trash2 } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, FlatList, Pressable, ScrollView, View } from 'react-native';

import { MonthYearWheelPicker } from '~/components/datePicker';
import { yearMonthFromKey, yearMonthToKey } from '~/components/datePicker/monthJump';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useContentFrame } from '~/components/layout/ContentFrame';
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
import {
  CreateBudgetRow,
  WeekStrip,
  YearBudgetRow,
} from '~/features/budget/components/BudgetPeriodRows';
import { BudgetTemplatePickerSheet } from '~/features/budget/components/BudgetTemplatePickerSheet';
import {
  type BudgetMonthPage,
  buildBudgetMonthPage,
  buildBudgetSummary,
  computeBudgetPagerMonths,
} from '~/features/budget/lib/budgetMath';
import {
  budgetDaysLeft,
  budgetPeriodKeyForDate,
  type BudgetPeriodRange,
  budgetPeriodRange,
  budgetRangeLength,
} from '~/features/budget/lib/budgetPeriods';
import {
  budgetPeriodLabel,
  money,
  monthKeyLabel,
  monthNameLabel,
  usageColor,
  usagePercentLabel,
} from '~/features/budget/lib/format';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import type { InsightsDrilldownPayload } from '~/features/insights/screens/InsightsDrilldownScreen';
import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type {
  BudgetCategoryProgress,
  BudgetPeriod,
  BudgetSummary,
  Category,
  PeriodBudget,
  TransactionWithRelations,
  UserSettings,
} from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { monthCycleOf } from '~/utils/financialMonth';
import {
  dateFromDayKeyLocal,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  normalizeMoneyAmount,
} from '~/utils/formatters';
import { asSpendingRow } from '~/utils/spending';

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
  daysLeft,
  settings,
  themeColors,
  onEdit,
  onDelete,
}: {
  summary: BudgetSummary;
  /** Days left in the period, today included; null unless the period is running. */
  daysLeft: number | null;
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
          {/* How long the rest has to last, and what that allows a day. */}
          {daysLeft != null && daysLeft > 0 ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="mt-1.5 text-[11px]">
              {I18n.t(daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other', {
                count: daysLeft,
              })}
              {!isOver && summary.remaining > 0
                ? ` · ${I18n.t('budget.per_day', {
                    amount: money(normalizeMoneyAmount(summary.remaining / daysLeft), settings),
                  })}`
                : ''}
            </Text>
          ) : null}
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
  /** Open the month wheel, for the host header's month label. */
  openMonthPicker: () => void;
}

interface BudgetPagerViewProps {
  onOpenTemplateEditor: (params?: {
    templateId?: string;
    duplicateFromId?: string;
    period?: BudgetPeriod;
  }) => void;
  onOpenBudgetEditor: (budgetId: string) => void;
  onCreateCustomBudget: (period: BudgetPeriod, periodKey: string) => void;
  /** Opens the transactions drilldown for a tapped category. */
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  /** Reports the active month's label so the embedding host (Insights) can
   *  drive the pager from its own header controls. */
  onActiveMonthLabelChange?: (label: string) => void;
}

/** A budget the page can show in its card and category list. */
interface FocusTarget {
  period: BudgetPeriod;
  key: string;
}

interface BudgetPageModel extends BudgetMonthPage {
  summaries: Map<string, { summary: BudgetSummary; range: BudgetPeriodRange }>;
}

const summaryId = (budget: PeriodBudget) => budget.id;

/**
 * The budget month pager without any screen chrome. Each month page shows
 * every budget that touches the month, with no period switch: the month's
 * own budget, a strip of its weeks, and the year's budget as a slim row.
 * One of them (the month's, else this or the first budgeted week, else the
 * year's) fills the summary card and category list; tapping a week or the
 * year shows that one instead. Embedded as an insights page.
 */
export const BudgetPagerView = forwardRef<BudgetPagerViewHandle, BudgetPagerViewProps>(
  function BudgetPagerViewImpl(
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
      periodBudgets,
      createPeriodBudget,
      deletePeriodBudget,
    } = useApp();
    const clock = useMemo(
      () => ({ weekStartsOn: settings.weekStartsOn, monthCycle: monthCycleOf(settings) }),
      [settings],
    );
    const { monthCycle } = clock;
    const { transactions } = useTransactions();
    const themeColors = useThemeColors();
    const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
    const { width: pageWidth } = useContentFrame();

    // A day key, so it only changes (and re-renders pages) when the day does.
    const todayKey = dayKeyFromDateLocal(new Date());

    const templatesByPeriod = useMemo(() => {
      const map: Record<BudgetPeriod, typeof budgetTemplates> = { week: [], month: [], year: [] };
      for (const template of budgetTemplates) map[template.period].push(template);
      return map;
    }, [budgetTemplates]);

    const [picker, setPicker] = useState<FocusTarget | null>(null);
    // The budget each page shows when the user tapped a week or the year.
    const [focusByMonth, setFocusByMonth] = useState<Record<string, FocusTarget>>({});

    const months = useMemo(
      () => computeBudgetPagerMonths({ budgets: periodBudgets, transactions, clock }),
      [clock, periodBudgets, transactions],
    );

    const currentMonthIndex = useMemo(() => {
      const index = months.indexOf(budgetPeriodKeyForDate('month', new Date(), clock));
      return index >= 0 ? index : Math.max(months.length - 2, 0);
    }, [clock, months]);

    const listRef = useRef<FlatList<number>>(null);
    const pager = useMonthPager({
      listRef,
      pageWidth,
      totalSlots: months.length,
      initialIndex: currentMonthIndex,
    });

    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    useImperativeHandle(
      ref,
      () => ({
        scrollToRelative: pager.scrollToRelative,
        openMonthPicker: () => setIsMonthPickerOpen(true),
      }),
      [pager.scrollToRelative],
    );

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

    // One O(N) pass bucketing expenses by day, so each budget below collects
    // only its own days instead of rescanning the full transaction list.
    const expensesByDay = useMemo(() => {
      const map = new Map<string, TransactionWithRelations[]>();
      for (const raw of transactions) {
        // A counted loan repayment depletes its budget line like any other
        // expense: reshaped here so `buildBudgetSummary` needs no notion of
        // transfers at all.
        const transaction = asSpendingRow(raw);
        if (transaction.deletedAt || transaction.type !== 'expense') continue;
        // A reimbursable expense does not deplete a budget when the user has
        // set reimbursements not to count as spending.
        if (!countsTowardSpending(transaction, settings.reimbursementsCountAsExpense)) continue;
        const key = dayKeyFromIsoLocal(transaction.date);
        const list = map.get(key);
        if (list) list.push(transaction);
        else map.set(key, [transaction]);
      }
      return map;
    }, [transactions, settings.reimbursementsCountAsExpense]);

    const expensesInRange = useCallback(
      (range: BudgetPeriodRange) => {
        const out: TransactionWithRelations[] = [];
        const end = dateFromDayKeyLocal(range.end);
        for (
          let day = dateFromDayKeyLocal(range.start);
          day <= end;
          day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
        ) {
          const list = expensesByDay.get(dayKeyFromDateLocal(day));
          if (list) out.push(...list);
        }
        return out;
      },
      [expensesByDay],
    );

    // Precomputed once per data change: every budget's summary (a budget
    // can appear on several pages, a year on twelve), then each page's model.
    const pageModelByMonth = useMemo(() => {
      const summaries: BudgetPageModel['summaries'] = new Map();
      for (const budget of periodBudgets) {
        const range = budgetPeriodRange(budget.period, budget.periodKey, monthCycle);
        const summary = buildBudgetSummary({
          budget,
          transactions: expensesInRange(range),
          categories,
          monthCycle,
        });
        if (summary) summaries.set(summaryId(budget), { summary, range });
      }
      const map = new Map<string, BudgetPageModel>();
      for (const month of months) {
        map.set(month, {
          ...buildBudgetMonthPage({ monthKey: month, budgets: periodBudgets, clock }),
          summaries,
        });
      }
      return map;
    }, [categories, clock, expensesInRange, monthCycle, months, periodBudgets]);

    const categoriesById = useMemo(
      () => new Map(categories.map((category) => [category.id, category])),
      [categories],
    );

    // Tap-through to the transactions behind a line: a root includes its
    // subcategories' spend, a subcategory only its own, and `null` is the
    // uncategorized bucket. Unlike the breakdown pie, tapping a parent goes
    // straight to its transactions (no subcategory-selection stage).
    const openCategoryDrilldown = useCallback(
      (range: BudgetPeriodRange, categoryId: string | null, includeChildren: boolean) => {
        const transactionIds = expensesInRange(range)
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
      [categoriesById, expensesInRange, onOpenDrilldown],
    );

    const activeMonth = months[pager.activeIndex] ?? months[months.length - 1];
    const monthLabel = monthKeyLabel(activeMonth, settings.locale);
    const activeYearMonth = yearMonthFromKey(activeMonth);

    useEffect(() => {
      onActiveMonthLabelChange?.(monthLabel);
    }, [monthLabel, onActiveMonthLabelChange]);

    // Always route through the picker (even with one template) so the Custom
    // one-off option is always reachable. With no template of that period,
    // a new template starts on it.
    const handleCreate = useCallback(
      (target: FocusTarget) => {
        if (templatesByPeriod[target.period].length === 0) {
          onOpenTemplateEditor({ period: target.period });
          return;
        }
        setPicker(target);
      },
      [onOpenTemplateEditor, templatesByPeriod],
    );

    const handleDeleteBudget = useCallback(
      (budget: PeriodBudget) => {
        void triggerHaptic('warning');
        Alert.alert(
          I18n.t(`budget.delete_budget_title_${budget.period}`),
          I18n.t(`budget.delete_budget_message_${budget.period}`),
          [
            { text: I18n.t('common.cancel'), style: 'cancel' },
            {
              text: I18n.t('common.delete'),
              style: 'destructive',
              onPress: () => deletePeriodBudget(budget.id),
            },
          ],
        );
      },
      [deletePeriodBudget],
    );

    const setFocus = useCallback((month: string, target: FocusTarget | null) => {
      setFocusByMonth((previous) => {
        const next = { ...previous };
        if (target) next[month] = target;
        else delete next[month];
        return next;
      });
    }, []);

    const renderMonthPage = useCallback(
      ({ item: slotIndex }: { item: number }) => {
        const month = months[slotIndex];
        const model = pageModelByMonth.get(month);
        if (!model) return <View style={{ width: pageWidth }} />;

        const budgetFor = (target: FocusTarget): PeriodBudget | null => {
          if (target.period === 'month') return model.month;
          if (target.period === 'year') return model.year;
          return model.weeks.find((week) => week.key === target.key)?.budget ?? null;
        };
        const thisWeek = model.weeks.find(
          (week) => week.budget && week.key <= todayKey && todayKey <= addDaysKey(week.key, 6),
        );
        const firstBudgetedWeek = thisWeek ?? model.weeks.find((week) => week.budget);
        const defaultFocus: FocusTarget | null = model.month
          ? { period: 'month', key: month }
          : firstBudgetedWeek
            ? { period: 'week', key: firstBudgetedWeek.key }
            : model.year
              ? { period: 'year', key: model.yearKey }
              : null;
        const chosen = focusByMonth[month];
        const focus = chosen && budgetFor(chosen) ? chosen : defaultFocus;
        const focusBudget = focus ? budgetFor(focus) : null;
        const focusModel = focusBudget ? model.summaries.get(summaryId(focusBudget)) : undefined;

        const showWeeks =
          templatesByPeriod.week.length > 0 || model.weeks.some((week) => week.budget);
        const yearModel = model.year ? model.summaries.get(summaryId(model.year)) : undefined;
        const showMonthCreate = !model.month && templatesByPeriod.month.length > 0;
        const showYearCreate = !model.year && templatesByPeriod.year.length > 0;

        // Nothing touches this month: the familiar empty state.
        if (!focusModel && !showWeeks && !showYearCreate) {
          return (
            <View style={{ width: pageWidth }} className="flex-1">
              <EmptyState
                title={I18n.t('budget.no_budget_title', {
                  month: monthKeyLabel(month, settings.locale),
                })}
                message={
                  budgetTemplates.length === 0
                    ? I18n.t('budget.no_templates_message_month')
                    : I18n.t('budget.no_budget_message_month')
                }
                mascotMood="curious"
                animateIn={false}
                action={{
                  label:
                    budgetTemplates.length === 0
                      ? I18n.t('budget.create_template')
                      : I18n.t('budget.create_budget'),
                  onPress: () => handleCreate({ period: 'month', key: month }),
                }}
              />
            </View>
          );
        }

        const focusLabel =
          focus && focusBudget
            ? budgetPeriodLabel(focus.period, focusBudget.periodKey, settings.locale, monthCycle)
            : null;
        const showBackToMonth = model.month != null && focus?.period !== 'month';
        const isRunning =
          focusModel != null &&
          focusModel.range.start <= todayKey &&
          todayKey <= focusModel.range.end;
        const orderedCategories = focusModel
          ? [...focusModel.summary.categories].sort((a, b) => Number(b.isOver) - Number(a.isOver))
          : [];
        // Colors follow the frozen line order (stable across periods from the
        // same template).
        const colorByCategoryId = new Map(
          (focusModel?.summary.categories ?? []).map((line, index) => [
            line.categoryId,
            chartCategoryColor(index),
          ]),
        );
        const yearElapsedRatio =
          yearModel && yearModel.range.start <= todayKey && todayKey <= yearModel.range.end
            ? 1 -
              budgetDaysLeft(yearModel.range, dateFromDayKeyLocal(todayKey)) /
                budgetRangeLength(yearModel.range)
            : null;

        return (
          <View style={{ width: pageWidth }} className="flex-1">
            <ScrollView
              contentContainerStyle={[
                { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
                listNavInset,
              ]}
              showsVerticalScrollIndicator={false}
            >
              {showMonthCreate ? (
                <CreateBudgetRow
                  label={monthKeyLabel(month, settings.locale)}
                  className="mb-3"
                  themeColors={themeColors}
                  onPress={() => handleCreate({ period: 'month', key: month })}
                />
              ) : null}

              {focus && focusBudget && focusModel ? (
                <>
                  {/* Which budget the card shows: it can be the month's, a
                      week's or the year's, so it is always named. */}
                  <View className="mb-2 flex-row items-center gap-2 px-1">
                    <Text
                      variant="label"
                      tone="muted"
                      numberOfLines={1}
                      className="flex-1 uppercase"
                    >
                      {focusBudget.templateName
                        ? `${focusLabel} · ${focusBudget.templateName}`
                        : focusLabel}
                    </Text>
                    {showBackToMonth ? (
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setFocus(month, null);
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('budget.back_to', {
                          label: monthKeyLabel(month, settings.locale),
                        })}
                        className="shrink-0 flex-row items-center gap-0.5 rounded-full bg-secondary/40 py-1 pl-1.5 pr-2.5 active:opacity-70"
                      >
                        <ChevronLeft size={13} color={themeColors.primary} />
                        <Text variant="caption" className="text-[11px] text-primary">
                          {monthNameLabel(month, settings.locale)}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <BudgetSummaryCard
                    summary={focusModel.summary}
                    daysLeft={
                      isRunning
                        ? budgetDaysLeft(focusModel.range, dateFromDayKeyLocal(todayKey))
                        : null
                    }
                    settings={settings}
                    themeColors={themeColors}
                    onEdit={() => onOpenBudgetEditor(focusBudget.id)}
                    onDelete={() => handleDeleteBudget(focusBudget)}
                  />
                </>
              ) : null}

              {showWeeks ? (
                <WeekStrip
                  weeks={model.weeks.map((week) => ({
                    ...week,
                    summary: week.budget
                      ? (model.summaries.get(summaryId(week.budget))?.summary ?? null)
                      : null,
                  }))}
                  todayKey={todayKey}
                  selectedKey={focus?.period === 'week' ? focus.key : null}
                  canCreate={templatesByPeriod.week.length > 0}
                  settings={settings}
                  themeColors={themeColors}
                  onSelect={(key) =>
                    setFocus(
                      month,
                      focus?.period === 'week' && focus.key === key
                        ? null
                        : { period: 'week', key },
                    )
                  }
                  onCreate={(key) => handleCreate({ period: 'week', key })}
                />
              ) : null}

              {model.year && yearModel ? (
                <YearBudgetRow
                  budget={model.year}
                  summary={yearModel.summary}
                  label={model.yearKey}
                  yearElapsedRatio={yearElapsedRatio}
                  selected={focus?.period === 'year'}
                  settings={settings}
                  themeColors={themeColors}
                  onPress={() =>
                    setFocus(
                      month,
                      focus?.period === 'year' ? null : { period: 'year', key: model.yearKey },
                    )
                  }
                />
              ) : showYearCreate ? (
                <CreateBudgetRow
                  label={model.yearKey}
                  className="mt-3"
                  themeColors={themeColors}
                  onPress={() => handleCreate({ period: 'year', key: model.yearKey })}
                />
              ) : null}

              {/* A budget can lose all its lines (category-delete cascade);
                  don't render an empty bordered shell. */}
              {focusModel && orderedCategories.length > 0 ? (
                <View className="mt-5 overflow-hidden rounded-2xl border border-border/45 bg-card">
                  {orderedCategories.map((line, index) => (
                    <BudgetCategoryRow
                      key={line.categoryId}
                      line={line}
                      color={colorByCategoryId.get(line.categoryId) ?? themeColors.primary}
                      first={index === 0}
                      categoriesById={categoriesById}
                      settings={settings}
                      themeColors={themeColors}
                      onPress={() => openCategoryDrilldown(focusModel.range, line.categoryId, true)}
                      onPressChild={(childId) =>
                        openCategoryDrilldown(focusModel.range, childId, false)
                      }
                    />
                  ))}
                </View>
              ) : null}

              {focusModel?.summary.countUnbudgeted && focusModel.summary.unbudgeted.length > 0 ? (
                <View className="mt-5">
                  <Text variant="label" tone="muted" className="mb-2 px-1 uppercase">
                    {I18n.t('budget.unbudgeted_section')}
                  </Text>
                  <View className="gap-2">
                    {focusModel.summary.unbudgeted.map((entry) => (
                      <UnbudgetedRow
                        key={entry.categoryId ?? '__uncategorized__'}
                        categoryId={entry.categoryId}
                        spent={entry.spent}
                        categoriesById={categoriesById}
                        settings={settings}
                        onPress={() =>
                          openCategoryDrilldown(focusModel.range, entry.categoryId, true)
                        }
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
        budgetTemplates.length,
        categoriesById,
        focusByMonth,
        handleCreate,
        handleDeleteBudget,
        listNavInset,
        monthCycle,
        months,
        onOpenBudgetEditor,
        openCategoryDrilldown,
        pageModelByMonth,
        pageWidth,
        setFocus,
        settings,
        templatesByPeriod,
        themeColors,
        todayKey,
      ],
    );

    return (
      <>
        <FlatList
          ref={listRef}
          data={pager.slots}
          renderItem={renderMonthPage}
          extraData={focusByMonth}
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

        <MonthYearWheelPicker
          visible={isMonthPickerOpen}
          year={activeYearMonth.year}
          monthIndex={activeYearMonth.monthIndex}
          // The pager only holds the months that have a budget or spending, so
          // the wheel stops at the same ends.
          min={yearMonthFromKey(months[0])}
          max={yearMonthFromKey(months[months.length - 1])}
          locale={settings.locale}
          onSelect={(year, monthIndex) => {
            setIsMonthPickerOpen(false);
            const key = yearMonthToKey({ year, monthIndex });
            const exact = months.indexOf(key);
            const next = exact >= 0 ? exact : months.findIndex((month) => month >= key);
            pager.jumpToIndex(next >= 0 ? next : months.length - 1);
          }}
          onClose={() => setIsMonthPickerOpen(false)}
        />

        <BudgetTemplatePickerSheet
          visible={picker != null}
          onClose={() => setPicker(null)}
          templates={picker ? templatesByPeriod[picker.period] : []}
          period={picker?.period ?? 'month'}
          categories={categories}
          settings={settings}
          onSelect={(templateId) => {
            if (picker) {
              void triggerHaptic('success');
              createPeriodBudget(picker.key, templateId);
            }
            setPicker(null);
          }}
          onSelectCustom={() => {
            if (picker) onCreateCustomBudget(picker.period, picker.key);
            setPicker(null);
          }}
        />
      </>
    );
  },
);

function addDaysKey(dayKey: string, days: number): string {
  const date = dateFromDayKeyLocal(dayKey);
  return dayKeyFromDateLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

import { CalendarDays, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react-native';
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
import { CreateBudgetRow, WeekChips } from '~/features/budget/components/BudgetPeriodRows';
import {
  type BudgetRing,
  budgetRingColor,
  BudgetRings,
} from '~/features/budget/components/BudgetRings';
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
} from '~/features/budget/lib/budgetPeriods';
import {
  budgetPeriodLabel,
  budgetPeriodName,
  money,
  monthKeyLabel,
  monthNameLabel,
  usageColor,
  usagePercentLabel,
} from '~/features/budget/lib/format';
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
import { dateFromDayKeyLocal, dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';
import { asSpendingRow } from '~/utils/spending';

/** "RM180 left" / "RM40 over". */
function leftLabel(remaining: number, settings: UserSettings): string {
  return remaining < 0
    ? I18n.t('budget.over', { amount: money(Math.abs(remaining), settings) })
    : I18n.t('budget.left', { amount: money(remaining, settings) });
}

/** How full a line's bar is: its usage, or full once over (a zero-budget
 *  overspend has a usage ratio of 0). */
function lineFill(line: BudgetCategoryProgress): number {
  return line.isOver ? 1 : Math.max(0, Math.min(line.usageRatio, 1));
}

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
  const name = category?.name ?? I18n.t('common.uncategorized');
  const fillColor = line.isOver ? themeColors.error : color;
  const fillPct = lineFill(line) * 100;

  return (
    <View className="flex-row items-center gap-2">
      {/* Tree elbow tying the subcategory to its parent row. */}
      <View className="h-4 w-3.5 self-start rounded-bl-lg border-b border-l border-border/50" />
      {/* One-line pill: the tinted fill behind the content IS the progress bar. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${leftLabel(line.remaining, settings)}`}
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
            {name}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            className="shrink-0 text-right"
            // Muted while healthy, amber from 80%, red when over.
            style={{
              color: line.isOver
                ? themeColors.error
                : line.usageRatio >= 0.8
                  ? usageColor(line.usageRatio, themeColors)
                  : themeColors.mutedForeground,
            }}
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
  /** Chart palette colour, by the line's place in the budget. */
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
  const name = category?.name ?? I18n.t('common.uncategorized');
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
        accessibilityLabel={`${name}, ${leftLabel(line.remaining, settings)}, ${usagePercentLabel(line.usageRatio)}`}
        className={cn('px-4 py-3 active:bg-secondary/20', line.children.length > 0 && 'pb-2')}
      >
        {/* Emoji inline with the title, then a full-width depletion bar with
            the spent/total figures and usage badge beneath it — the bar spans
            the whole row so its length is comparable across categories. */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <CategoryEmoji icon={category?.icon} size={20} />
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
              {name}
            </Text>
            <Text
              variant="caption"
              numberOfLines={1}
              className="shrink-0 text-[11px]"
              tone={line.isOver ? undefined : 'muted'}
              style={line.isOver ? { color: themeColors.error } : undefined}
            >
              {leftLabel(line.remaining, settings)}
            </Text>
          </View>
          <View className="gap-1">
            <ProgressBar
              ratio={lineFill(line)}
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

/**
 * Spending outside the budget's lines, folded into one total row; tapping it
 * lists the categories (each opening its transactions).
 */
function UnbudgetedGroup({
  entries,
  total,
  categoriesById,
  settings,
  themeColors,
  onPressCategory,
}: {
  entries: { categoryId: string | null; spent: number }[];
  total: number;
  categoriesById: Map<string, Category>;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPressCategory: (categoryId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-3 overflow-hidden rounded-2xl border border-border/45 bg-card">
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2.5 px-4 py-3 active:bg-secondary/20"
      >
        <Text variant="body" tone="muted" numberOfLines={1} className="flex-1">
          {I18n.t('budget.unbudgeted_section')}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {money(total, settings)}
        </Text>
        {open ? (
          <ChevronUp size={16} color={themeColors.textMuted} />
        ) : (
          <ChevronDown size={16} color={themeColors.textMuted} />
        )}
      </Pressable>
      {open
        ? entries.map((entry) => {
            const category = entry.categoryId ? categoriesById.get(entry.categoryId) : undefined;
            const name = category?.name ?? I18n.t('common.uncategorized');
            return (
              <Pressable
                key={entry.categoryId ?? '__uncategorized__'}
                onPress={() => onPressCategory(entry.categoryId)}
                accessibilityRole="button"
                accessibilityLabel={name}
                className="flex-row items-center gap-2.5 border-t border-border/25 px-4 py-2.5 active:bg-secondary/20"
              >
                <CategoryEmoji icon={category?.icon} size={16} />
                <Text variant="body" numberOfLines={1} className="flex-1">
                  {name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {money(entry.spent, settings)}
                </Text>
              </Pressable>
            );
          })
        : null}
    </View>
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

/** What the user picked on one month's page. */
interface PageView {
  period?: BudgetPeriod;
  /** The week (its first day) on the inner ring. */
  week?: string;
}

/**
 * The budget month pager without any screen chrome. Each month page draws
 * the year, month and week budgets that touch the month as nested rings.
 * One of them (the month's, else the running or latest budgeted week, else
 * the year's) is in focus: its header, amount and category list fill the
 * page, and tapping another ring focuses that one. Embedded as an insights
 * page.
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
    // Per page, the ring the user focused and the week they picked, kept
    // apart so a picked week stays on the inner ring while another is focused.
    const [viewByMonth, setViewByMonth] = useState<Record<string, PageView>>({});

    // Kept as the same array while its months are unchanged, so an edit that
    // does not move the pager's ends doesn't rebuild every page.
    const monthsRef = useRef<string[]>([]);
    const months = useMemo(() => {
      const next = computeBudgetPagerMonths({ budgets: periodBudgets, transactions, clock });
      const previous = monthsRef.current;
      if (next.length === previous.length && next.every((month, i) => month === previous[i])) {
        return previous;
      }
      monthsRef.current = next;
      return next;
    }, [clock, periodBudgets, transactions]);

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

    // Every budget's summary, by budget id, computed once per data change (a
    // budget can appear on several pages, a year on twelve).
    const summaries = useMemo(() => {
      const map = new Map<string, { summary: BudgetSummary; range: BudgetPeriodRange }>();
      for (const budget of periodBudgets) {
        const range = budgetPeriodRange(budget.period, budget.periodKey, monthCycle);
        const summary = buildBudgetSummary({
          budget,
          transactions: expensesInRange(range),
          categories,
          monthCycle,
        });
        if (summary) map.set(budget.id, { summary, range });
      }
      return map;
    }, [categories, expensesInRange, monthCycle, periodBudgets]);

    const pageByMonth = useMemo(
      () =>
        new Map<string, BudgetMonthPage>(
          months.map((month) => [
            month,
            buildBudgetMonthPage({ monthKey: month, budgets: periodBudgets, clock }),
          ]),
        ),
      [clock, months, periodBudgets],
    );

    // The running week's key, for the "No budget for this week" row.
    const todayWeekKey = budgetPeriodKeyForDate('week', dateFromDayKeyLocal(todayKey), clock);

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

    const updateView = useCallback((month: string, change: PageView) => {
      setViewByMonth((previous) => ({ ...previous, [month]: { ...previous[month], ...change } }));
    }, []);

    const renderMonthPage = useCallback(
      ({ item: slotIndex }: { item: number }) => {
        const month = months[slotIndex];
        const model = pageByMonth.get(month);
        if (!model) return <View style={{ width: pageWidth }} />;

        const weekBudget = (key: string | undefined) =>
          (key && model.weeks.find((week) => week.key === key)?.budget) || null;
        const thisWeek = model.weeks.find((week) => {
          const range = week.budget && summaries.get(week.budget.id)?.range;
          return range && range.start <= todayKey && todayKey <= range.end;
        });
        // The week the inner ring shows when none is picked: the running one,
        // else the month's latest budgeted week.
        const defaultWeek =
          thisWeek ?? [...model.weeks].reverse().find((week) => week.budget) ?? null;
        const view = viewByMonth[month] ?? {};
        // The inner ring's week: the one picked here, else the default.
        const ringWeekKey = weekBudget(view.week) ? view.week! : (defaultWeek?.key ?? null);
        const ringWeek = weekBudget(ringWeekKey ?? undefined);
        const budgetOf = (period: BudgetPeriod) =>
          period === 'month' ? model.month : period === 'year' ? model.year : ringWeek;
        // The focused ring: the one tapped here, else the month's, the week's,
        // then the year's, whichever has a budget.
        const focusPeriod =
          view.period && budgetOf(view.period)
            ? view.period
            : (['month', 'week', 'year'] as const).find((period) => budgetOf(period));
        const focusBudget = focusPeriod ? budgetOf(focusPeriod) : null;
        const focus: FocusTarget | null =
          focusPeriod && focusBudget ? { period: focusPeriod, key: focusBudget.periodKey } : null;
        const focusModel = focusBudget ? summaries.get(focusBudget.id) : undefined;

        const showWeekCreate =
          templatesByPeriod.week.length > 0 && !model.weeks.some((week) => week.budget);
        // The week the "No budget for …" row offers: the running one when it
        // is on this page, else the month's first.
        const createWeekKey = model.weeks.some((week) => week.key === todayWeekKey)
          ? todayWeekKey
          : model.weeks[0]?.key;
        const yearModel = model.year ? summaries.get(model.year.id) : undefined;
        const monthModel = model.month ? summaries.get(model.month.id) : undefined;
        const weekModel = ringWeek ? summaries.get(ringWeek.id) : undefined;
        const showMonthCreate = !model.month && templatesByPeriod.month.length > 0;
        const showYearCreate = !model.year && templatesByPeriod.year.length > 0;

        // Nothing touches this month: the familiar empty state.
        if (!focusModel && !showWeekCreate && !showYearCreate) {
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
            ? focus.period === 'month'
              ? monthNameLabel(month, settings.locale)
              : budgetPeriodLabel(focus.period, focusBudget.periodKey, settings.locale, monthCycle)
            : null;
        const isRunning =
          focusModel != null &&
          focusModel.range.start <= todayKey &&
          todayKey <= focusModel.range.end;
        const orderedCategories = focusModel
          ? [...focusModel.summary.categories].sort((a, b) => Number(b.isOver) - Number(a.isOver))
          : [];
        // Palette colours by the budget's own line order (before the over-first
        // sort), so a category keeps its colour as it goes over.
        const colorByCategoryId = new Map(
          (focusModel?.summary.categories ?? []).map((line, index) => [
            line.categoryId,
            chartCategoryColor(index),
          ]),
        );
        const rings: BudgetRing[] = [
          { period: 'year' as const, model: yearModel },
          { period: 'month' as const, model: monthModel },
          { period: 'week' as const, model: weekModel },
        ].flatMap(({ period, model: ringModel }) =>
          ringModel
            ? [
                {
                  period,
                  usageRatio: ringModel.summary.usageRatio,
                  percentLabel: usagePercentLabel(ringModel.summary.usageRatio),
                  isOver: ringModel.summary.remaining < 0,
                },
              ]
            : [],
        );
        const daysLeft =
          isRunning && focusModel
            ? budgetDaysLeft(focusModel.range, dateFromDayKeyLocal(todayKey))
            : null;
        const weekChoices = model.weeks.filter((week) => week.budget);
        const focusColor = focus ? budgetRingColor(focus.period, themeColors) : themeColors.primary;
        const remaining = focusModel?.summary.remaining ?? 0;

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
                <View className="rounded-3xl border border-border/45 bg-card px-4 pb-4 pt-3">
                  {/* Which budget is in focus, and its edit and delete. */}
                  <View className="flex-row items-center gap-1.5">
                    {/* The budget's icon on its ring's colour, its name, and a
                        pill naming the period it covers. */}
                    <View
                      className="h-10 w-10 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: withColorAlpha(focusColor, 0.14),
                      }}
                    >
                      {focusBudget.templateEmoji ? (
                        <CategoryEmoji icon={focusBudget.templateEmoji} size={22} />
                      ) : (
                        <CalendarDays size={18} color={focusColor} />
                      )}
                    </View>
                    <View className="ml-1.5 min-w-0 flex-1">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {focusBudget.templateName ?? budgetPeriodName(focus.period)}
                      </Text>
                      {/* The period, and how long it still runs, beside it. */}
                      <View className="mt-1 flex-row items-center gap-1.5">
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: withColorAlpha(focusColor, 0.12),
                          }}
                        >
                          <Text
                            variant="caption"
                            numberOfLines={1}
                            className="text-[11px]"
                            style={{ color: focusColor }}
                          >
                            {focusLabel}
                          </Text>
                        </View>
                        {daysLeft != null && daysLeft > 0 ? (
                          <Text
                            variant="caption"
                            tone="muted"
                            numberOfLines={1}
                            className="shrink text-[11px]"
                          >
                            {I18n.t(
                              daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other',
                              { count: daysLeft },
                            )}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Pressable
                      onPress={() => onOpenBudgetEditor(focusBudget.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('budget.edit_budget')}
                      className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
                    >
                      <Pencil size={14} color={themeColors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteBudget(focusBudget)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('budget.delete_budget')}
                      className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
                    >
                      <Trash2 size={14} color={themeColors.textMuted} />
                    </Pressable>
                  </View>

                  <View className="mt-3">
                    <BudgetRings
                      rings={rings}
                      focused={focus.period}
                      size={150}
                      themeColors={themeColors}
                      onFocus={(period) => updateView(month, { period })}
                    >
                      {/* Just the amount: green while some is left, red with a
                          minus sign once over. */}
                      <Text
                        variant="monoLg"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        accessibilityLabel={leftLabel(remaining, settings)}
                        className="text-[26px] leading-[32px] self-start"
                        style={{
                          color: remaining < 0 ? themeColors.error : themeColors.success,
                        }}
                      >
                        {remaining < 0
                          ? `-${money(-remaining, settings)}`
                          : money(remaining, settings)}
                      </Text>
                    </BudgetRings>
                  </View>

                  {/* With the week in focus, its siblings in the month to pick from. */}
                  {focus.period === 'week' && weekChoices.length > 1 ? (
                    <WeekChips
                      weeks={weekChoices.map((week) => week.key)}
                      selectedKey={focus.key}
                      todayKey={todayKey}
                      settings={settings}
                      onSelect={(key) => updateView(month, { week: key })}
                    />
                  ) : null}
                </View>
              ) : null}

              {showWeekCreate && createWeekKey ? (
                <CreateBudgetRow
                  label={budgetPeriodLabel('week', createWeekKey, settings.locale, monthCycle)}
                  className="mt-3"
                  themeColors={themeColors}
                  onPress={() => handleCreate({ period: 'week', key: createWeekKey })}
                />
              ) : null}
              {showYearCreate ? (
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
                      onPress={() => openCategoryDrilldown(focusModel.range, line.categoryId, true)}
                      onPressChild={(childId) =>
                        openCategoryDrilldown(focusModel.range, childId, false)
                      }
                    />
                  ))}
                </View>
              ) : null}

              {focusModel?.summary.countUnbudgeted && focusModel.summary.unbudgeted.length > 0 ? (
                <UnbudgetedGroup
                  entries={focusModel.summary.unbudgeted}
                  total={focusModel.summary.unbudgetedSpent}
                  categoriesById={categoriesById}
                  settings={settings}
                  themeColors={themeColors}
                  onPressCategory={(categoryId) =>
                    openCategoryDrilldown(focusModel.range, categoryId, true)
                  }
                />
              ) : null}
            </ScrollView>
          </View>
        );
      },
      [
        budgetTemplates.length,
        categoriesById,
        handleCreate,
        handleDeleteBudget,
        listNavInset,
        monthCycle,
        months,
        onOpenBudgetEditor,
        openCategoryDrilldown,
        pageByMonth,
        pageWidth,
        updateView,
        viewByMonth,
        settings,
        summaries,
        templatesByPeriod,
        themeColors,
        todayKey,
        todayWeekKey,
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

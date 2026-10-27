import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Trash2,
} from 'lucide-react-native';
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

/** Green while healthy, amber from 80%, red when over (isOver wins, so a
 *  zero-budget overspend still reads red). */
function healthOf(line: { usageRatio: number; remaining: number }, themeColors: ColorPalette) {
  return line.remaining < 0 ? themeColors.error : usageColor(line.usageRatio, themeColors);
}

/** "RM180 left" / "RM40 over". */
function leftLabel(remaining: number, settings: UserSettings): string {
  return remaining < 0
    ? I18n.t('budget.over', { amount: money(Math.abs(remaining), settings) })
    : I18n.t('budget.left', { amount: money(remaining, settings) });
}

/**
 * One budget line on one row: emoji, name and what is left (amber when it
 * runs low, red when over), opening its transactions.
 */
function BudgetLineRow({
  line,
  category,
  indent,
  first,
  settings,
  themeColors,
  onPress,
}: {
  line: BudgetCategoryProgress;
  category: Category | undefined;
  /** A subcategory line, nested under its parent. */
  indent: boolean;
  /** The card's first row, which needs no divider above it. */
  first: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  const color = healthOf(line, themeColors);
  const name = category?.name ?? I18n.t('common.uncategorized');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${leftLabel(line.remaining, settings)}`}
      className={cn(
        'flex-row items-center gap-3 pr-3',
        !first && 'border-t border-border/25',
        indent ? 'py-2.5 pl-12' : 'py-3.5 pl-4',
        'active:bg-secondary/20',
      )}
    >
      {indent ? (
        category?.icon ? (
          <CategoryEmoji icon={category.icon} size={13} />
        ) : null
      ) : (
        <CategoryEmoji icon={category?.icon} size={22} />
      )}
      <Text variant={indent ? 'caption' : 'body'} numberOfLines={1} className="min-w-0 flex-1">
        {name}
      </Text>
      <Text
        variant={indent ? 'caption' : 'body'}
        numberOfLines={1}
        className="shrink-0 text-right"
        // Plain while healthy; the colour only speaks up when it matters.
        style={{ color: line.usageRatio >= 0.8 || line.remaining < 0 ? color : themeColors.text }}
      >
        {leftLabel(line.remaining, settings)}
      </Text>
      <ChevronRight size={16} color={themeColors.textMuted} />
    </Pressable>
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
        // The week the inner ring shows when none is picked: the running one,
        // else the month's latest budgeted week.
        const defaultWeek =
          thisWeek ?? [...model.weeks].reverse().find((week) => week.budget) ?? null;
        const defaultFocus: FocusTarget | null = model.month
          ? { period: 'month', key: month }
          : defaultWeek
            ? { period: 'week', key: defaultWeek.key }
            : model.year
              ? { period: 'year', key: model.yearKey }
              : null;
        const chosen = focusByMonth[month];
        const focus = chosen && budgetFor(chosen) ? chosen : defaultFocus;
        // A picked week stays on the inner ring after focus moves elsewhere.
        const ringWeekKey =
          (chosen?.period === 'week' && budgetFor(chosen) ? chosen.key : null) ??
          defaultWeek?.key ??
          null;
        const focusBudget = focus ? budgetFor(focus) : null;
        const focusModel = focusBudget ? model.summaries.get(summaryId(focusBudget)) : undefined;

        const showWeekCreate =
          templatesByPeriod.week.length > 0 && !model.weeks.some((week) => week.budget);
        const yearModel = model.year ? model.summaries.get(summaryId(model.year)) : undefined;
        const monthModel = model.month ? model.summaries.get(summaryId(model.month)) : undefined;
        const ringWeek = ringWeekKey
          ? (model.weeks.find((week) => week.key === ringWeekKey)?.budget ?? null)
          : null;
        const weekModel = ringWeek ? model.summaries.get(summaryId(ringWeek)) : undefined;
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
                        backgroundColor: withColorAlpha(
                          budgetRingColor(focus.period, themeColors),
                          0.14,
                        ),
                      }}
                    >
                      {focusBudget.templateEmoji ? (
                        <CategoryEmoji icon={focusBudget.templateEmoji} size={22} />
                      ) : (
                        <CalendarDays
                          size={18}
                          color={budgetRingColor(focus.period, themeColors)}
                        />
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
                            backgroundColor: withColorAlpha(
                              budgetRingColor(focus.period, themeColors),
                              0.12,
                            ),
                          }}
                        >
                          <Text
                            variant="caption"
                            numberOfLines={1}
                            className="text-[11px]"
                            style={{ color: budgetRingColor(focus.period, themeColors) }}
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
                      onFocus={(period) =>
                        setFocus(
                          month,
                          period === 'month'
                            ? null
                            : period === 'year'
                              ? { period, key: model.yearKey }
                              : ringWeekKey
                                ? { period, key: ringWeekKey }
                                : null,
                        )
                      }
                    >
                      {/* Just the amount: green while some is left, red with a
                          minus sign once over. */}
                      <Text
                        variant="monoLg"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        accessibilityLabel={
                          focusModel.summary.remaining < 0
                            ? I18n.t('budget.over', {
                                amount: money(-focusModel.summary.remaining, settings),
                              })
                            : I18n.t('budget.left', {
                                amount: money(focusModel.summary.remaining, settings),
                              })
                        }
                        className="text-[26px] leading-[32px] self-start"
                        style={{
                          color:
                            focusModel.summary.remaining < 0
                              ? themeColors.error
                              : themeColors.success,
                        }}
                      >
                        {focusModel.summary.remaining < 0
                          ? `-${money(-focusModel.summary.remaining, settings)}`
                          : money(focusModel.summary.remaining, settings)}
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
                      onSelect={(key) => setFocus(month, { period: 'week', key })}
                    />
                  ) : null}
                </View>
              ) : null}

              {showWeekCreate ? (
                <CreateBudgetRow
                  label={budgetPeriodLabel(
                    'week',
                    budgetPeriodKeyForDate('week', dateFromDayKeyLocal(todayKey), clock),
                    settings.locale,
                    monthCycle,
                  )}
                  className="mt-3"
                  themeColors={themeColors}
                  onPress={() =>
                    handleCreate({
                      period: 'week',
                      key: model.weeks.some(
                        (week) =>
                          week.key ===
                          budgetPeriodKeyForDate('week', dateFromDayKeyLocal(todayKey), clock),
                      )
                        ? budgetPeriodKeyForDate('week', dateFromDayKeyLocal(todayKey), clock)
                        : model.weeks[0].key,
                    })
                  }
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
                    <React.Fragment key={line.categoryId}>
                      <BudgetLineRow
                        line={line}
                        category={categoriesById.get(line.categoryId)}
                        indent={false}
                        first={index === 0}
                        settings={settings}
                        themeColors={themeColors}
                        onPress={() =>
                          openCategoryDrilldown(focusModel.range, line.categoryId, true)
                        }
                      />
                      {line.children.map((child) => (
                        <BudgetLineRow
                          key={child.categoryId}
                          line={child}
                          category={categoriesById.get(child.categoryId)}
                          indent
                          first={false}
                          settings={settings}
                          themeColors={themeColors}
                          onPress={() =>
                            openCategoryDrilldown(focusModel.range, child.categoryId, false)
                          }
                        />
                      ))}
                    </React.Fragment>
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
        clock,
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

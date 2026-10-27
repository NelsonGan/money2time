import {
  ChevronDown,
  ChevronLeft,
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
import {
  CreateBudgetRow,
  WeekStrip,
  YearBudgetBanner,
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
} from '~/features/budget/lib/budgetPeriods';
import {
  budgetPeriodLabel,
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

function Bar({ ratio, color, height }: { ratio: number; color: string; height: number }) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  return (
    <View
      className="w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: withColorAlpha(color, 0.15) }}
    >
      <View
        className="rounded-full"
        style={{ height, width: `${clamped * 100}%`, backgroundColor: color }}
      />
    </View>
  );
}

/**
 * The budget the page is showing, reduced to one answer: how much is left
 * (or over), of what, for how long, and one bar.
 */
function BudgetSummaryCard({
  summary,
  label,
  backLabel,
  onBack,
  daysLeft,
  settings,
  themeColors,
  onEdit,
  onDelete,
}: {
  summary: BudgetSummary;
  /** Which budget this is: "October", "Oct 19 – Oct 25", "2026". */
  label: string;
  /** Chip back to the month's own budget, when showing a week or the year. */
  backLabel: string | null;
  onBack: () => void;
  /** Days left in the period, today included; null unless the period is running. */
  daysLeft: number | null;
  settings: UserSettings;
  themeColors: ColorPalette;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOver = summary.remaining < 0;
  const color = healthOf(summary, themeColors);
  const details = [I18n.t('budget.of_total', { amount: money(summary.totalBudget, settings) })];
  if (daysLeft != null && daysLeft > 0) {
    details.push(
      I18n.t(daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other', {
        count: daysLeft,
      }),
    );
  }

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card px-4 pb-4 pt-3.5">
      {/* An accent edge marks the card as the page's main budget. */}
      <View className="absolute left-0 right-0 top-0 h-[3px] bg-primary" />
      <View className="flex-row items-center gap-1.5">
        <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
          {label}
        </Text>
        {backLabel ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onBack();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('budget.back_to', { label: backLabel })}
            className="shrink-0 flex-row items-center gap-0.5 rounded-full bg-secondary/40 py-1 pl-1.5 pr-2.5 active:opacity-70"
          >
            <ChevronLeft size={13} color={themeColors.primary} />
            <Text variant="caption" className="text-[11px] text-primary">
              {backLabel}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onEdit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('budget.edit_budget')}
          className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
        >
          <Pencil size={14} color={themeColors.textMuted} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('budget.delete_budget')}
          className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
        >
          <Trash2 size={14} color={themeColors.textMuted} />
        </Pressable>
      </View>

      <Text
        variant="monoLg"
        numberOfLines={1}
        adjustsFontSizeToFit
        className="mt-1.5 text-[38px] leading-[44px]"
        style={isOver ? { color: themeColors.error } : undefined}
      >
        {leftLabel(summary.remaining, settings)}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
        {details.join(' · ')}
      </Text>
      <View className="mt-3.5 flex-row items-center gap-3">
        <View className="flex-1">
          <Bar ratio={summary.usageRatio} color={color} height={10} />
        </View>
        <Text variant="bodyStrong" className="text-[13px]" style={{ color }}>
          {usagePercentLabel(summary.usageRatio)}
        </Text>
      </View>
    </View>
  );
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
            ? focus.period === 'month'
              ? monthNameLabel(month, settings.locale)
              : budgetPeriodLabel(focus.period, focusBudget.periodKey, settings.locale, monthCycle)
            : null;
        const showBackToMonth = model.month != null && focus?.period !== 'month';
        const isRunning =
          focusModel != null &&
          focusModel.range.start <= todayKey &&
          todayKey <= focusModel.range.end;
        const orderedCategories = focusModel
          ? [...focusModel.summary.categories].sort((a, b) => Number(b.isOver) - Number(a.isOver))
          : [];

        return (
          <View style={{ width: pageWidth }} className="flex-1">
            <ScrollView
              contentContainerStyle={[
                { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
                listNavInset,
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* The year first: the big picture above the month. */}
              {model.year && yearModel ? (
                <YearBudgetBanner
                  budget={model.year}
                  summary={yearModel.summary}
                  label={model.yearKey}
                  daysLeft={
                    yearModel.range.start <= todayKey && todayKey <= yearModel.range.end
                      ? budgetDaysLeft(yearModel.range, dateFromDayKeyLocal(todayKey))
                      : null
                  }
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
                  className="mb-3"
                  themeColors={themeColors}
                  onPress={() => handleCreate({ period: 'year', key: model.yearKey })}
                />
              ) : null}

              {showMonthCreate ? (
                <CreateBudgetRow
                  label={monthKeyLabel(month, settings.locale)}
                  className="mb-3"
                  themeColors={themeColors}
                  onPress={() => handleCreate({ period: 'month', key: month })}
                />
              ) : null}

              {focus && focusBudget && focusModel ? (
                <BudgetSummaryCard
                  summary={focusModel.summary}
                  // Which budget the card shows: the month's, a week's or the
                  // year's, so it is always named.
                  label={
                    focusBudget.templateName
                      ? `${focusLabel} · ${focusBudget.templateName}`
                      : (focusLabel ?? '')
                  }
                  backLabel={showBackToMonth ? monthNameLabel(month, settings.locale) : null}
                  onBack={() => setFocus(month, null)}
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
              ) : null}

              {showWeeks ? (
                <WeekStrip
                  title={weekStripTitle(
                    (focus?.period === 'week'
                      ? model.weeks.find((week) => week.key === focus.key)?.budget
                      : null) ??
                      thisWeek?.budget ??
                      firstBudgetedWeek?.budget ??
                      null,
                    settings,
                  )}
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

/** "Weekly spending · RM400 a week", named after the week's budget, or "Weeks". */
function weekStripTitle(budget: PeriodBudget | null, settings: UserSettings): string {
  if (!budget) return I18n.t('budget.weeks_title');
  const perWeek = I18n.t('budget.per_week', { amount: money(budget.totalAmount, settings) });
  return `${budget.templateName ?? I18n.t('budget.weeks_title')} · ${perWeek}`;
}

function addDaysKey(dayKey: string, days: number): string {
  const date = dateFromDayKeyLocal(dayKey);
  return dayKeyFromDateLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

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
import { Alert, FlatList, Pressable, ScrollView, View } from 'react-native';

import { DatePickerModal, MonthYearWheelPicker } from '~/components/datePicker';
import { yearMonthFromKey, yearMonthToKey } from '~/components/datePicker/monthJump';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useContentFrame } from '~/components/layout/ContentFrame';
import {
  CategoryEmoji,
  SegmentedToggle,
  SETTINGS_LIST_BOTTOM_PADDING,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { chartCategoryColor } from '~/constants/chartColors';
import type { ColorPalette } from '~/constants/designSystem';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { BudgetTemplatePickerSheet } from '~/features/budget/components/BudgetTemplatePickerSheet';
import { buildBudgetSummary, computeBudgetPagerKeys } from '~/features/budget/lib/budgetMath';
import {
  BUDGET_PERIODS,
  budgetCoveringDay,
  budgetDaysLeft,
  type BudgetPeriodClock,
  budgetPeriodKeyForDate,
  type BudgetPeriodRange,
  budgetPeriodRange,
  budgetSlotKey,
} from '~/features/budget/lib/budgetPeriods';
import {
  budgetPeriodLabel,
  budgetPeriodName,
  money,
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
  /** Open the period jump picker, for the host header's period label (none for years). */
  openPeriodPicker: () => void;
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
  /** Reports the active period's label so the embedding host (Insights) can
   *  drive the pager from its own header controls. */
  onActivePeriodLabelChange?: (label: string) => void;
  /** Whether the header's period label opens a picker for the shown period. */
  onPeriodPickerAvailableChange?: (available: boolean) => void;
}

/** The period the budget page showed last in this session. */
let rememberedPeriod: BudgetPeriod | null = null;

/**
 * The budget page without any screen chrome: a Weekly / Monthly / Yearly
 * switch above one pager per period (summary ring card, per-category
 * depletion, unbudgeted section) plus the create-from-template picker.
 * Embedded as an insights page.
 */
export const BudgetPagerView = forwardRef<BudgetPagerViewHandle, BudgetPagerViewProps>(
  function BudgetPagerViewImpl({ onPeriodPickerAvailableChange, ...props }, ref) {
    const { settings, periodBudgets } = useApp();
    const clock = useMemo(
      () => ({ weekStartsOn: settings.weekStartsOn, monthCycle: monthCycleOf(settings) }),
      [settings],
    );

    // Periods whose running budget exists get a dot on the switch, so a
    // weekly budget is not hidden behind the Monthly tab.
    const todayKey = dayKeyFromDateLocal(new Date());
    const livePeriods = useMemo(() => {
      const live = new Set<BudgetPeriod>();
      for (const period of BUDGET_PERIODS) {
        if (budgetCoveringDay(periodBudgets, period, todayKey, clock.monthCycle)) live.add(period);
      }
      return live;
    }, [clock.monthCycle, periodBudgets, todayKey]);

    // Until the user picks a tab (remembered for the session): the month when
    // it has a running budget (the classic view), else whichever period does,
    // else the month. Derived, not stored, so it settles once budgets load.
    const [chosenPeriod, setChosenPeriod] = useState<BudgetPeriod | null>(rememberedPeriod);
    const period: BudgetPeriod =
      chosenPeriod ??
      (livePeriods.has('month')
        ? 'month'
        : (BUDGET_PERIODS.find((candidate) => livePeriods.has(candidate)) ?? 'month'));
    const setPeriod = useCallback((next: BudgetPeriod) => {
      rememberedPeriod = next;
      setChosenPeriod(next);
    }, []);
    useEffect(() => {
      onPeriodPickerAvailableChange?.(period !== 'year');
    }, [onPeriodPickerAvailableChange, period]);

    const periodOptions = useMemo(
      () =>
        BUDGET_PERIODS.map((value) => ({
          value,
          label: budgetPeriodName(value),
          badge: livePeriods.has(value) && value !== period,
          accessibilityLabel: livePeriods.has(value)
            ? I18n.t('budget.period_has_budget', { period: budgetPeriodName(value) })
            : undefined,
        })),
      [livePeriods, period],
    );

    return (
      <View className="flex-1">
        <View style={{ paddingHorizontal: spacing.lg }} className="pb-2 pt-1">
          <SegmentedToggle
            value={period}
            options={periodOptions}
            onChange={setPeriod}
            variant="home"
          />
        </View>
        <BudgetPeriodPager key={period} ref={ref} period={period} clock={clock} {...props} />
      </View>
    );
  },
);

interface BudgetPeriodPagerProps extends Omit<
  BudgetPagerViewProps,
  'onPeriodPickerAvailableChange'
> {
  period: BudgetPeriod;
  clock: BudgetPeriodClock;
}

/** One period length's pager; remounted (keyed) when the period changes. */
const BudgetPeriodPager = forwardRef<BudgetPagerViewHandle, BudgetPeriodPagerProps>(
  function BudgetPeriodPagerImpl(
    {
      period,
      clock,
      onOpenTemplateEditor,
      onOpenBudgetEditor,
      onCreateCustomBudget,
      onOpenDrilldown,
      onActivePeriodLabelChange,
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
    const { monthCycle, weekStartsOn } = clock;
    const { transactions } = useTransactions();
    const themeColors = useThemeColors();
    const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
    const { width: pageWidth } = useContentFrame();

    const [pickerKey, setPickerKey] = useState<string | null>(null);

    const templates = useMemo(
      () => budgetTemplates.filter((template) => template.period === period),
      [budgetTemplates, period],
    );

    const keys = useMemo(
      () =>
        computeBudgetPagerKeys({
          period,
          budgets: periodBudgets,
          transactions,
          clock,
        }),
      [clock, period, periodBudgets, transactions],
    );

    const currentIndex = useMemo(() => {
      const currentKey = budgetPeriodKeyForDate(period, new Date(), clock);
      const index = keys.indexOf(currentKey);
      return index >= 0 ? index : Math.max(keys.length - 2, 0);
    }, [clock, keys, period]);

    const listRef = useRef<FlatList<number>>(null);
    const pager = useMonthPager({
      listRef,
      pageWidth,
      totalSlots: keys.length,
      initialIndex: currentIndex,
    });

    const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);
    useImperativeHandle(
      ref,
      () => ({
        scrollToRelative: pager.scrollToRelative,
        openPeriodPicker: () => {
          if (period !== 'year') setIsPeriodPickerOpen(true);
        },
      }),
      [pager.scrollToRelative, period],
    );

    // The pager tracks a bare slot index, but `keys` can gain/lose leading
    // entries while mounted (a backdated expense, an import, a bulk delete).
    // Re-anchor the index to the period the user was actually viewing so the
    // page doesn't silently jump.
    const previousKeysRef = useRef(keys);
    useEffect(() => {
      const previousKeys = previousKeysRef.current;
      if (previousKeys === keys) return;
      previousKeysRef.current = keys;
      const previousActiveKey = previousKeys[pager.activeIndexRef.current];
      if (!previousActiveKey) return;
      // If the viewed period itself disappeared (its anchoring data was
      // deleted), land on the nearest surviving one instead of letting the
      // slot index silently point at a different period.
      let nextIndex = keys.indexOf(previousActiveKey);
      if (nextIndex < 0) {
        const nearest = keys.findIndex((key) => key >= previousActiveKey);
        nextIndex = nearest >= 0 ? nearest : keys.length - 1;
      }
      if (nextIndex === pager.activeIndexRef.current) return;
      pager.setActiveIndex(nextIndex);
      listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
    }, [keys, pageWidth, pager]);

    // Week budgets made under another first day of the week land on the week
    // their first day falls in. Should two land on one week (the setting
    // changed twice), the one keyed exactly on it wins, else the later one.
    const budgetsBySlot = useMemo(() => {
      const map = new Map<string, PeriodBudget>();
      for (const budget of periodBudgets) {
        if (budget.period !== period) continue;
        const slot = budgetSlotKey(period, budget.periodKey, weekStartsOn);
        const taken = map.get(slot);
        if (taken && (taken.periodKey === slot || taken.periodKey > budget.periodKey)) continue;
        map.set(slot, budget);
      }
      return map;
    }, [period, periodBudgets, weekStartsOn]);

    // One O(N) pass bucketing expenses by day, so each page below collects
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

    // Precomputed once per data change — renderItem runs per page swipe and
    // must not re-aggregate a period's transactions or rebuild display maps.
    const pageModelByKey = useMemo(() => {
      const map = new Map<
        string,
        {
          summary: BudgetSummary;
          range: BudgetPeriodRange;
          expenses: TransactionWithRelations[];
          /** Over-budget lines floated to the top for display. */
          orderedCategories: BudgetCategoryProgress[];
          /** Colors follow the frozen line order (stable across periods from
           *  the same template). */
          colorByCategoryId: Map<string, string>;
        }
      >();
      for (const [slotKey, budget] of budgetsBySlot) {
        const range = budgetPeriodRange(budget.period, budget.periodKey, monthCycle);
        const expenses = expensesInRange(range);
        const summary = buildBudgetSummary({
          budget,
          transactions: expenses,
          categories,
          monthCycle,
        });
        if (!summary) continue;
        map.set(slotKey, {
          summary,
          range,
          expenses,
          orderedCategories: [...summary.categories].sort(
            (a, b) => Number(b.isOver) - Number(a.isOver),
          ),
          colorByCategoryId: new Map(
            summary.categories.map((line, index) => [line.categoryId, chartCategoryColor(index)]),
          ),
        });
      }
      return map;
    }, [budgetsBySlot, categories, expensesInRange, monthCycle]);

    const categoriesById = useMemo(
      () => new Map(categories.map((category) => [category.id, category])),
      [categories],
    );

    // Tap-through to the transactions behind a line: a root includes its
    // subcategories' spend, a subcategory only its own, and `null` is the
    // uncategorized bucket. Unlike the breakdown pie, tapping a parent goes
    // straight to its transactions (no subcategory-selection stage).
    const openCategoryDrilldown = useCallback(
      (
        expenses: TransactionWithRelations[],
        categoryId: string | null,
        includeChildren: boolean,
      ) => {
        const transactionIds = expenses
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
      [categoriesById, onOpenDrilldown],
    );

    const activeKey = keys[pager.activeIndex] ?? keys[keys.length - 1];
    // A page with a budget is titled by the budget's own days (a week made
    // under another first day of the week does not match its slot).
    const periodLabel = budgetPeriodLabel(
      period,
      budgetsBySlot.get(activeKey)?.periodKey ?? activeKey,
      settings.locale,
      monthCycle,
    );

    useEffect(() => {
      onActivePeriodLabelChange?.(periodLabel);
    }, [onActivePeriodLabelChange, periodLabel]);

    // Always route through the picker (even with one template) so the Custom
    // one-off option is always reachable.
    const handleCreateFor = useCallback(
      (key: string) => {
        if (templates.length === 0) {
          onOpenTemplateEditor({ period });
          return;
        }
        setPickerKey(key);
      },
      [onOpenTemplateEditor, period, templates.length],
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

    // A day key, so it only changes (and re-renders pages) when the day does.
    const todayKey = dayKeyFromDateLocal(new Date());

    const renderPage = useCallback(
      ({ item: slotIndex }: { item: number }) => {
        const key = keys[slotIndex];
        const budget = budgetsBySlot.get(key) ?? null;
        const model = pageModelByKey.get(key) ?? null;

        if (!budget || !model) {
          return (
            <View style={{ width: pageWidth }} className="flex-1">
              <EmptyState
                title={I18n.t('budget.no_budget_title', {
                  month: budgetPeriodLabel(period, key, settings.locale, monthCycle),
                })}
                message={
                  templates.length === 0
                    ? I18n.t(`budget.no_templates_message_${period}`)
                    : I18n.t(`budget.no_budget_message_${period}`)
                }
                mascotMood="curious"
                animateIn={false}
                action={{
                  label:
                    templates.length === 0
                      ? I18n.t('budget.create_template')
                      : I18n.t('budget.create_budget'),
                  onPress: () => handleCreateFor(key),
                }}
              />
            </View>
          );
        }

        const { summary, range, expenses, orderedCategories, colorByCategoryId } = model;
        const isRunning = range.start <= todayKey && todayKey <= range.end;

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
                daysLeft={isRunning ? budgetDaysLeft(range, dateFromDayKeyLocal(todayKey)) : null}
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
                      onPress={() => openCategoryDrilldown(expenses, line.categoryId, true)}
                      onPressChild={(childId) => openCategoryDrilldown(expenses, childId, false)}
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
                        onPress={() => openCategoryDrilldown(expenses, entry.categoryId, true)}
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
        budgetsBySlot,
        categoriesById,
        handleCreateFor,
        handleDeleteBudget,
        keys,
        listNavInset,
        monthCycle,
        onOpenBudgetEditor,
        openCategoryDrilldown,
        pageModelByKey,
        pageWidth,
        period,
        settings,
        templates.length,
        themeColors,
        todayKey,
      ],
    );

    const jumpToKey = useCallback(
      (key: string) => {
        const exact = keys.indexOf(key);
        const next = exact >= 0 ? exact : keys.findIndex((candidate) => candidate >= key);
        pager.jumpToIndex(next >= 0 ? next : keys.length - 1);
      },
      [keys, pager],
    );

    return (
      <>
        <FlatList
          ref={listRef}
          data={pager.slots}
          renderItem={renderPage}
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

        {period === 'month' ? (
          <MonthYearWheelPicker
            visible={isPeriodPickerOpen}
            year={yearMonthFromKey(activeKey).year}
            monthIndex={yearMonthFromKey(activeKey).monthIndex}
            // The pager only holds the months that have a budget or spending, so
            // the wheel stops at the same ends.
            min={yearMonthFromKey(keys[0])}
            max={yearMonthFromKey(keys[keys.length - 1])}
            locale={settings.locale}
            onSelect={(year, monthIndex) => {
              setIsPeriodPickerOpen(false);
              jumpToKey(yearMonthToKey({ year, monthIndex }));
            }}
            onClose={() => setIsPeriodPickerOpen(false)}
          />
        ) : null}

        {period === 'week' ? (
          <DatePickerModal
            visible={isPeriodPickerOpen}
            value={activeKey}
            title={I18n.t('budget.pick_week_title')}
            showQuickDays={false}
            onSelect={(dayKey) => {
              setIsPeriodPickerOpen(false);
              jumpToKey(
                budgetPeriodKeyForDate('week', dateFromDayKeyLocal(dayKey.slice(0, 10)), clock),
              );
            }}
            onClose={() => setIsPeriodPickerOpen(false)}
          />
        ) : null}

        <BudgetTemplatePickerSheet
          visible={pickerKey != null}
          onClose={() => setPickerKey(null)}
          templates={templates}
          period={period}
          categories={categories}
          settings={settings}
          onSelect={(templateId) => {
            if (pickerKey) {
              void triggerHaptic('success');
              createPeriodBudget(pickerKey, templateId);
            }
            setPickerKey(null);
          }}
          onSelectCustom={() => {
            if (pickerKey) onCreateCustomBudget(period, pickerKey);
            setPickerKey(null);
          }}
        />
      </>
    );
  },
);

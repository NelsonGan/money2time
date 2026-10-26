import { Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { budgetPeriodRange } from '~/features/budget/lib/budgetPeriods';
import {
  budgetShortDayLabel,
  money,
  usageColor,
  usagePercentLabel,
} from '~/features/budget/lib/format';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetSummary, PeriodBudget, UserSettings } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { formatCompactCurrency } from '~/utils/formatters';

/** isOver wins so a zero-budget overspend (ratio 0) still reads red. */
function healthColor(summary: BudgetSummary, themeColors: ColorPalette): string {
  return summary.remaining < 0 ? themeColors.error : usageColor(summary.usageRatio, themeColors);
}

function MiniBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <View
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: withColorAlpha(color, 0.16) }}
    >
      <View
        className="h-1.5 rounded-full"
        style={{
          width: `${Math.max(0, Math.min(ratio, 1)) * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export interface WeekTile {
  /** The week's first day (`YYYY-MM-DD`). */
  key: string;
  budget: PeriodBudget | null;
  summary: BudgetSummary | null;
}

/**
 * The weeks with a day in the month, one tile each: how much of the week's
 * budget is used, or a + to make one. Tapping a budgeted week shows it in the
 * page's card and category list.
 */
export function WeekStrip({
  weeks,
  todayKey,
  selectedKey,
  canCreate,
  settings,
  themeColors,
  onSelect,
  onCreate,
}: {
  weeks: WeekTile[];
  todayKey: string;
  /** The week the page is showing, if it is showing one. */
  selectedKey: string | null;
  /** Whether a weekly template exists, so an empty week offers a +. */
  canCreate: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onSelect: (key: string) => void;
  onCreate: (key: string) => void;
}) {
  return (
    <View className="mt-5">
      <Text variant="label" tone="muted" className="mb-2 px-1 uppercase">
        {I18n.t('budget.weeks_title')}
      </Text>
      {/* A month has four to six weeks: they share the row rather than
          scroll, since the page itself pages sideways. */}
      <View className="flex-row gap-1.5">
        {weeks.map(({ key, budget, summary }) => {
          const date = budgetShortDayLabel(key, settings.locale);
          const isCurrent = key <= todayKey && todayKey <= budgetPeriodRange('week', key, 1).end;
          const isSelected = key === selectedKey;

          if (!budget || !summary) {
            return (
              <Pressable
                key={key}
                disabled={!canCreate}
                onPress={() => {
                  void triggerHaptic('selection');
                  onCreate(key);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('budget.week_tile_empty', { date })}
                className={cn(
                  'min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed px-1 py-3 active:opacity-70',
                  isCurrent ? 'border-primary/50' : 'border-border/60',
                )}
              >
                <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
                  {date}
                </Text>
                {canCreate ? (
                  <Plus size={16} color={themeColors.textMuted} />
                ) : (
                  <Text variant="caption" tone="muted">
                    –
                  </Text>
                )}
              </Pressable>
            );
          }

          const color = healthColor(summary, themeColors);
          const percent = usagePercentLabel(summary.usageRatio);
          return (
            <Pressable
              key={key}
              onPress={() => {
                void triggerHaptic('selection');
                onSelect(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={I18n.t('budget.week_tile_label', { date, percent })}
              className={cn(
                'min-w-0 flex-1 gap-1.5 rounded-2xl border px-2 py-2.5 active:opacity-80',
                isSelected
                  ? 'border-primary'
                  : isCurrent
                    ? 'border-primary/40'
                    : 'border-border/45',
                isSelected ? 'bg-primary/10' : 'bg-card',
              )}
            >
              <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
                {date}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1} style={{ color }}>
                {percent}
              </Text>
              <MiniBar ratio={summary.usageRatio} color={color} />
              <Text variant="caption" tone="muted" numberOfLines={1} className="text-[10px]">
                {formatCompactCurrency(summary.totalSpent, settings.currencySymbol)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The year's budget as one slim row: spent of total and a bar, with a tick at
 * how much of the year has gone while it is running. Tapping it shows the
 * year in the page's card and category list.
 */
export function YearBudgetRow({
  budget,
  summary,
  label,
  yearElapsedRatio,
  selected,
  settings,
  themeColors,
  onPress,
}: {
  budget: PeriodBudget;
  summary: BudgetSummary;
  label: string;
  /** Share of the year gone (0..1) while it is running, else null. */
  yearElapsedRatio: number | null;
  selected: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  const color = healthColor(summary, themeColors);
  const title = budget.templateName ? `${label} · ${budget.templateName}` : label;
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className={cn(
        'mt-3 rounded-2xl border px-4 py-3 active:opacity-80',
        selected ? 'border-primary bg-primary/10' : 'border-border/45 bg-card',
      )}
    >
      <View className="flex-row items-center gap-2.5">
        {budget.templateEmoji ? <CategoryEmoji icon={budget.templateEmoji} size={20} /> : null}
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
            {money(summary.totalSpent, settings)} / {money(summary.totalBudget, settings)}
          </Text>
        </View>
        <Text variant="bodyStrong" style={{ color }}>
          {usagePercentLabel(summary.usageRatio)}
        </Text>
      </View>
      <View className="mt-2.5">
        <MiniBar ratio={summary.usageRatio} color={color} />
        {yearElapsedRatio != null ? (
          // Where the year is: spend left of the tick is on pace.
          <View
            pointerEvents="none"
            className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground/50"
            style={{ left: `${Math.min(yearElapsedRatio, 1) * 100}%` }}
          />
        ) : null}
      </View>
      {yearElapsedRatio != null ? (
        <Text variant="caption" tone="muted" className="mt-1.5 text-[10px]">
          {I18n.t('budget.year_elapsed', { percent: usagePercentLabel(yearElapsedRatio) })}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A dashed "No budget for …" row that makes one: shown for a month or year
 *  with a template of its period but no budget yet. */
export function CreateBudgetRow({
  label,
  className,
  themeColors,
  onPress,
}: {
  label: string;
  className?: string;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${I18n.t('budget.no_budget_title', { month: label })}, ${I18n.t('budget.create_budget')}`}
      className={cn(
        'flex-row items-center gap-2 rounded-2xl border border-dashed border-border/60 px-4 py-3 active:opacity-70',
        className,
      )}
    >
      <Text variant="body" tone="muted" numberOfLines={1} className="flex-1">
        {I18n.t('budget.no_budget_title', { month: label })}
      </Text>
      <Plus size={14} color={themeColors.primary} />
      <Text variant="caption" className="text-primary">
        {I18n.t('budget.create_budget')}
      </Text>
    </Pressable>
  );
}

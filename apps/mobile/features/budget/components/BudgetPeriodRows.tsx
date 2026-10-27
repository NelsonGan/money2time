import { ChevronRight, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { budgetPeriodRange } from '~/features/budget/lib/budgetPeriods';
import {
  budgetShortDayLabel,
  money,
  usageColor,
  usagePercentLabel,
} from '~/features/budget/lib/format';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetSummary, PeriodBudget, UserSettings } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

/** isOver wins so a zero-budget overspend (ratio 0) still reads red. */
function healthColor(summary: BudgetSummary, themeColors: ColorPalette): string {
  return summary.remaining < 0 ? themeColors.error : usageColor(summary.usageRatio, themeColors);
}

/** "RM2,100 left" / "RM40 over". */
function leftLabel(summary: BudgetSummary, settings: UserSettings): string {
  return summary.remaining < 0
    ? I18n.t('budget.over', { amount: money(Math.abs(summary.remaining), settings) })
    : I18n.t('budget.left', { amount: money(summary.remaining, settings) });
}

const WEEK_BAR_HEIGHT = 64;

export interface WeekTile {
  /** The week's first day (`YYYY-MM-DD`). */
  key: string;
  budget: PeriodBudget | null;
  summary: BudgetSummary | null;
}

/**
 * The weeks with a day in the month as a small bar chart: each bar fills
 * with how much of that week's budget is used, coloured by health, with only
 * the week's first day under it. Tapping a bar shows that week in the card
 * above; an empty week offers a + when a weekly template exists.
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
  canCreate: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onSelect: (key: string) => void;
  onCreate: (key: string) => void;
}) {
  return (
    <View className="mt-5">
      <Text variant="bodyStrong" className="mb-2 px-1">
        {I18n.t('budget.weeks_title')}
      </Text>
      {/* A month has four to six weeks: they share the row rather than
          scroll, since the page itself pages sideways. */}
      <View className="flex-row gap-2">
        {weeks.map(({ key, budget, summary }) => {
          const date = budgetShortDayLabel(key, settings.locale);
          const isCurrent = key <= todayKey && todayKey <= budgetPeriodRange('week', key, 1).end;
          const isSelected = key === selectedKey;
          const usage = budget && summary ? summary : null;
          const color = usage ? healthColor(usage, themeColors) : themeColors.textMuted;
          const fill = usage ? Math.max(0, Math.min(usage.usageRatio, 1)) : 0;
          const highlighted = isSelected || isCurrent;

          return (
            <Pressable
              key={key}
              disabled={!usage && !canCreate}
              onPress={() => {
                void triggerHaptic('selection');
                if (usage) onSelect(key);
                else onCreate(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                usage
                  ? I18n.t('budget.week_tile_label', {
                      date,
                      percent: usagePercentLabel(usage.usageRatio),
                    })
                  : I18n.t('budget.week_tile_empty', { date })
              }
              className="min-w-0 flex-1 items-center gap-1.5 active:opacity-70"
            >
              <View
                className={cn(
                  'w-full max-w-[44px] justify-end overflow-hidden rounded-xl p-[3px]',
                  highlighted ? 'border-2' : 'border',
                  !usage && 'border-dashed',
                )}
                style={{
                  height: WEEK_BAR_HEIGHT,
                  borderColor: isSelected
                    ? themeColors.primary
                    : isCurrent
                      ? withColorAlpha(themeColors.primary, 0.45)
                      : withColorAlpha(themeColors.border, usage ? 0.5 : 0.9),
                  backgroundColor: isSelected
                    ? withColorAlpha(themeColors.primary, 0.08)
                    : usage
                      ? withColorAlpha(color, 0.12)
                      : 'transparent',
                }}
              >
                {usage ? (
                  <View
                    className="w-full rounded-lg"
                    style={{
                      height: Math.max(fill * (WEEK_BAR_HEIGHT - 10), fill > 0 ? 4 : 0),
                      backgroundColor: color,
                    }}
                  />
                ) : canCreate ? (
                  <View className="flex-1 items-center justify-center">
                    <Plus size={14} color={themeColors.textMuted} />
                  </View>
                ) : null}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
                tone={highlighted ? undefined : 'muted'}
                className="text-[11px]"
              >
                {date}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The year's budget as a quiet banner at the top of the page: the big
 * picture above the month. A small ring, its name, and how much of the
 * total is spent. Tapping it shows the year in the card below.
 */
export function YearBudgetBanner({
  budget,
  summary,
  label,
  daysLeft,
  selected,
  settings,
  themeColors,
  onPress,
}: {
  budget: PeriodBudget;
  summary: BudgetSummary;
  /** The year, e.g. "2026". */
  label: string;
  /** Days left in the year, today included; null unless it is running. */
  daysLeft: number | null;
  selected: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  const color = healthColor(summary, themeColors);
  const percent = usagePercentLabel(summary.usageRatio);
  const title = budget.templateName ? `${budget.templateName} ${label}` : label;
  const details = [
    `${money(summary.totalSpent, settings)} ${I18n.t('budget.of_total', {
      amount: money(summary.totalBudget, settings),
    })}`,
  ];
  if (daysLeft != null && daysLeft > 0) {
    details.push(
      I18n.t(daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other', {
        count: daysLeft,
      }),
    );
  }
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${leftLabel(summary, settings)}`}
      className={cn(
        'mb-3 flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 active:opacity-80',
        selected ? 'border-primary bg-primary/10' : 'border-transparent bg-secondary/35',
      )}
    >
      <SavingsRateRing
        size={42}
        strokeWidth={5}
        progress={Math.min(summary.usageRatio, 1)}
        color={color}
        trackColor={withColorAlpha(color, 0.16)}
      >
        {/* "259%" needs a smaller size than "65%" to fit the small ring. */}
        <Text
          variant="label"
          className={percent.length > 3 ? 'text-[8px]' : 'text-[10px]'}
          style={{ color }}
        >
          {percent}
        </Text>
      </SavingsRateRing>
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
          {details.join(' · ')}
        </Text>
      </View>
      <ChevronRight size={16} color={themeColors.textMuted} />
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

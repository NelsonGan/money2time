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
 * The year's budget on one line: its name, what is left, and a thin bar.
 * Tapping it shows the year in the card above.
 */
export function YearBudgetRow({
  budget,
  summary,
  label,
  selected,
  settings,
  themeColors,
  onPress,
}: {
  budget: PeriodBudget;
  summary: BudgetSummary;
  label: string;
  selected: boolean;
  settings: UserSettings;
  themeColors: ColorPalette;
  onPress: () => void;
}) {
  const color = healthColor(summary, themeColors);
  const title = budget.templateName ? `${budget.templateName} ${label}` : label;
  const left = leftLabel(summary, settings);
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${left}`}
      className={cn(
        'mt-4 gap-2.5 rounded-2xl border px-4 py-3.5 active:opacity-80',
        selected ? 'border-primary bg-primary/10' : 'border-border/45 bg-card',
      )}
    >
      <View className="flex-row items-center gap-2.5">
        {budget.templateEmoji ? <CategoryEmoji icon={budget.templateEmoji} size={18} /> : null}
        <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
          {title}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ color: summary.remaining < 0 ? themeColors.error : themeColors.text }}
        >
          {left}
        </Text>
      </View>
      <View
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: withColorAlpha(color, 0.15) }}
      >
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${Math.max(0, Math.min(summary.usageRatio, 1)) * 100}%`,
            backgroundColor: color,
          }}
        />
      </View>
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

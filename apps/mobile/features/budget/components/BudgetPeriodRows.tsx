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

export interface WeekTile {
  /** The week's first day (`YYYY-MM-DD`). */
  key: string;
  budget: PeriodBudget | null;
  summary: BudgetSummary | null;
}

function MiniBar({ ratio, color, thin }: { ratio: number; color: string; thin?: boolean }) {
  return (
    <View
      className={cn('w-full overflow-hidden rounded-full', thin ? 'h-1' : 'h-2')}
      style={{ backgroundColor: withColorAlpha(color, 0.16) }}
    >
      <View
        className={cn('rounded-full', thin ? 'h-1' : 'h-2')}
        style={{ width: `${Math.max(0, Math.min(ratio, 1)) * 100}%`, backgroundColor: color }}
      />
    </View>
  );
}

/**
 * The weeks with a day in the month, in one card under the month: a title
 * naming the weekly budget, then per week its first day, a small bar and the
 * share used, with "this week" under the running one. Tapping a week shows it
 * in the card above; an empty week offers a + when a weekly template exists.
 */
export function WeekStrip({
  title,
  weeks,
  todayKey,
  selectedKey,
  canCreate,
  settings,
  themeColors,
  onSelect,
  onCreate,
}: {
  /** "Weekly spending · RM400 a week", or "Weeks" with no weekly budget yet. */
  title: string;
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
    <View className="mt-4 rounded-2xl border border-border/45 bg-card px-2 pb-2 pt-3.5">
      <Text variant="bodyStrong" numberOfLines={1} className="mb-2.5 px-2">
        {title}
      </Text>
      {/* A month has four to six weeks: they share the row rather than
          scroll, since the page itself pages sideways. */}
      <View className="flex-row">
        {weeks.map(({ key, budget, summary }) => {
          const date = budgetShortDayLabel(key, settings.locale);
          const isCurrent = key <= todayKey && todayKey <= budgetPeriodRange('week', key, 1).end;
          const isSelected = key === selectedKey;
          const usage = budget && summary ? summary : null;
          const color = usage ? healthColor(usage, themeColors) : themeColors.textMuted;
          const percent = usage ? usagePercentLabel(usage.usageRatio) : null;

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
                percent
                  ? I18n.t('budget.week_tile_label', { date, percent })
                  : I18n.t('budget.week_tile_empty', { date })
              }
              className={cn(
                'min-w-0 flex-1 items-center gap-1.5 rounded-xl border px-1.5 py-2 active:opacity-70',
                isSelected ? 'border-primary bg-primary/10' : 'border-transparent',
              )}
            >
              <Text variant="caption" numberOfLines={1} className="text-[11px]">
                {date}
              </Text>
              {usage ? (
                <MiniBar ratio={usage.usageRatio} color={color} />
              ) : (
                <View className="h-2 w-full rounded-full border border-dashed border-border/70" />
              )}
              {percent ? (
                <Text
                  variant="caption"
                  numberOfLines={1}
                  className="text-[11px]"
                  style={{ color: usage && usage.remaining < 0 ? color : themeColors.text }}
                >
                  {percent}
                </Text>
              ) : canCreate ? (
                <Plus size={12} color={themeColors.textMuted} />
              ) : (
                <Text variant="caption" tone="muted" className="text-[11px]">
                  –
                </Text>
              )}
              {isCurrent ? (
                <Text
                  variant="caption"
                  numberOfLines={1}
                  // Six-week months leave narrow tiles: shrink rather than clip.
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  className="text-[10px] text-primary"
                >
                  {I18n.t('budget.this_week')}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The year's budget as one slim row above the month: smaller than the month
 * (most people plan by the month) but first, as the widest view. Its name and
 * spent of total, a short bar, and the share used with the days left.
 * Tapping it shows the year in the card below.
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
  const title = budget.templateName ? `${budget.templateName} · ${label}` : label;
  const spentOfTotal = `${money(summary.totalSpent, settings)} ${I18n.t('budget.of_total', {
    amount: money(summary.totalBudget, settings),
  })}`;
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
        'mb-3 gap-2 rounded-2xl border px-3.5 py-2.5 active:opacity-80',
        selected ? 'border-primary bg-primary/10' : 'border-border/45 bg-card',
      )}
    >
      <View className="flex-row items-center gap-2.5">
        {budget.templateEmoji ? <CategoryEmoji icon={budget.templateEmoji} size={20} /> : null}
        <View className="min-w-0 flex-1">
          <Text variant="caption" numberOfLines={1} className="font-semibold text-foreground">
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
            {spentOfTotal}
          </Text>
        </View>
        <View className="items-end">
          <Text
            variant="caption"
            numberOfLines={1}
            className="text-[11px]"
            style={{ color: summary.remaining < 0 ? color : themeColors.text }}
          >
            {I18n.t('budget.percent_used', { percent: usagePercentLabel(summary.usageRatio) })}
          </Text>
          {daysLeft != null && daysLeft > 0 ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="text-[10px]">
              {I18n.t(daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other', {
                count: daysLeft,
              })}
            </Text>
          ) : null}
        </View>
      </View>
      <MiniBar ratio={summary.usageRatio} color={color} thin />
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

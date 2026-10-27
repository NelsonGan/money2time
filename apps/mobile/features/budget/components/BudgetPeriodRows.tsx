import { Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { budgetPeriodRange } from '~/features/budget/lib/budgetPeriods';
import { budgetShortDayLabel } from '~/features/budget/lib/format';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { UserSettings } from '~/types';
import { cn } from '~/utils';

/**
 * With the week ring in focus, the month's budgeted weeks as small date
 * chips, to move the ring and the figures to another week.
 */
export function WeekChips({
  weeks,
  selectedKey,
  todayKey,
  settings,
  onSelect,
}: {
  /** The weeks' first days (`YYYY-MM-DD`), oldest first. */
  weeks: string[];
  selectedKey: string;
  todayKey: string;
  settings: UserSettings;
  onSelect: (key: string) => void;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap justify-center gap-1.5">
      {weeks.map((key) => {
        const date = budgetShortDayLabel(key, settings.locale);
        const selected = key === selectedKey;
        const isCurrent = key <= todayKey && todayKey <= budgetPeriodRange('week', key, 1).end;
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (selected) return;
              void triggerHaptic('selection');
              onSelect(key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={cn(
              'rounded-full border px-3 py-1 active:opacity-70',
              selected ? 'border-accent bg-accent/15' : 'border-border/50',
            )}
          >
            <Text
              variant="caption"
              tone={selected ? undefined : 'muted'}
              className={cn('text-[12px]', isCurrent && 'font-semibold')}
            >
              {date}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A dashed "No budget for …" row that makes one: shown for a month, week or
 *  year with a template of its period but no budget yet. */
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

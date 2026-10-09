import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

/** Dots drawn under a day before the count collapses into "+n". */
const MAX_DOTS = 3;

export interface WeekStripDay {
  /** Local day key (YYYY-MM-DD). */
  dayKey: string;
  /** Single-letter weekday, already localised. */
  weekdayLabel: string;
  /** Day of the month. */
  dayLabel: string;
  isToday: boolean;
  /** How many commitments fall due on this day. */
  count: number;
}

interface RecurringWeekStripProps {
  days: WeekStripDay[];
  /** The day the timeline is filtered to, or null when it shows every day. */
  selectedDayKey: string | null;
  onSelectDay: (dayKey: string | null) => void;
}

function DayPill({
  day,
  selected,
  onSelect,
}: {
  day: WeekStripDay;
  selected: boolean;
  onSelect: (dayKey: string | null) => void;
}) {
  // A day with nothing due has nothing to filter to, so it stays inert rather
  // than offering a tap that would empty the timeline.
  const interactive = day.count > 0;

  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onSelect(selected ? null : day.dayKey);
  }, [day.dayKey, onSelect, selected]);

  const dots = Math.min(day.count, MAX_DOTS);

  return (
    <Pressable
      onPress={handlePress}
      disabled={!interactive}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !interactive }}
      accessibilityLabel={`${day.weekdayLabel} ${day.dayLabel}, ${
        day.count > 0
          ? I18n.t('recurring.day_due_count', { count: day.count })
          : I18n.t('recurring.day_nothing_due')
      }`}
      className={cn(
        'flex-1 items-center gap-1 rounded-2xl py-2',
        selected
          ? 'bg-primary'
          : day.isToday
            ? 'border border-primary/40 bg-secondary/30'
            : 'bg-secondary/30',
        !interactive && !selected && 'opacity-50',
      )}
    >
      <Text
        variant="label"
        className={cn('text-[9px]', selected ? 'text-primary-foreground' : 'text-muted-foreground')}
      >
        {day.weekdayLabel}
      </Text>
      <Text
        variant="caption"
        className={cn(
          'text-[15px]',
          selected ? 'text-primary-foreground' : day.isToday ? 'text-primary' : 'text-foreground',
        )}
      >
        {day.dayLabel}
      </Text>

      <View className="h-1.5 flex-row items-center justify-center gap-0.5">
        {day.count > MAX_DOTS ? (
          <Text
            variant="label"
            className={cn('text-[8px]', selected ? 'text-primary-foreground' : 'text-primary')}
          >
            {`+${day.count}`}
          </Text>
        ) : (
          Array.from({ length: dots }, (_, index) => (
            <View
              key={index}
              className={cn(
                'h-1 w-1 rounded-full',
                selected ? 'bg-primary-foreground' : 'bg-primary',
              )}
            />
          ))
        )}
      </View>
    </Pressable>
  );
}

/**
 * A week of day pills over the timeline: which of the next seven days have
 * something due, and a tap to narrow the timeline to one of them.
 */
export const RecurringWeekStrip = React.memo(function RecurringWeekStrip({
  days,
  selectedDayKey,
  onSelectDay,
}: RecurringWeekStripProps) {
  const clearSelection = useCallback(() => {
    void triggerHaptic('selection');
    onSelectDay(null);
  }, [onSelectDay]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" tone="muted">
          {I18n.t('recurring.week_strip_label')}
        </Text>
        {selectedDayKey ? (
          <Pressable
            onPress={clearSelection}
            hitSlop={8}
            accessibilityRole="button"
            className="active:opacity-60"
          >
            <Text variant="label" className="text-[9px] text-primary">
              {I18n.t('recurring.show_all_days')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row gap-1.5">
        {days.map((day) => (
          <DayPill
            key={day.dayKey}
            day={day}
            selected={day.dayKey === selectedDayKey}
            onSelect={onSelectDay}
          />
        ))}
      </View>
    </View>
  );
});

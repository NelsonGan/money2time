import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { cn } from '~/utils';

/** Width of the rail gutter. Every timeline row reserves it so the line lines up. */
const TIMELINE_RAIL_WIDTH = 22;

/**
 * Where a row sits on the rail. The line is drawn as two half-height flex
 * children rather than an absolutely positioned bar, so it meets the dot at the
 * header's vertical centre whatever the row ends up measuring.
 */
type RailVariant = 'head' | 'body' | 'tail';

export function TimelineRail({ variant, isToday }: { variant: RailVariant; isToday?: boolean }) {
  const line = 'w-[1.5px] flex-1';
  return (
    <View style={{ width: TIMELINE_RAIL_WIDTH }} className="items-center">
      <View className={cn(line, variant === 'head' ? '' : 'bg-border')} />
      {variant === 'head' ? (
        <View
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            isToday ? 'bg-primary' : 'border-2 border-border bg-card',
          )}
        />
      ) : null}
      <View className={cn(line, variant === 'tail' ? '' : 'bg-border')} />
    </View>
  );
}

interface TimelineDayHeaderProps {
  /** "Today", "Tomorrow", or a weekday name. */
  label: string;
  /** The calendar date, spelled out beside the label. */
  dateLabel: string;
  /** What the day costs in total, already formatted. */
  totalLabel: string;
  isToday: boolean;
}

export const TimelineDayHeader = React.memo(function TimelineDayHeader({
  label,
  dateLabel,
  totalLabel,
  isToday,
}: TimelineDayHeaderProps) {
  return (
    <View className="flex-row items-center justify-between gap-2 py-2">
      <View className="flex-shrink flex-row items-baseline gap-2">
        <Text variant="caption" className={isToday ? 'text-primary' : 'text-foreground'}>
          {label}
        </Text>
        <Text variant="label" className="text-[9px]" tone="muted" numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <Text variant="label" className="text-[10px] normal-case tracking-normal" tone="muted">
        {totalLabel}
      </Text>
    </View>
  );
});

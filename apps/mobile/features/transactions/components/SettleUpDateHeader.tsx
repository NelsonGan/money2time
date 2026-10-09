import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { formatDayHeaderParts } from '~/utils/dayHeader';

interface SettleUpDateHeaderProps {
  dayKey: string;
  locale: string;
}

export function SettleUpDateHeader({ dayKey, locale }: SettleUpDateHeaderProps) {
  const { dateLabel, weekdayLabel } = formatDayHeaderParts(dayKey, locale);
  return (
    <View className="flex-row items-center gap-2 pt-2 pb-1.5">
      <Text variant="caption" tone="muted">
        {dateLabel}
      </Text>
      <View className="rounded-full border border-border/45 bg-secondary/55 px-2 py-0.5">
        <Text variant="label" tone="muted">
          {weekdayLabel}
        </Text>
      </View>
    </View>
  );
}

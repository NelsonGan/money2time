import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { Text, WheelPicker } from '~/components/ui';
import { I18n } from '~/lib/i18n';

import {
  durationHoursFromParts,
  durationPartsFromHours,
  LIVE_EARNINGS_DURATION_HOUR_OPTIONS,
  LIVE_EARNINGS_DURATION_MINUTE_OPTIONS,
  LIVE_EARNINGS_MAX_HOURS,
} from '../lib/liveEarnings';

interface DurationWheelPickerProps {
  label: string;
  value: number;
  helperText?: string;
  onChange: (value: number) => void;
}

export function DurationWheelPicker({
  label,
  value,
  helperText,
  onChange,
}: DurationWheelPickerProps) {
  const parts = durationPartsFromHours(value);
  const minuteOptions = useMemo(
    () => (parts.hours === LIVE_EARNINGS_MAX_HOURS ? [0] : LIVE_EARNINGS_DURATION_MINUTE_OPTIONS),
    [parts.hours],
  );
  const valueLabel = `${parts.hours}${I18n.t('common.hour_unit')} ${parts.minutes}${I18n.t(
    'common.minute_unit',
  )}`;

  const handleHourChange = useCallback(
    (index: number) => {
      const nextHours = LIVE_EARNINGS_DURATION_HOUR_OPTIONS[index];
      if (nextHours === undefined) return;
      const nextMinutes = nextHours === LIVE_EARNINGS_MAX_HOURS ? 0 : parts.minutes;
      onChange(durationHoursFromParts(nextHours, nextMinutes));
    },
    [onChange, parts.minutes],
  );

  const handleMinuteChange = useCallback(
    (index: number) => {
      const nextMinutes = minuteOptions[index];
      if (nextMinutes === undefined) return;
      onChange(durationHoursFromParts(parts.hours, nextMinutes));
    },
    [minuteOptions, onChange, parts.hours],
  );

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3 px-1">
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {valueLabel}
        </Text>
      </View>
      <View className="flex-row rounded-3xl border border-border/40 bg-secondary/25 px-2">
        <View className="flex-1">
          <WheelPicker
            items={LIVE_EARNINGS_DURATION_HOUR_OPTIONS.map(
              (item) => `${item}${I18n.t('common.hour_unit')}`,
            )}
            selectedIndex={parts.hours}
            onChange={handleHourChange}
          />
        </View>
        <View className="flex-1">
          <WheelPicker
            items={minuteOptions.map((item) => `${item}${I18n.t('common.minute_unit')}`)}
            selectedIndex={Math.max(0, minuteOptions.indexOf(parts.minutes))}
            onChange={handleMinuteChange}
          />
        </View>
      </View>
      {helperText ? (
        <Text variant="caption" tone="muted" className="px-1">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

import { View } from 'react-native';

import { Text, TimeValueInline } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import type { UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, formatHours } from '~/utils/formatters';

/** Money in the reporting currency, ignoring the global time display mode. */
export function formatReportingMoney(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

/**
 * A goal figure rendered under the active display mode: work-hours when the
 * global toggle is on Time and a wage is set, money otherwise.
 */
export function GoalValue({
  money,
  hours,
  settings,
  variant = 'body',
  className,
}: {
  money: number;
  hours: number | null;
  settings: UserSettings;
  variant?: React.ComponentProps<typeof Text>['variant'];
  className?: string;
}) {
  const showTime = settings.displayMode === 'time' && hours != null;
  if (showTime) {
    return (
      <TimeValueInline
        value={formatHours(hours as number)}
        variant={variant}
        textClassName={className ?? 'text-foreground'}
        numberOfLines={1}
      />
    );
  }
  return (
    <Text variant={variant} numberOfLines={1} className={className}>
      {formatReportingMoney(money, settings)}
    </Text>
  );
}

/** Thin rounded progress bar; fill clamps to [0, 100%]. */
export function GoalProgressBar({
  percent,
  color,
  height = 8,
}: {
  percent: number;
  color?: string;
  height?: number;
}) {
  const themeColors = useThemeColors();
  const fillColor = color ?? themeColors.primary;
  const pct = Math.max(0, Math.min(1, percent));
  return (
    <View
      className="w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: withColorAlpha(fillColor, 0.14) }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: `${pct * 100}%`, backgroundColor: fillColor }}
      />
    </View>
  );
}

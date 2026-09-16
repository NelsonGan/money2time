import { Eye, EyeOff } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useIsFlatIcons } from '~/context/ThemeContext';
import type { HomeSummaryMetric } from '~/features/calendar/lib/calendarPreferences';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

/**
 * The amount sits in roughly half the screen width minus the clay icon, which
 * on a 360dp Android phone leaves ~100dp. A long amount (RM11,616.67) used to
 * wrap to a second line and grow the card, so the value shrinks to fit one line
 * instead. Callers passing a node (time mode) must spread these onto their own
 * Text, since a node can't be reached from here.
 *
 * Shrinking runs out around `SUMMARY_VALUE_MAX_CHARS`
 * (`~/features/calendar/lib/summaryValue`); past that the caller is expected to
 * hand over an already-abbreviated value.
 */
export const IN_OUT_VALUE_TEXT_PROPS = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.7,
} as const;

interface FlowMetricCardProps {
  label: string;
  value: React.ReactNode;
  metric: HomeSummaryMetric;
  hidden: boolean;
  onPress: () => void;
}

const MASKED_SUMMARY_VALUE = '••••••';

function FlowMetricCard({ label, value, metric, hidden, onPress }: FlowMetricCardProps) {
  const isIncome = metric === 'income';
  const isExpense = metric === 'expense';
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();
  const cardClassName = cn(
    'flex-1 rounded-[18px] border px-2.5 py-2.5 overflow-hidden',
    isIncome
      ? 'border-success/20 bg-success/8'
      : isExpense
        ? 'border-destructive/15 bg-destructive/6'
        : 'border-primary/20 bg-primary/8',
    'active:opacity-85',
  );
  const labelNode = (
    <View className="flex-row items-center gap-1">
      <Text
        variant="label"
        className={cn(
          'text-[10px]',
          isIncome ? 'text-success' : isExpense ? 'text-destructive' : 'text-primary',
        )}
      >
        {label}
      </Text>
      {hidden ? (
        <EyeOff size={10} color={themeColors.textMuted} strokeWidth={2} />
      ) : (
        <Eye size={10} color={themeColors.textMuted} strokeWidth={2} />
      )}
    </View>
  );
  const valueNode = hidden ? (
    <Text variant="mono" {...IN_OUT_VALUE_TEXT_PROPS}>
      {MASKED_SUMMARY_VALUE}
    </Text>
  ) : typeof value === 'string' ? (
    <Text variant="mono" {...IN_OUT_VALUE_TEXT_PROPS}>
      {value}
    </Text>
  ) : (
    value
  );

  // The two styles want different arrangements, not just different glyphs. Clay
  // carries its own colour, so the 22px artwork sits directly on the card's tint
  // as a leading column with the label and value stacked beside it. Flat has
  // only a 6px tone dot, which reads as a stray speck next to a two-line stack —
  // so it goes back inline with the label, the way these cards were built before
  // the clay wallets, and the value takes the full card width beneath.
  const content = isFlat ? (
    <>
      <View className="flex-row items-center gap-1.5">
        <View
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isIncome ? 'bg-success' : isExpense ? 'bg-destructive' : 'bg-primary',
          )}
        />
        {labelNode}
      </View>
      <View className="mt-1">{valueNode}</View>
    </>
  ) : (
    <View className="flex-row items-center gap-2">
      <ClayIcon
        name={
          isIncome
            ? 'money-time/wallet-in'
            : isExpense
              ? 'money-time/wallet-out'
              : 'money-time/balance-scale'
        }
        size={22}
      />
      <View className="min-w-0 flex-1">
        {labelNode}
        <View className="mt-0.5">{valueNode}</View>
      </View>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={I18n.t(hidden ? 'home.show_summary_metric' : 'home.hide_summary_metric', {
        metric: label,
      })}
      onPress={onPress}
      className={cardClassName}
    >
      {content}
    </Pressable>
  );
}

export function InOutHeader({
  left,
  right,
  className,
}: {
  left: { metric: HomeSummaryMetric; value: React.ReactNode; hidden: boolean; onPress: () => void };
  right: {
    metric: HomeSummaryMetric;
    value: React.ReactNode;
    hidden: boolean;
    onPress: () => void;
  };
  className?: string;
}) {
  const labelFor = (metric: HomeSummaryMetric) => I18n.t(`nav.${metric}`);
  return (
    <View className={cn('w-full flex-row items-center gap-2', className)}>
      <FlowMetricCard
        label={labelFor(left.metric)}
        value={left.value}
        metric={left.metric}
        hidden={left.hidden}
        onPress={left.onPress}
      />
      <FlowMetricCard
        label={labelFor(right.metric)}
        value={right.value}
        metric={right.metric}
        hidden={right.hidden}
        onPress={right.onPress}
      />
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';

interface RecurringSummaryProps {
  /** Monthly cost of the active commitments, already formatted. */
  monthlyLabel: string;
  /** What is still to be charged before this financial month ends. */
  leftThisMonthLabel: string;
  yearlyLabel: string;
  activeCount: number;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-border/45 bg-card px-2.5 py-2.5">
      {/* Two lines, reserving the height of both: a third of the row does not
          hold "Left this month" on one line in English, let alone in German,
          and the three values below still have to share a baseline. */}
      <View className="min-h-[24px]">
        <Text
          variant="label"
          className="text-[9px] leading-[12px] tracking-normal"
          tone="muted"
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      {/* 13px rather than the primitive's 16: three mono columns have to hold a
          full year figure across the screen's width without truncating. */}
      <Text variant="mono" className="mt-1 text-[13px]" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The hero block: the one figure that answers "what do my commitments cost",
 * over the three numbers that put it in context.
 *
 * The headline is deliberately not boxed. Everything below it on the screen is
 * a card on the page surface, so leaving this bare is what puts it at the top
 * of the hierarchy rather than on the same level as a row in the list.
 */
export const RecurringSummary = React.memo(function RecurringSummary({
  monthlyLabel,
  leftThisMonthLabel,
  yearlyLabel,
  activeCount,
}: RecurringSummaryProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline gap-1.5">
        <Text variant="display" numberOfLines={1} className="flex-shrink">
          {monthlyLabel}
        </Text>
        <Text variant="label" tone="muted" className="tracking-normal">
          {I18n.t('recurring.per_month_suffix')}
        </Text>
      </View>

      <View className="flex-row gap-2">
        <StatTile label={I18n.t('recurring.left_this_month')} value={leftThisMonthLabel} />
        <StatTile label={I18n.t('recurring.per_year')} value={yearlyLabel} />
        <StatTile label={I18n.t('recurring.active_count')} value={String(activeCount)} />
      </View>
    </View>
  );
});

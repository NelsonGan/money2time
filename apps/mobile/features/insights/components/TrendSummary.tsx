import { ArrowDown, ArrowUp } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { withColorAlpha } from '~/utils/color';

/**
 * The read-outs around an Insights trend chart: the selected bucket's figure
 * with a quiet comparison pill and, when two categories are compared, both
 * totals. Values arrive as nodes because the
 * screen renders them in money or work time.
 */

export type TrendHeadlineBadge = {
  text: string;
  /** Tint for the pill and its arrow: good, bad or neutral news. */
  color: string;
  direction: 'up' | 'down' | null;
};

export function TrendHeadline({
  title,
  value,
  badge,
}: {
  /** The selected bucket, e.g. "Aug 2026"; left out when the header already says it. */
  title?: string;
  value: React.ReactNode;
  badge?: TrendHeadlineBadge | null;
}) {
  return (
    <View className="items-center gap-1 pt-1">
      {title ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {value}
      {badge ? (
        <View
          className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: withColorAlpha(badge.color, 0.1) }}
          accessible
          accessibilityLabel={badge.text}
        >
          {badge.direction === 'up' ? (
            <ArrowUp size={11} color={badge.color} strokeWidth={3} />
          ) : badge.direction === 'down' ? (
            <ArrowDown size={11} color={badge.color} strokeWidth={3} />
          ) : null}
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: badge.color, fontSize: 12, lineHeight: 16 }}
          >
            {badge.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export type TrendCompareSide = {
  label: string;
  color: string;
  total: React.ReactNode;
};

/** Both categories' totals side by side, and one line saying how they compare. */
export function TrendCompareSummary({
  first,
  second,
  sentence,
}: {
  first: TrendCompareSide;
  second: TrendCompareSide;
  sentence: string | null;
}) {
  const renderSide = (side: TrendCompareSide) => (
    <View className="flex-1 gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: side.color }} />
        <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
          {side.label}
        </Text>
      </View>
      {side.total}
    </View>
  );
  return (
    <View className="gap-2 rounded-3xl border border-border/40 bg-card px-4 py-3">
      <View className="flex-row gap-3">
        {renderSide(first)}
        {renderSide(second)}
      </View>
      {sentence ? (
        <Text variant="caption" tone="muted">
          {sentence}
        </Text>
      ) : null}
    </View>
  );
}

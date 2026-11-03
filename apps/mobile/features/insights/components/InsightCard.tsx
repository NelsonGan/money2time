import type React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { deltaLabel } from '~/features/review/lib/reviewFormat';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

/**
 * One shell for every section of a card-stacked insights page (Review,
 * Household): a real title in the foreground, optional meta on the right,
 * then content. The titles used to be muted uppercase micro-labels, which at
 * caption weight read as washed-out placeholder text rather than headings,
 * and gave seven cards no hierarchy between them.
 */
export function InsightCard({
  title,
  meta,
  metaNode,
  children,
}: {
  title: string;
  meta?: string;
  metaNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-3xl border border-border/25 bg-card p-4 shadow-soft">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="bodyStrong" className="shrink-0 text-foreground">
          {title}
        </Text>
        {/* The meta takes the slack and truncates, so a long period label
            ("27 Jul to 2 Aug") can never squeeze the card's title. */}
        {metaNode ??
          (meta ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1 text-right">
              {meta}
            </Text>
          ) : null)}
      </View>
      <View className="mt-3">{children}</View>
    </View>
  );
}

/**
 * Spending's change from the period before, as a tinted pill beside the
 * total: green when it fell, red when it rose, muted when flat.
 */
export function SpendDeltaPill({ changeRatio }: { changeRatio: number }) {
  const themeColors = useThemeColors();
  const percent = Math.round(changeRatio * 100);
  const tint =
    percent === 0 ? themeColors.textMuted : percent < 0 ? themeColors.success : themeColors.error;
  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{ backgroundColor: withColorAlpha(tint, 0.13) }}
    >
      <Text variant="caption" style={{ color: tint }}>
        {deltaLabel(changeRatio)}
      </Text>
    </View>
  );
}

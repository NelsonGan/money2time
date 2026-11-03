import type React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';

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

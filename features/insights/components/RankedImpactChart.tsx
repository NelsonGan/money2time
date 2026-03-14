import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

export interface RankedImpactRow {
  id: string;
  rank: number;
  title: string;
  subtitle?: string;
  primaryValue: React.ReactNode;
  secondaryValue?: React.ReactNode;
  sharePct: number;
  emoji?: string;
  accentColor?: string;
  onPress?: () => void;
}

interface RankedImpactChartProps {
  rows: RankedImpactRow[];
  accentColor?: string;
  shareLabel?: string;
}

const styles = StyleSheet.create({
  rankBadge: {
    marginTop: 2,
    height: 28,
    width: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressGlow: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
});

export function RankedImpactChart({
  rows,
  accentColor,
  shareLabel = 'Share',
}: RankedImpactChartProps) {
  const themeColors = useThemeColors();
  const activeAccent = accentColor ?? themeColors.primary;

  return (
    <View className="gap-1.5 mt-0.5">
      {rows.map((row) => {
        const rowAccent = row.accentColor ?? activeAccent;
        const share = Math.max(0, Math.min(100, row.sharePct));
        const fillWidth = share <= 0 ? 0 : Math.max(2.4, share);
        const barFill = withColorAlpha(rowAccent, 0.72);
        const barGlow = withColorAlpha(rowAccent, 0.25);
        const rowBackground = withColorAlpha(rowAccent, 0.06 + (share / 100) * 0.13);
        const rowBorder = withColorAlpha(rowAccent, 0.15 + (share / 100) * 0.3);
        const rankBackground = withColorAlpha(rowAccent, 0.16 + (share / 100) * 0.2);
        const rowStyle = { backgroundColor: rowBackground, borderColor: rowBorder };
        const accentTextStyle = { color: rowAccent };
        const content = (
          <>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-row items-start gap-2 flex-1 min-w-0">
                <View
                  style={[
                    styles.rankBadge,
                    {
                      backgroundColor: rankBackground,
                      borderColor: withColorAlpha(rowAccent, 0.35),
                    },
                  ]}
                >
                  <Text variant="label" style={accentTextStyle}>
                    {row.rank}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text variant="caption" numberOfLines={1}>
                    {row.emoji ? `${row.emoji} ` : ''}
                    {row.title}
                  </Text>
                  {row.subtitle ? (
                    <Text variant="label" tone="muted" numberOfLines={1}>
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="items-end pl-1">
                {typeof row.primaryValue === 'string' ? (
                  <Text variant="caption" style={accentTextStyle}>
                    {row.primaryValue}
                  </Text>
                ) : (
                  row.primaryValue
                )}
                {row.secondaryValue ? (
                  typeof row.secondaryValue === 'string' ? (
                    <Text variant="label" tone="muted" className="mt-0.5">
                      {row.secondaryValue}
                    </Text>
                  ) : (
                    row.secondaryValue
                  )
                ) : null}
              </View>
            </View>

            <View className="mt-2">
              <View className="h-2 rounded-full bg-secondary/70 overflow-hidden">
                <View
                  style={[
                    styles.progressFill,
                    { width: `${fillWidth}%`, backgroundColor: barFill },
                  ]}
                >
                  <View style={[styles.progressGlow, { backgroundColor: barGlow }]} />
                </View>
              </View>
              <View className="mt-1.5 flex-row items-center justify-between">
                <Text variant="label" tone="muted">
                  {shareLabel}
                </Text>
                <Text variant="label" style={accentTextStyle}>
                  {share.toFixed(1)}%
                </Text>
              </View>
            </View>
          </>
        );

        if (row.onPress) {
          return (
            <Pressable
              key={row.id}
              onPress={() => {
                void triggerHaptic('selection');
                row.onPress?.();
              }}
              className={cn('rounded-2xl border px-3 py-2.5 active:opacity-85')}
              style={rowStyle}
            >
              {content}
            </Pressable>
          );
        }

        return (
          <View key={row.id} className="rounded-2xl border px-3 py-2.5" style={rowStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

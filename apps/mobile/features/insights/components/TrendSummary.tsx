import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

/**
 * The read-outs around an Insights trend chart: the selected bucket's figure,
 * three stat cards, the bucket's top categories and, when two categories are
 * compared, a side-by-side summary. Values arrive as nodes because the screen
 * renders them in money or work time.
 */

export function TrendHeadline({
  title,
  value,
  caption,
  captionColor,
}: {
  /** The selected bucket, e.g. "Aug 2026". */
  title: string;
  value: React.ReactNode;
  caption?: string | null;
  captionColor?: string;
}) {
  return (
    <View className="items-center gap-0.5 pt-1">
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {title}
      </Text>
      {value}
      {caption ? (
        <Text
          variant="caption"
          numberOfLines={2}
          className="text-center"
          style={captionColor ? { color: captionColor } : undefined}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export type TrendStatCardItem = {
  key: string;
  label: string;
  value: React.ReactNode;
  /** Small text before the value, e.g. the month of the high. */
  detail?: string | null;
  kind: 'average' | 'high' | 'low';
};

export function TrendStatCards({
  items,
  highColor,
  lowColor,
}: {
  items: readonly TrendStatCardItem[];
  /** "Highest" reads as bad for spending and good for income, so the screen picks. */
  highColor: string;
  lowColor: string;
}) {
  const themeColors = useThemeColors();
  if (items.length === 0) return null;
  return (
    <View className="flex-row gap-2">
      {items.map((item) => {
        const tint =
          item.kind === 'high' ? highColor : item.kind === 'low' ? lowColor : themeColors.primary;
        const Icon =
          item.kind === 'high' ? ArrowUpRight : item.kind === 'low' ? ArrowDownRight : BarChart3;
        return (
          <View
            key={item.key}
            className="flex-1 gap-1 rounded-2xl border border-border/40 bg-card px-2.5 py-2.5"
          >
            <View className="flex-row items-center gap-1.5">
              <View
                className="h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: withColorAlpha(tint, 0.14) }}
              >
                <Icon size={14} color={tint} strokeWidth={2.5} />
              </View>
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                {item.label}
              </Text>
            </View>
            <View className="flex-row items-center">{item.value}</View>
            {item.detail ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
                {item.detail}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export type TrendCategoryRow = {
  id: string;
  label: string;
  icon: string;
  value: React.ReactNode;
  /** Share of the bucket, 0..1. */
  share: number;
  color: string;
};

export function TrendTopCategories({
  title,
  rows,
  onPressRow,
}: {
  title: string;
  rows: readonly TrendCategoryRow[];
  onPressRow: (row: TrendCategoryRow) => void;
}) {
  const themeColors = useThemeColors();
  if (rows.length === 0) return null;
  return (
    <View className="gap-1.5">
      <Text variant="bodyStrong" numberOfLines={1}>
        {title}
      </Text>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          onPress={() => onPressRow(row)}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          className="flex-row items-center gap-2.5 rounded-2xl border px-3 py-2 active:opacity-80"
          style={{
            backgroundColor: withColorAlpha(row.color, 0.08),
            borderColor: withColorAlpha(row.color, 0.22),
          }}
        >
          <CategoryEmoji icon={row.icon} size={22} />
          <View className="flex-1 gap-1">
            <Text variant="caption" numberOfLines={1}>
              {row.label}
            </Text>
            <View
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: withColorAlpha(themeColors.border, 0.5) }}
            >
              <View
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.round(Math.max(0.02, Math.min(1, row.share)) * 100)}%`,
                  backgroundColor: row.color,
                }}
              />
            </View>
          </View>
          <View className="items-end">
            {row.value}
            <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
              {`${Math.round(row.share * 100)}%`}
            </Text>
          </View>
          <ChevronRight size={16} color={themeColors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export type TrendCompareSide = {
  label: string;
  icon: string;
  color: string;
  total: React.ReactNode;
  average: React.ReactNode;
};

export function TrendCompareSummary({
  title,
  first,
  second,
  sentence,
  averageLabel,
}: {
  title: string;
  first: TrendCompareSide;
  second: TrendCompareSide;
  sentence: string | null;
  averageLabel: string;
}) {
  const themeColors = useThemeColors();
  const renderSide = (side: TrendCompareSide) => (
    <View className="flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: side.color }} />
        <CategoryEmoji icon={side.icon} size={16} />
        <Text variant="caption" numberOfLines={1} className="flex-1">
          {side.label}
        </Text>
      </View>
      {side.total}
      <View className="flex-row flex-wrap items-center gap-1">
        <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
          {averageLabel}
        </Text>
        {side.average}
      </View>
    </View>
  );
  return (
    <View className="gap-2.5 rounded-3xl border border-border/40 bg-card p-4">
      <Text variant="bodyStrong" numberOfLines={1}>
        {title}
      </Text>
      <View className="flex-row items-stretch gap-3">
        {renderSide(first)}
        <View
          className="w-px self-stretch"
          style={{ backgroundColor: withColorAlpha(themeColors.border, 0.8) }}
        />
        {renderSide(second)}
      </View>
      {sentence ? (
        <Text
          variant="caption"
          className="text-center"
          style={{ fontFamily: FONT.semibold, color: themeColors.text }}
        >
          {sentence}
        </Text>
      ) : null}
    </View>
  );
}

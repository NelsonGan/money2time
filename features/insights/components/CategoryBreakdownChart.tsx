import { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Svg, { G, Polyline, Text as SvgText } from 'react-native-svg';

import { CategoryEmoji, Text } from '~/components/ui';
import { categoryIconToEmoji } from '~/constants/categoryIcons';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';

import {
  BREAKDOWN_PIE_LABEL_HEIGHT,
  BREAKDOWN_PIE_LABEL_LINE_LENGTH,
  BREAKDOWN_PIE_LABEL_MARGIN,
  BREAKDOWN_PIE_LABEL_MAX_WIDTH,
  BREAKDOWN_PIE_LABEL_MIN_WIDTH,
  BREAKDOWN_PIE_LABEL_TAIL_LENGTH,
  BREAKDOWN_PIE_MAX_RADIUS,
  BREAKDOWN_PIE_MIN_RADIUS,
  layoutBreakdownPieLabels,
} from '../breakdownPieLayout';

export const INSIGHTS_CHART_COLORS = [
  '#E53935',
  '#FB8C00',
  '#FDD835',
  '#43A047',
  '#00897B',
  '#00ACC1',
  '#1E88E5',
  '#3949AB',
  '#8E24AA',
  '#D81B60',
  '#6D4C41',
  '#546E7A',
];

export interface BreakdownChartRow {
  id: string;
  label: string;
  /** Category icon/emoji for the legend + pie label. */
  emoji?: string | null;
  /** Absolute amount, in display units. */
  amount: number;
  count: number;
}

interface CategoryBreakdownChartProps {
  rows: BreakdownChartRow[];
  /** Formats an amount into the on-screen string (currency or hours). */
  formatValue: (amount: number) => string;
  /**
   * When provided, each legend row becomes tappable and reports the row id —
   * used to drill into a category (subcategories or its transactions).
   */
  onSelectRow?: (rowId: string) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Category breakdown pie + legend, matching the insights expense breakdown
 * (gifted-charts pie with a custom collision-avoiding outward-label overlay).
 */
export function CategoryBreakdownChart({
  rows,
  formatValue,
  onSelectRow,
}: CategoryBreakdownChartProps) {
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const isDark = resolvedTheme === 'dark';
  const { width } = useWindowDimensions();

  const total = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  const items = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        color: INSIGHTS_CHART_COLORS[index % INSIGHTS_CHART_COLORS.length],
        pct: total > 0 ? (row.amount / total) * 100 : 0,
      })),
    [rows, total],
  );

  // Pie + label geometry (mirrors the insights breakdown).
  const layoutWidth = Math.min(width, 440);
  const labelWidth = clamp(
    Math.floor(layoutWidth * 0.25),
    BREAKDOWN_PIE_LABEL_MIN_WIDTH,
    BREAKDOWN_PIE_LABEL_MAX_WIDTH,
  );
  const labelMaxChars = clamp(Math.floor((labelWidth - 14) / 5), 7, 13);
  const extraRadius = labelWidth + BREAKDOWN_PIE_LABEL_LINE_LENGTH + BREAKDOWN_PIE_LABEL_MARGIN + 6;
  const radius = clamp(
    Math.floor((layoutWidth - extraRadius * 2) / 2),
    BREAKDOWN_PIE_MIN_RADIUS,
    BREAKDOWN_PIE_MAX_RADIUS,
  );
  const stageWidth = (radius + extraRadius) * 2;
  const stageHeight = Math.max(
    radius * 2 + 24,
    stageWidth - Math.min(140, Math.max(92, extraRadius * 1.2)),
  );
  const verticalInset = Math.max(0, Math.floor((stageWidth - stageHeight) / 2));
  const cx = stageWidth / 2;
  const cy = stageWidth / 2 - verticalInset;

  const pieData = useMemo(
    () => items.map((item) => ({ value: item.amount, color: item.color })),
    [items],
  );

  const pieLabels = useMemo(
    () =>
      layoutBreakdownPieLabels(
        items.map((item) => ({ id: item.id, amount: item.amount })),
        {
          cx,
          cy,
          radius,
          elbowLength: BREAKDOWN_PIE_LABEL_LINE_LENGTH,
          tailLength: BREAKDOWN_PIE_LABEL_TAIL_LENGTH,
          labelWidth,
          labelHeight: BREAKDOWN_PIE_LABEL_HEIGHT,
          labelGap: BREAKDOWN_PIE_LABEL_HEIGHT + BREAKDOWN_PIE_LABEL_MARGIN,
          stageHeight,
          totalAmount: total,
        },
      ),
    [items, cx, cy, radius, labelWidth, stageHeight, total],
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  if (items.length === 0 || total <= 0) return null;

  return (
    <View style={{ width }}>
      {/* Total on top of the pie, matching the insights expense breakdown. */}
      <View className="items-center pb-1">
        <Text variant="subheading" className="text-destructive">
          {formatValue(total)}
        </Text>
        <View
          style={{
            marginTop: 3,
            width: 32,
            height: 3,
            borderRadius: 2,
            backgroundColor: withColorAlpha('#E53935', 0.3),
          }}
        />
      </View>

      <View className="items-center">
        <View style={{ width: stageWidth, height: stageHeight }}>
          <View pointerEvents="none" style={{ marginTop: -verticalInset }}>
            <PieChart data={pieData} radius={radius} extraRadius={extraRadius} />
          </View>
          <Svg
            pointerEvents="none"
            width={stageWidth}
            height={stageHeight}
            style={StyleSheet.absoluteFill}
          >
            {pieLabels.map((label) => {
              const item = itemById.get(label.id);
              if (!item) return null;
              const categoryLabel =
                item.label.length <= labelMaxChars
                  ? item.label
                  : `${item.label.slice(0, Math.max(1, labelMaxChars - 1)).trimEnd()}…`;
              const labelStroke = withColorAlpha(item.color, isDark ? 0.46 : 0.28);
              return (
                <G key={label.id}>
                  <Polyline
                    points={`${label.anchorX},${label.anchorY} ${label.outerX},${label.outerY} ${label.innerX},${label.labelY}`}
                    fill="none"
                    stroke={labelStroke}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <G x={label.boxLeft} y={label.labelY}>
                    <SvgText
                      x={labelWidth / 2}
                      y={-4}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={9.2}
                      fontFamily={FONT.bold}
                      fontWeight="700"
                      fill={themeColors.text}
                    >
                      {`${categoryIconToEmoji(item.emoji)} ${categoryLabel}`.trim()}
                    </SvgText>
                    <SvgText
                      x={labelWidth / 2}
                      y={8}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={8}
                      fontFamily={FONT.semibold}
                      fontWeight="600"
                      fill={withColorAlpha(themeColors.text, isDark ? 0.75 : 0.55)}
                    >
                      {`${item.pct.toFixed(1)}%`}
                    </SvgText>
                  </G>
                </G>
              );
            })}
          </Svg>
        </View>
      </View>

      <View className="mt-3 gap-1.5 px-5">
        {items.map((item) => {
          const pctRatio = Math.min(1, Math.max(0, item.pct / 100));
          return (
            <Pressable
              key={item.id}
              disabled={!onSelectRow}
              onPress={
                onSelectRow
                  ? () => {
                      void triggerHaptic('selection');
                      onSelectRow(item.id);
                    }
                  : undefined
              }
              accessibilityRole={onSelectRow ? 'button' : undefined}
              accessibilityLabel={`${item.emoji ?? ''} ${item.label}`.trim()}
              className={
                onSelectRow
                  ? 'rounded-xl border px-2.5 py-2 active:opacity-85'
                  : 'rounded-xl border px-2.5 py-2'
              }
              style={{
                backgroundColor: withColorAlpha(item.color, 0.07 + pctRatio * 0.22),
                borderColor: withColorAlpha(item.color, 0.2 + pctRatio * 0.32),
              }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1 flex-row items-center gap-1.5 pr-2">
                  <CategoryEmoji icon={item.emoji} size={16} />
                  <Text variant="caption" className="flex-1" numberOfLines={2}>
                    {item.label}
                  </Text>
                </View>
                <View className="items-end">
                  <View className="flex-row items-center gap-1.5">
                    <Text variant="caption">{formatValue(item.amount)}</Text>
                    <View
                      className="rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: withColorAlpha(item.color, 0.24) }}
                    >
                      <Text variant="label" className="text-foreground">
                        {item.pct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

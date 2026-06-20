import {
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { spacing } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import type { MonthlyWageSettings } from '~/types';
import { formatCurrency } from '~/utils/formatters';

export interface HourlyTimelineRow {
  item: MonthlyWageSettings;
  monthLabel: string;
  rate: number;
  /** Change in true hourly rate versus the previous (older) entry. `null` for the first entry. */
  delta: number | null;
  isCurrentMonth: boolean;
}

interface HourlyValueTimelineProps {
  /** Rows ordered newest first. */
  rows: HourlyTimelineRow[];
  /** True hourly rates ordered oldest → newest, for the sparkline. */
  sparklineValues: number[];
  currencySymbol: string;
  themeColors: ColorPalette;
  onEdit: (item: MonthlyWageSettings) => void;
  onDelete: (item: MonthlyWageSettings) => void;
}

const SPARKLINE_HEIGHT = 64;
const DOT_SIZE = 18;
const DOT_CENTER = 24;
const RAIL_WIDTH = 2;

const styles = StyleSheet.create({
  railColumn: {
    width: DOT_SIZE,
  },
  rail: {
    position: 'absolute',
    left: (DOT_SIZE - RAIL_WIDTH) / 2,
    width: RAIL_WIDTH,
  },
  dot: {
    position: 'absolute',
    top: DOT_CENTER - DOT_SIZE / 2,
    left: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
  trashButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function formatDelta(delta: number, baseValue: number, currencySymbol: string): string {
  const amount = formatCurrency(Math.abs(delta), currencySymbol);
  if (baseValue > 0) {
    const pct = Math.round((Math.abs(delta) / baseValue) * 100);
    return `${amount} · ${pct}%`;
  }
  return amount;
}

function DeltaChip({
  delta,
  baseValue,
  currencySymbol,
  themeColors,
}: {
  delta: number;
  baseValue: number;
  currencySymbol: string;
  themeColors: ColorPalette;
}) {
  const isUp = delta >= 0;
  const color = isUp ? themeColors.success : themeColors.coral;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-full px-2 py-1"
      style={{ backgroundColor: isUp ? themeColors.successSoft : themeColors.errorSoft }}
    >
      <Icon size={13} color={color} strokeWidth={2.5} />
      <Text variant="caption" style={{ color }}>
        {formatDelta(delta, baseValue, currencySymbol)}
      </Text>
    </View>
  );
}

function RateSparkline({
  values,
  width,
  color,
}: {
  values: number[];
  width: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    if (width <= 0 || values.length < 2) return null;
    const sidePad = 10;
    const topPad = 8;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const usableHeight = SPARKLINE_HEIGHT - topPad * 2;
    const stepX = (width - sidePad * 2) / (values.length - 1);
    const points = values.map((value, index) => {
      const x = sidePad + index * stepX;
      const y = topPad + (1 - (value - min) / range) * usableHeight;
      return { x, y };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
    const first = points[0];
    const last = points[points.length - 1];
    const area = `${line} ${last.x},${SPARKLINE_HEIGHT} ${first.x},${SPARKLINE_HEIGHT}`;
    return { line, area, last };
  }, [values, width]);

  if (!geometry) return null;

  return (
    <Svg width={width} height={SPARKLINE_HEIGHT}>
      <Polygon points={geometry.area} fill={color} fillOpacity={0.1} />
      <Polyline
        points={geometry.line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={geometry.last.x} cy={geometry.last.y} r={8} fill={color} fillOpacity={0.18} />
      <Circle cx={geometry.last.x} cy={geometry.last.y} r={4.5} fill={color} />
    </Svg>
  );
}

function HeroSummary({
  rows,
  sparklineValues,
  currencySymbol,
  themeColors,
}: {
  rows: HourlyTimelineRow[];
  sparklineValues: number[];
  currencySymbol: string;
  themeColors: ColorPalette;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const current = rows[0];

  const allTimeChange = useMemo(() => {
    if (sparklineValues.length < 2) return null;
    const first = sparklineValues[0];
    const last = sparklineValues[sparklineValues.length - 1];
    if (first <= 0) return null;
    const pct = Math.round(((last - first) / first) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  }, [sparklineValues]);

  const isAllTimeUp =
    sparklineValues.length >= 2 &&
    sparklineValues[sparklineValues.length - 1] >= sparklineValues[0];
  const trendColor = isAllTimeUp ? themeColors.success : themeColors.coral;
  const AllTimeIcon = isAllTimeUp ? TrendingUp : TrendingDown;

  return (
    <View className="overflow-hidden rounded-3xl border border-border/40 bg-card px-4 pb-3 pt-4">
      <Text variant="caption" tone="muted">
        {I18n.t('settings.hourly_now_label')}
      </Text>
      <View className="mt-0.5 flex-row items-center gap-2.5">
        <Text variant="title" className="text-primary">
          {formatCurrency(current.rate, currencySymbol)}
        </Text>
        {allTimeChange ? (
          <View
            className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
            style={{
              backgroundColor: isAllTimeUp ? themeColors.successSoft : themeColors.errorSoft,
            }}
          >
            <AllTimeIcon size={14} color={trendColor} strokeWidth={2.5} />
            <Text variant="caption" style={{ color: trendColor }}>
              {allTimeChange}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="mt-3" onLayout={onLayout}>
        <RateSparkline values={sparklineValues} width={width} color={trendColor} />
      </View>
    </View>
  );
}

function TimelineRow({
  row,
  previousRate,
  isListFirst,
  isListLast,
  currencySymbol,
  themeColors,
  onEdit,
  onDelete,
}: {
  row: HourlyTimelineRow;
  previousRate: number | null;
  isListFirst: boolean;
  isListLast: boolean;
  currencySymbol: string;
  themeColors: ColorPalette;
  onEdit: (item: MonthlyWageSettings) => void;
  onDelete: (item: MonthlyWageSettings) => void;
}) {
  const isUp = row.delta !== null && row.delta >= 0;
  const dotBorderColor = row.isCurrentMonth
    ? themeColors.success
    : row.delta === null
      ? themeColors.primaryMuted
      : isUp
        ? themeColors.success
        : themeColors.coral;

  // A lone entry (first and last) has nothing to connect to, so it draws no rail.
  const isSingle = isListFirst && isListLast;
  const railStyle = isListLast
    ? { top: 0, height: DOT_CENTER }
    : { top: isListFirst ? DOT_CENTER : 0, bottom: -spacing.sm };

  return (
    <View className="flex-row" style={isListLast ? undefined : { paddingBottom: spacing.sm }}>
      <View style={styles.railColumn}>
        {!isSingle ? (
          <View style={[styles.rail, railStyle, { backgroundColor: themeColors.border }]} />
        ) : null}
        <View
          style={[styles.dot, { borderColor: dotBorderColor, backgroundColor: themeColors.card }]}
        />
      </View>

      <Pressable
        onPress={() => onEdit(row.item)}
        className="ml-3 flex-1 flex-row items-center gap-2 rounded-2xl border border-border/40 bg-card px-3.5 py-3"
        accessibilityRole="button"
        accessibilityLabel={`${row.monthLabel} ${formatCurrency(row.rate, currencySymbol)}`}
      >
        <View className="flex-1 gap-1">
          <Text
            variant="caption"
            style={{ color: row.isCurrentMonth ? themeColors.success : themeColors.textMuted }}
          >
            {row.monthLabel}
          </Text>
          <Text variant="subheading">
            {formatCurrency(row.rate, currencySymbol)}
            <Text variant="caption" tone="muted">
              /hr
            </Text>
          </Text>
          {!isListFirst && row.delta !== null && previousRate !== null ? (
            <DeltaChip
              delta={row.delta}
              baseValue={previousRate}
              currencySymbol={currencySymbol}
              themeColors={themeColors}
            />
          ) : null}
        </View>
        <Pressable
          onPress={() => onDelete(row.item)}
          style={styles.trashButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.delete')}
        >
          <Trash2 size={16} color={themeColors.textMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

export function HourlyValueTimeline({
  rows,
  sparklineValues,
  currencySymbol,
  themeColors,
  onEdit,
  onDelete,
}: HourlyValueTimelineProps) {
  return (
    <View className="gap-4">
      <HeroSummary
        rows={rows}
        sparklineValues={sparklineValues}
        currencySymbol={currencySymbol}
        themeColors={themeColors}
      />

      <View>
        <Text variant="label" tone="muted" className="mb-2 ml-1">
          {I18n.t('settings.hourly_timeline')}
        </Text>
        {rows.map((row, index) => (
          <TimelineRow
            key={row.item.id}
            row={row}
            previousRate={rows[index + 1]?.rate ?? null}
            isListFirst={index === 0}
            isListLast={index === rows.length - 1}
            currencySymbol={currencySymbol}
            themeColors={themeColors}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </View>
    </View>
  );
}

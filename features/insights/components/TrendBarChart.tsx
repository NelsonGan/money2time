import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface TrendBarChartProps {
  data: { monthKey: string; value: number; label: string }[];
  chartWidth: number;
  chartHeight: number;
  primaryColor: string;
  averageValue: number;
  referenceColor: string;
  selectedMonthKey: string | null;
  onSelectMonthKey: (monthKey: string) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  labelColor: string;
  gridLineColor: string;
}

const BOTTOM_LABEL_HEIGHT = 20;
const TOP_PADDING = 12;
const SIDE_PADDING = 4;

const shortMonthFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getShortMonthLabel(monthKey: string): string {
  const locale = I18n.locale ?? I18n.defaultLocale ?? 'en';
  let formatter = shortMonthFormatterByLocale.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    shortMonthFormatterByLocale.set(locale, formatter);
  }
  const date = new Date(`${monthKey}-15T00:00:00`);
  return formatter.format(date);
}

function withAlpha(hex: string, alpha: number): string {
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
}

export const TrendBarChart = React.memo(function TrendBarChart({
  data,
  chartWidth,
  chartHeight,
  primaryColor,
  averageValue,
  referenceColor,
  selectedMonthKey,
  onSelectMonthKey,
  onGestureStart,
  onGestureEnd,
  labelColor,
  gridLineColor,
}: TrendBarChartProps) {
  const barCount = data.length;
  const drawableWidth = chartWidth - SIDE_PADDING * 2;
  const drawableHeight = chartHeight - BOTTOM_LABEL_HEIGHT - TOP_PADDING;
  const maxValue = useMemo(() => {
    const peak = Math.max(...data.map((d) => d.value), 0);
    return peak > 0 ? peak * 1.1 : 1;
  }, [data]);

  const barWidth = useMemo(() => {
    if (barCount === 0) return 0;
    const totalGap = barCount > 1 ? (barCount - 1) * 4 : 0;
    return Math.max(6, (drawableWidth - totalGap) / barCount);
  }, [barCount, drawableWidth]);

  const gap = barCount > 1 ? (drawableWidth - barWidth * barCount) / (barCount - 1) : 0;

  const bars = useMemo(
    () =>
      data.map((d, i) => {
        const barHeight = maxValue > 0 ? (d.value / maxValue) * drawableHeight : 0;
        const x = SIDE_PADDING + i * (barWidth + gap);
        const y = TOP_PADDING + drawableHeight - barHeight;
        return {
          ...d,
          x,
          y,
          barHeight,
          barWidth,
          index: i,
        };
      }),
    [data, maxValue, drawableHeight, barWidth, gap],
  );

  const averageY = useMemo(() => {
    if (averageValue <= 0 || maxValue <= 0) return null;
    return TOP_PADDING + drawableHeight - (averageValue / maxValue) * drawableHeight;
  }, [averageValue, maxValue, drawableHeight]);

  const lastSelectedRef = useRef<string | null>(null);

  const resolveBarFromX = useCallback(
    (x: number) => {
      if (bars.length === 0) return null;
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        if (!bar) continue;
        if (x >= bar.x - gap / 2 && x <= bar.x + bar.barWidth + gap / 2) {
          return bar;
        }
      }
      if (x < (bars[0]?.x ?? 0)) return bars[0] ?? null;
      return bars[bars.length - 1] ?? null;
    },
    [bars, gap],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4,
        onPanResponderGrant: (event) => {
          onGestureStart();
          const x = event.nativeEvent.locationX;
          const bar = resolveBarFromX(x);
          if (bar) {
            lastSelectedRef.current = bar.monthKey;
            onSelectMonthKey(bar.monthKey);
            void triggerHaptic('selection');
          }
        },
        onPanResponderMove: (event) => {
          const x = event.nativeEvent.locationX;
          const bar = resolveBarFromX(x);
          if (bar && bar.monthKey !== lastSelectedRef.current) {
            lastSelectedRef.current = bar.monthKey;
            onSelectMonthKey(bar.monthKey);
            void triggerHaptic('selection');
          }
        },
        onPanResponderRelease: () => {
          onGestureEnd();
          lastSelectedRef.current = null;
        },
        onPanResponderTerminate: () => {
          onGestureEnd();
          lastSelectedRef.current = null;
        },
      }),
    [onGestureStart, onGestureEnd, onSelectMonthKey, resolveBarFromX],
  );

  if (barCount === 0) return null;

  const gradientId = `barGrad-${primaryColor.replace('#', '')}`;
  const selectedGradientId = `barGradSel-${primaryColor.replace('#', '')}`;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View {...panResponder.panHandlers} style={{ width: chartWidth, height: chartHeight }}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primaryColor} stopOpacity={0.35} />
              <Stop offset="1" stopColor={primaryColor} stopOpacity={0.12} />
            </LinearGradient>
            <LinearGradient id={selectedGradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primaryColor} stopOpacity={0.95} />
              <Stop offset="1" stopColor={primaryColor} stopOpacity={0.65} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((fraction) => {
            const lineY = TOP_PADDING + drawableHeight * (1 - fraction);
            return (
              <Line
                key={`grid-${fraction}`}
                x1={SIDE_PADDING}
                y1={lineY}
                x2={chartWidth - SIDE_PADDING}
                y2={lineY}
                stroke={gridLineColor}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Bars */}
          {bars.map((bar) => {
            const isSelected = bar.monthKey === selectedMonthKey;
            const rx = Math.min(4, bar.barWidth / 2);
            const minBarHeight = bar.value > 0 ? Math.max(3, bar.barHeight) : 0;
            const adjustedY =
              bar.value > 0
                ? TOP_PADDING + drawableHeight - minBarHeight
                : TOP_PADDING + drawableHeight;

            return (
              <Rect
                key={bar.monthKey}
                x={bar.x}
                y={adjustedY}
                width={bar.barWidth}
                height={minBarHeight}
                rx={rx}
                ry={rx}
                fill={isSelected ? `url(#${selectedGradientId})` : `url(#${gradientId})`}
              />
            );
          })}

          {/* Average reference line */}
          {averageY !== null ? (
            <Line
              x1={SIDE_PADDING}
              y1={averageY}
              x2={chartWidth - SIDE_PADDING}
              y2={averageY}
              stroke={referenceColor}
              strokeWidth={1.2}
              strokeDasharray="6,4"
              opacity={0.6}
            />
          ) : null}

          {/* Month labels */}
          {bars.map((bar) => {
            const isSelected = bar.monthKey === selectedMonthKey;
            const labelFontSize = barCount > 6 ? Math.max(6.5, Math.min(8, barWidth * 0.4)) : 9;
            return (
              <SvgText
                key={`label-${bar.monthKey}`}
                x={bar.x + bar.barWidth / 2}
                y={chartHeight - 4}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight={isSelected ? '700' : '400'}
                fill={isSelected ? primaryColor : labelColor}
                opacity={isSelected ? 1 : 0.6}
              >
                {getShortMonthLabel(bar.monthKey)}
              </SvgText>
            );
          })}
        </Svg>
      </View>
    </Animated.View>
  );
});

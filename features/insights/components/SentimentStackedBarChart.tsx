import React, { useId, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Rect, Text as SvgText } from 'react-native-svg';

import { FONT } from '~/utils/fonts';

interface SentimentDayData {
  dayKey: string;
  label: string;
  subLabel?: string | null;
  happy: number;
  neutral: number;
  sad: number;
  total: number;
}

interface SentimentStackedBarChartProps {
  data: SentimentDayData[];
  chartWidth: number;
  chartHeight: number;
  labelColor: string;
  happyColor: string;
  neutralColor: string;
  sadColor: string;
}

const SINGLE_LINE_LABEL_HEIGHT = 20;
const DOUBLE_LINE_LABEL_HEIGHT = 30;
const TOP_PADDING = 12;
const SIDE_PADDING = 4;

export const SentimentStackedBarChart = React.memo(function SentimentStackedBarChart({
  data,
  chartWidth,
  chartHeight,
  labelColor,
  happyColor,
  neutralColor,
  sadColor,
}: SentimentStackedBarChartProps) {
  const clipPathPrefix = useId().replace(/:/g, '');
  const barCount = data.length;
  const hasMultiLineLabels = useMemo(() => data.some((datum) => Boolean(datum.subLabel)), [data]);
  const drawableWidth = chartWidth - SIDE_PADDING * 2;
  const drawableHeight =
    chartHeight -
    (hasMultiLineLabels ? DOUBLE_LINE_LABEL_HEIGHT : SINGLE_LINE_LABEL_HEIGHT) -
    TOP_PADDING;

  const maxValue = useMemo(() => {
    const peak = Math.max(...data.map((d) => d.total), 0);
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
        const x = SIDE_PADDING + i * (barWidth + gap);
        const totalHeight = maxValue > 0 ? (d.total / maxValue) * drawableHeight : 0;
        const totalY = TOP_PADDING + drawableHeight - totalHeight;
        const sadHeight = d.total > 0 ? (d.sad / d.total) * totalHeight : 0;
        const neutralHeight = d.total > 0 ? (d.neutral / d.total) * totalHeight : 0;
        const happyHeight = d.total > 0 ? (d.happy / d.total) * totalHeight : 0;
        const baseY = TOP_PADDING + drawableHeight;
        const cornerRadius = Math.min(barWidth / 2, totalHeight / 2, 7);
        const clipPathId = `${clipPathPrefix}-bar-${i}`;

        return {
          ...d,
          x,
          barWidth,
          totalHeight,
          totalY,
          cornerRadius,
          clipPathId,
          segments: [
            { color: sadColor, height: sadHeight, y: baseY - sadHeight },
            {
              color: neutralColor,
              height: neutralHeight,
              y: baseY - sadHeight - neutralHeight,
            },
            {
              color: happyColor,
              height: happyHeight,
              y: baseY - sadHeight - neutralHeight - happyHeight,
            },
          ].filter((s) => s.height > 0),
        };
      }),
    [
      data,
      maxValue,
      drawableHeight,
      barWidth,
      gap,
      sadColor,
      neutralColor,
      happyColor,
      clipPathPrefix,
    ],
  );

  if (barCount === 0) return null;

  const labelFontSize =
    barCount > 14
      ? Math.max(5.5, Math.min(7, barWidth * 0.35))
      : barCount > 7
        ? Math.max(6.5, Math.min(8, barWidth * 0.4))
        : 9;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View style={{ width: chartWidth, height: chartHeight }}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            {bars
              .filter((bar) => bar.totalHeight > 0)
              .map((bar) => (
                <ClipPath key={bar.clipPathId} id={bar.clipPathId}>
                  <Rect
                    x={bar.x}
                    y={bar.totalY}
                    width={bar.barWidth}
                    height={bar.totalHeight}
                    rx={bar.cornerRadius}
                    ry={bar.cornerRadius}
                  />
                </ClipPath>
              ))}
          </Defs>

          {bars.map((bar) => (
            <React.Fragment key={bar.dayKey}>
              <G clipPath={bar.totalHeight > 0 ? `url(#${bar.clipPathId})` : undefined}>
                {bar.segments.map((seg, segIdx) => (
                  <Rect
                    key={`${bar.dayKey}-${segIdx}`}
                    x={bar.x}
                    y={seg.y}
                    width={bar.barWidth}
                    height={seg.height}
                    fill={seg.color}
                    opacity={0.85}
                  />
                ))}
              </G>
            </React.Fragment>
          ))}

          {bars.map((bar) => (
            <React.Fragment key={`label-${bar.dayKey}`}>
              <SvgText
                x={bar.x + bar.barWidth / 2}
                y={bar.subLabel ? chartHeight - 14 : chartHeight - 4}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontFamily={FONT.regular}
                fontWeight="400"
                fill={labelColor}
                opacity={0.68}
              >
                {bar.label}
              </SvgText>
              {bar.subLabel ? (
                <SvgText
                  x={bar.x + bar.barWidth / 2}
                  y={chartHeight - 3}
                  textAnchor="middle"
                  fontSize={Math.max(6, labelFontSize - 0.5)}
                  fontFamily={FONT.regular}
                  fontWeight="400"
                  fill={labelColor}
                  opacity={0.56}
                >
                  {bar.subLabel}
                </SvgText>
              ) : null}
            </React.Fragment>
          ))}
        </Svg>
      </View>
    </Animated.View>
  );
});

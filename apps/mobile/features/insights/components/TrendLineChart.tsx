import {
  Canvas,
  Circle,
  DashPathEffect,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text as RNText, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import {
  axisLabelStep,
  bucketCenterX,
  bucketIndexAtX,
  buildAreaPath,
  buildLinePath,
  buildPlotPoints,
  buildTrendLineScale,
  isAxisLabelShown,
  nearestValuedIndex,
  type TrendLinePlotPoint,
  valueToY,
} from '~/features/insights/lib/trendLineGeometry';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

export type TrendLineChartBucket = {
  key: string;
  /** Text under the point on the x axis (thinned when they do not fit). */
  label: string;
  /** What the tooltip calls the bucket, e.g. "Aug 2026". */
  title: string;
};

export type TrendLineChartSeries = {
  key: string;
  label: string;
  color: string;
  /** One value per bucket; null leaves a gap (a month that has not happened yet). */
  values: readonly (number | null)[];
};

interface TrendLineChartProps {
  buckets: readonly TrendLineChartBucket[];
  /** One line, or two when comparing. The first one gets the fill. */
  series: readonly TrendLineChartSeries[];
  width: number;
  height: number;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  /** Draws a dashed reference line, labelled `averageLabel`. */
  averageValue?: number | null;
  averageLabel?: string;
  /** Amounts that never go negative read from zero; balances keep their own range. */
  zeroBased?: boolean;
  /** Smallest gap between value ticks; set it when axis labels are rounded. */
  minTickStep?: number;
  gridColor: string;
  labelColor: string;
  surfaceColor: string;
  tooltipBackground: string;
  tooltipTextColor: string;
  accessibilityLabel?: string;
}

/** The gutter on the right that holds the value labels. */
const AXIS_WIDTH = 50;
const X_AXIS_HEIGHT = 20;
const TOOLTIP_ROW_HEIGHT = 17;
const TOOLTIP_VERTICAL_PADDING = 6;
const TOOLTIP_POINTER_SIZE = 8;
const TOOLTIP_WIDTH_SAFETY = 1.15;
/** How far a finger moves sideways before a touch becomes a scrub. */
const SCRUB_START_DISTANCE = 6;
const TOOLTIP_GAP = 8;
const STROKE_WIDTH = 2.6;
const DOT_RADIUS = 3.6;
const DOT_RING_RADIUS = 5.2;
const SELECTED_DOT_RADIUS = 5.2;
const SELECTED_RING_RADIUS = 8.5;
/** Past this many buckets, only the selected point gets a dot. */
const MAX_DOTTED_BUCKETS = 24;
const AXIS_FONT_SIZE = 10;
const TOOLTIP_FONT_SIZE = 11.5;
const TOOLTIP_MAX_WIDTH = 240;
const TOOLTIP_PADDING = 9;
const X_LABEL_WIDTH = 40;
const AVERAGE_PILL_HEIGHT = 16;
const GRID_DASH = [2, 4];
/** Wide (Thai, CJK) characters take about a full em, Latin ones about 0.62. */
function isLonePoint(
  point: TrendLinePlotPoint,
  index: number,
  points: readonly TrendLinePlotPoint[],
): boolean {
  return (
    points[index - 1]?.index !== point.index - 1 && points[index + 1]?.index !== point.index + 1
  );
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += (char.codePointAt(0) ?? 0) >= 0x0e00 ? TOOLTIP_FONT_SIZE : TOOLTIP_FONT_SIZE * 0.62;
  }
  return Math.ceil(width);
}
const AVERAGE_DASH = [6, 4];
const GUIDE_DASH = [3, 3];

/**
 * A line-and-point trend chart: a dot on every bucket, a guide line and a
 * tooltip over the selected one, and a haptic tick as a finger scrubs from
 * bucket to bucket. One series, or two for a comparison, which the tooltip
 * then doubles as the legend for.
 *
 * Drawn with Skia. Paths depend only on the data and size, so scrubbing
 * re-renders just the guide, the selected dots and the tooltip.
 */
export const TrendLineChart = React.memo(
  function TrendLineChartImpl({
    buckets,
    series,
    width,
    height,
    selectedKey,
    onSelectKey,
    onGestureStart,
    onGestureEnd,
    formatValue,
    formatAxisValue,
    averageValue,
    averageLabel,
    zeroBased = true,
    minTickStep = 0,
    gridColor,
    labelColor,
    surfaceColor,
    tooltipBackground,
    tooltipTextColor,
    accessibilityLabel,
  }: TrendLineChartProps) {
    const isComparison = series.length > 1;
    // The card (a title row and one row per line) plus half its pointer.
    const tooltipHeight =
      TOOLTIP_VERTICAL_PADDING * 2 +
      TOOLTIP_ROW_HEIGHT * (series.length + 1) +
      TOOLTIP_POINTER_SIZE / 2;
    const plotWidth = Math.max(0, width - AXIS_WIDTH);
    const plotTop = tooltipHeight + TOOLTIP_GAP + SELECTED_RING_RADIUS;
    const plotBottom = height - X_AXIS_HEIGHT - SELECTED_RING_RADIUS;
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const bucketCount = buckets.length;

    const geometry = useMemo(() => {
      const valueSets = series.map((entry) => entry.values);
      const withAverage =
        averageValue !== null && averageValue !== undefined && Number.isFinite(averageValue)
          ? [...valueSets, [averageValue]]
          : valueSets;
      const scale = buildTrendLineScale(withAverage, { zeroBased, minStep: minTickStep });
      const lines = series.map((entry) => {
        const points = buildPlotPoints(entry.values, scale, plotWidth, plotTop, plotHeight);
        const line = Skia.Path.MakeFromSVGString(buildLinePath(points) || 'M 0 0');
        return { key: entry.key, color: entry.color, points, line };
      });
      const primary = lines[0];
      const areaSvg =
        !isComparison && primary ? buildAreaPath(primary.points, plotTop + plotHeight) : '';
      const area = areaSvg ? Skia.Path.MakeFromSVGString(areaSvg) : null;
      const ticks = scale.ticks
        .map((value) => ({ value, y: valueToY(value, scale, plotTop, plotHeight) }))
        .filter((tick) => tick.y >= plotTop - 1 && tick.y <= plotTop + plotHeight + 1);
      const gridSvg = ticks.map((tick) => `M 0 ${tick.y} L ${plotWidth} ${tick.y}`).join(' ');
      const grid = gridSvg ? Skia.Path.MakeFromSVGString(gridSvg) : null;
      const zeroY = scale.min < 0 && scale.max > 0 ? valueToY(0, scale, plotTop, plotHeight) : null;
      const zeroLine =
        zeroY === null ? null : Skia.Path.MakeFromSVGString(`M 0 ${zeroY} L ${plotWidth} ${zeroY}`);
      const averageY =
        averageValue !== null && averageValue !== undefined && Number.isFinite(averageValue)
          ? valueToY(averageValue, scale, plotTop, plotHeight)
          : null;
      const averageLine =
        averageY === null
          ? null
          : Skia.Path.MakeFromSVGString(`M 0 ${averageY} L ${plotWidth} ${averageY}`);
      const labelStep = axisLabelStep(
        buckets.map((bucket) => bucket.label),
        plotWidth,
      );
      return { scale, lines, area, ticks, grid, zeroLine, averageY, averageLine, labelStep };
    }, [
      averageValue,
      buckets,
      isComparison,
      minTickStep,
      plotHeight,
      plotTop,
      plotWidth,
      series,
      zeroBased,
    ]);

    const selectedIndex = useMemo(
      () => buckets.findIndex((bucket) => bucket.key === selectedKey),
      [buckets, selectedKey],
    );
    const selectedPoints = useMemo(
      () =>
        geometry.lines.map((line) => ({
          key: line.key,
          color: line.color,
          point: line.points.find((point) => point.index === selectedIndex) ?? null,
        })),
      [geometry.lines, selectedIndex],
    );
    const selectedX =
      selectedIndex >= 0 ? bucketCenterX(selectedIndex, bucketCount, plotWidth) : null;
    const guide = useMemo(() => {
      if (selectedX === null) return null;
      return Skia.Path.MakeFromSVGString(
        `M ${selectedX} ${tooltipHeight} L ${selectedX} ${plotTop + plotHeight}`,
      );
    }, [plotHeight, plotTop, selectedX, tooltipHeight]);

    // The gesture reads the latest data through a ref so the responder is built once.
    const latest = useRef({ buckets, series, plotWidth, selectedKey, onSelectKey });
    latest.current = { buckets, series, plotWidth, selectedKey, onSelectKey };
    const gestureCallbacks = useRef({ onGestureStart, onGestureEnd });
    gestureCallbacks.current = { onGestureStart, onGestureEnd };

    const panResponder = useMemo(() => {
      const selectAt = (x: number) => {
        const current = latest.current;
        const raw = bucketIndexAtX(x, current.buckets.length, current.plotWidth);
        const index = nearestValuedIndex(
          raw,
          current.series.map((entry) => entry.values),
        );
        const bucket = index >= 0 ? current.buckets[index] : undefined;
        if (!bucket || bucket.key === current.selectedKey) return;
        latest.current = { ...current, selectedKey: bucket.key };
        void triggerHaptic('selection');
        current.onSelectKey(bucket.key);
      };
      // A touch only picks a month once it is a tap or a sideways drag, so a
      // vertical scroll that starts on the chart moves the page and leaves the
      // selection alone (the page's scroll view takes the touch over).
      let isScrubbing = false;
      const end = () => {
        isScrubbing = false;
        gestureCallbacks.current.onGestureEnd?.();
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => !isScrubbing,
        onPanResponderGrant: () => {
          isScrubbing = false;
          gestureCallbacks.current.onGestureStart?.();
        },
        onPanResponderMove: (event, state) => {
          if (!isScrubbing) {
            if (Math.abs(state.dx) < SCRUB_START_DISTANCE) return;
            if (Math.abs(state.dy) > Math.abs(state.dx)) return;
            isScrubbing = true;
          }
          selectAt(event.nativeEvent.locationX);
        },
        onPanResponderRelease: (event, state) => {
          // A tap (no real movement) picks the month under the finger.
          if (
            !isScrubbing &&
            Math.abs(state.dx) < SCRUB_START_DISTANCE &&
            Math.abs(state.dy) < SCRUB_START_DISTANCE
          ) {
            selectAt(event.nativeEvent.locationX);
          }
          end();
        },
        onPanResponderTerminate: end,
      });
    }, []);

    const selectedBucket = selectedIndex >= 0 ? buckets[selectedIndex] : undefined;
    const tooltipValueTexts = useMemo(
      () => selectedPoints.map((entry) => (entry.point ? formatValue(entry.point.value) : '–')),
      [formatValue, selectedPoints],
    );
    // The tooltip sizes itself to its text. It sits in a box centred on the
    // point, as wide as the room on the narrower side allows, so it is centred
    // over the point without being measured; when its estimated width will not
    // fit there it pins to that edge of the chart instead.
    const estimatedTooltipWidth = useMemo(() => {
      const lines = [
        selectedBucket?.title ?? '',
        ...series.map(
          (entry, index) =>
            `${'    '}${isComparison ? `${entry.label}  ` : ''}${tooltipValueTexts[index] ?? ''}`,
        ),
      ];
      return Math.max(...lines.map(estimateTextWidth)) + TOOLTIP_PADDING * 2 + 4;
    }, [isComparison, selectedBucket, series, tooltipValueTexts]);
    let tooltipBox: { left: number; width: number; align: 'center' | 'flex-start' | 'flex-end' } = {
      left: 0,
      width,
      align: 'center',
    };
    if (selectedX !== null) {
      const half = Math.min(selectedX, width - selectedX, TOOLTIP_MAX_WIDTH / 2);
      const edgeWidth = Math.min(width, TOOLTIP_MAX_WIDTH);
      // A margin on the estimate, so a card slightly wider than guessed pins
      // to the edge instead of spilling past it.
      if (estimatedTooltipWidth * TOOLTIP_WIDTH_SAFETY <= half * 2) {
        tooltipBox = { left: selectedX - half, width: half * 2, align: 'center' };
      } else if (selectedX < width / 2) {
        tooltipBox = { left: 0, width: edgeWidth, align: 'flex-start' };
      } else {
        tooltipBox = { left: width - edgeWidth, width: edgeWidth, align: 'flex-end' };
      }
    }

    if (bucketCount === 0 || width <= 0) return null;
    const showAllDots = bucketCount <= MAX_DOTTED_BUCKETS;
    const primaryColor = series[0]?.color ?? labelColor;
    const axisTextStyle = { color: labelColor };

    return (
      <Animated.View
        entering={FadeIn.duration(220)}
        {...REPLAY_PRIVATE}
        style={{ width, height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {/* box-only: the axis labels never become the touch target, so
            locationX is always measured from the chart's left edge. */}
        <View style={{ width, height }} pointerEvents="box-only" {...panResponder.panHandlers}>
          <Canvas style={{ width: plotWidth, height }} pointerEvents="none">
            {geometry.grid ? (
              <Path path={geometry.grid} style="stroke" strokeWidth={1} color={gridColor}>
                <DashPathEffect intervals={GRID_DASH} />
              </Path>
            ) : null}
            {geometry.zeroLine ? (
              <Path
                path={geometry.zeroLine}
                style="stroke"
                strokeWidth={1}
                color={withColorAlpha(labelColor, 0.45)}
              />
            ) : null}
            {geometry.area ? (
              <Path path={geometry.area} style="fill">
                <LinearGradient
                  start={vec(0, plotTop)}
                  end={vec(0, plotTop + plotHeight)}
                  colors={[withColorAlpha(primaryColor, 0.24), withColorAlpha(primaryColor, 0)]}
                />
              </Path>
            ) : null}
            {geometry.averageLine ? (
              <Path
                path={geometry.averageLine}
                style="stroke"
                strokeWidth={1.2}
                color={withColorAlpha(primaryColor, 0.6)}
              >
                <DashPathEffect intervals={AVERAGE_DASH} />
              </Path>
            ) : null}
            {guide ? (
              <Path
                path={guide}
                style="stroke"
                strokeWidth={1.2}
                color={withColorAlpha(labelColor, 0.7)}
              >
                <DashPathEffect intervals={GUIDE_DASH} />
              </Path>
            ) : null}
            {geometry.lines.map((line) =>
              line.line ? (
                <Path
                  key={line.key}
                  path={line.line}
                  style="stroke"
                  strokeWidth={STROKE_WIDTH}
                  strokeCap="round"
                  strokeJoin="round"
                  color={line.color}
                />
              ) : null,
            )}
            {geometry.lines.map((line) =>
              line.points
                // Past the dotted limit, only a point with no line on either
                // side gets a dot, or it would not show at all.
                .filter((point: TrendLinePlotPoint, index, points) =>
                  showAllDots ? true : isLonePoint(point, index, points),
                )
                .map((point: TrendLinePlotPoint) => (
                  <React.Fragment key={`${line.key}-${point.index}`}>
                    <Circle cx={point.x} cy={point.y} r={DOT_RING_RADIUS} color={surfaceColor} />
                    <Circle cx={point.x} cy={point.y} r={DOT_RADIUS} color={line.color} />
                  </React.Fragment>
                )),
            )}
            {selectedPoints.map((entry) =>
              entry.point ? (
                <React.Fragment key={`selected-${entry.key}`}>
                  <Circle
                    cx={entry.point.x}
                    cy={entry.point.y}
                    r={SELECTED_RING_RADIUS}
                    color={surfaceColor}
                  />
                  <Circle
                    cx={entry.point.x}
                    cy={entry.point.y}
                    r={SELECTED_DOT_RADIUS}
                    color={entry.color}
                  />
                </React.Fragment>
              ) : null,
            )}
          </Canvas>

          {geometry.ticks.map((tick) => (
            <RNText
              key={`tick-${tick.value}`}
              numberOfLines={1}
              style={[
                styles.axisText,
                styles.tickText,
                axisTextStyle,
                { left: plotWidth + 6, top: tick.y - 7 },
              ]}
            >
              {formatAxisValue(tick.value)}
            </RNText>
          ))}

          {geometry.averageY !== null && averageLabel ? (
            <View
              pointerEvents="none"
              style={[
                styles.averagePill,
                {
                  top: geometry.averageY - AVERAGE_PILL_HEIGHT - 2,
                  maxWidth: plotWidth - 4,
                  backgroundColor: withColorAlpha(surfaceColor, 0.92),
                },
              ]}
            >
              <RNText numberOfLines={1} style={[styles.averageText, { color: primaryColor }]}>
                {averageLabel}
              </RNText>
            </View>
          ) : null}

          {buckets.map((bucket, index) =>
            bucket.label && isAxisLabelShown(index, bucketCount, geometry.labelStep) ? (
              <RNText
                key={`x-${bucket.key}`}
                numberOfLines={1}
                style={[
                  styles.axisText,
                  styles.xLabel,
                  {
                    top: height - X_AXIS_HEIGHT + 4,
                    left: bucketCenterX(index, bucketCount, plotWidth) - X_LABEL_WIDTH / 2,
                  },
                  index === selectedIndex
                    ? { color: primaryColor, fontFamily: FONT.bold }
                    : axisTextStyle,
                ]}
              >
                {bucket.label}
              </RNText>
            ) : null,
          )}

          {selectedBucket && selectedX !== null ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.tooltipBox,
                  { left: tooltipBox.left, width: tooltipBox.width, alignItems: tooltipBox.align },
                ]}
              >
                <View
                  style={[
                    styles.tooltip,
                    {
                      minHeight: tooltipHeight - TOOLTIP_POINTER_SIZE / 2,
                      backgroundColor: tooltipBackground,
                      borderColor: gridColor,
                    },
                  ]}
                >
                  <RNText
                    numberOfLines={1}
                    style={[styles.tooltipTitle, { color: withColorAlpha(tooltipTextColor, 0.6) }]}
                  >
                    {selectedBucket.title}
                  </RNText>
                  {selectedPoints.map((entry, index) => (
                    <View key={`legend-${entry.key}`} style={styles.legendRow}>
                      <View style={styles.legendKey}>
                        <View style={[styles.legendSwatchLine, { backgroundColor: entry.color }]}>
                          <View
                            style={[styles.legendSwatchDot, { backgroundColor: entry.color }]}
                          />
                        </View>
                        {isComparison ? (
                          <RNText
                            numberOfLines={1}
                            style={[
                              styles.legendLabel,
                              { color: withColorAlpha(tooltipTextColor, 0.75) },
                            ]}
                          >
                            {series[index]?.label}
                          </RNText>
                        ) : null}
                      </View>
                      <RNText
                        numberOfLines={1}
                        style={[styles.legendValue, { color: tooltipTextColor }]}
                      >
                        {tooltipValueTexts[index]}
                      </RNText>
                    </View>
                  ))}
                </View>
              </View>
              {/* A small pointer from the card down to the guide line. */}
              <View
                pointerEvents="none"
                style={[
                  styles.tooltipPointer,
                  {
                    left: selectedX - TOOLTIP_POINTER_SIZE / 2,
                    top: tooltipHeight - TOOLTIP_POINTER_SIZE,
                    backgroundColor: tooltipBackground,
                    borderColor: gridColor,
                  },
                ]}
              />
            </>
          ) : null}
        </View>
      </Animated.View>
    );
  },
  // Callbacks are read through refs, so a new function identity alone is no
  // reason to redraw: the chart re-renders for its data, size, selection and look.
  (previous, next) =>
    previous.buckets === next.buckets &&
    previous.series === next.series &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.selectedKey === next.selectedKey &&
    previous.formatValue === next.formatValue &&
    previous.formatAxisValue === next.formatAxisValue &&
    previous.averageValue === next.averageValue &&
    previous.averageLabel === next.averageLabel &&
    previous.zeroBased === next.zeroBased &&
    previous.minTickStep === next.minTickStep &&
    previous.gridColor === next.gridColor &&
    previous.labelColor === next.labelColor &&
    previous.surfaceColor === next.surfaceColor &&
    previous.tooltipBackground === next.tooltipBackground &&
    previous.tooltipTextColor === next.tooltipTextColor &&
    previous.accessibilityLabel === next.accessibilityLabel,
);

const styles = StyleSheet.create({
  axisText: {
    position: 'absolute',
    fontSize: AXIS_FONT_SIZE,
    lineHeight: 14,
    fontFamily: FONT.medium,
  },
  tickText: {
    width: AXIS_WIDTH - 6,
  },
  xLabel: {
    width: X_LABEL_WIDTH,
    textAlign: 'center',
  },
  averagePill: {
    position: 'absolute',
    left: 2,
    height: AVERAGE_PILL_HEIGHT,
    paddingHorizontal: 5,
    borderRadius: AVERAGE_PILL_HEIGHT / 2,
    justifyContent: 'center',
  },
  averageText: {
    fontSize: AXIS_FONT_SIZE,
    lineHeight: 13,
    fontFamily: FONT.semibold,
  },
  tooltipBox: {
    position: 'absolute',
    top: 0,
  },
  tooltip: {
    maxWidth: TOOLTIP_MAX_WIDTH,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: TOOLTIP_PADDING,
    paddingVertical: TOOLTIP_VERTICAL_PADDING,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 1,
  },
  tooltipPointer: {
    position: 'absolute',
    width: TOOLTIP_POINTER_SIZE,
    height: TOOLTIP_POINTER_SIZE,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    transform: [{ rotate: '45deg' }],
    zIndex: 2,
  },
  tooltipTitle: {
    fontSize: TOOLTIP_FONT_SIZE - 1,
    lineHeight: TOOLTIP_ROW_HEIGHT,
    fontFamily: FONT.medium,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: TOOLTIP_ROW_HEIGHT,
  },
  legendKey: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 12,
  },
  legendSwatchLine: {
    width: 14,
    height: 3,
    borderRadius: 2,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendSwatchDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: TOOLTIP_FONT_SIZE,
    lineHeight: TOOLTIP_ROW_HEIGHT,
    fontFamily: FONT.medium,
  },
  legendValue: {
    fontSize: TOOLTIP_FONT_SIZE + 0.5,
    lineHeight: TOOLTIP_ROW_HEIGHT,
    fontFamily: FONT.bold,
    fontWeight: '700',
  },
});

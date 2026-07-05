import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Text } from '~/components/ui';
import { usageColor } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import type { BudgetBreakdownSnapshot, BudgetRingSnapshot } from '~/services/widgetSnapshot.shared';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

const BANNER_SOURCE = require('../../assets/banner.png');
const WIDGET_PADDING = 16;

/**
 * Small "Budget Ring": remaining amount inside a usage arc, with a pacing tick
 * at day-of-month so ahead/behind pace reads without any text.
 */
export function BudgetRingWidgetContent({
  data,
  size = 158,
}: {
  data: BudgetRingSnapshot;
  size?: number;
}) {
  const themeColors = useThemeColors();

  if (!data.hasBudget) {
    return (
      <View style={styles.setupPad}>
        <Text variant="bodyStrong" style={{ textAlign: 'center' }}>
          {data.setupLabel}
        </Text>
        <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {data.monthLabel}
        </Text>
      </View>
    );
  }

  const ringSize = size - WIDGET_PADDING * 2 - 6;
  const strokeWidth = 9;
  const radius = (ringSize - strokeWidth) / 2;
  const center = ringSize / 2;
  const circumference = 2 * Math.PI * radius;
  const usedFraction = Math.max(0, Math.min(data.usageRatio, 1));
  const color = usageColor(data.usageRatio, themeColors);

  // Pacing tick: a notch at dayOfMonth / daysInMonth around the ring.
  const paceAngle = data.paceRatio * 2 * Math.PI - Math.PI / 2;
  const tickInner = radius - strokeWidth * 0.85;
  const tickOuter = radius + strokeWidth * 0.85;

  return (
    <View style={styles.ringPad}>
      <Svg width={ringSize} height={ringSize}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={withColorAlpha(color, 0.15)}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * usedFraction} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <Line
          x1={center + tickInner * Math.cos(paceAngle)}
          y1={center + tickInner * Math.sin(paceAngle)}
          x2={center + tickOuter * Math.cos(paceAngle)}
          y2={center + tickOuter * Math.sin(paceAngle)}
          stroke={themeColors.text}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.55}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={[styles.ringAmount, { color: data.isOver ? themeColors.error : themeColors.text }]}
        >
          {data.remainingLabel}
        </Text>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.ringCaption, { color: themeColors.textMuted }]}
        >
          {data.captionLabel}
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        style={[styles.ringFooter, { color: themeColors.textMuted }]}
        numberOfLines={1}
      >
        {data.daysLeftLabel}
      </Text>
    </View>
  );
}

function BreakdownRow({
  line,
  themeColors,
}: {
  line: BudgetBreakdownSnapshot['categories'][number];
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const color = usageColor(line.usageRatio, themeColors);
  const fillPct = Math.max(3, Math.min(line.usageRatio, 1) * 100);

  return (
    <View style={styles.row}>
      <Text allowFontScaling={false} style={styles.rowEmoji} numberOfLines={1}>
        {line.emoji || '•'}
      </Text>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.rowName, { color: themeColors.text }]}
          >
            {line.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.rowValues, { color }]} numberOfLines={1}>
            {line.spentLabel}
            <Text allowFontScaling={false} style={{ color: themeColors.textMuted }}>
              {' '}
              / {line.budgetedLabel}
            </Text>
          </Text>
        </View>
        <View style={[styles.rowTrack, { backgroundColor: withColorAlpha(color, 0.14) }]}>
          <View style={[styles.rowFill, { width: `${fillPct}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

/** Large "Budget Breakdown": usage bar + top category lines + unbudgeted footer. */
export function BudgetBreakdownWidgetContent({ data }: { data: BudgetBreakdownSnapshot }) {
  const themeColors = useThemeColors();

  if (!data.hasBudget) {
    return (
      <View style={styles.setupPad}>
        <Text variant="bodyStrong" style={{ textAlign: 'center' }}>
          {data.setupLabel}
        </Text>
        <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {data.monthLabel}
        </Text>
      </View>
    );
  }

  const color = usageColor(data.usageRatio, themeColors);
  const usedPct = Math.max(0, Math.min(data.usageRatio, 1)) * 100;
  const pacePct = Math.max(0, Math.min(data.paceRatio, 1)) * 100;

  return (
    <View style={styles.pad}>
      <View style={styles.headerRow}>
        <Image
          source={BANNER_SOURCE}
          contentFit="contain"
          contentPosition="left center"
          style={{ width: 104, height: 104 * 0.27 }}
        />
        <View style={styles.headerRight}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {data.monthLabel}
          </Text>
          <Text allowFontScaling={false} style={[styles.headerTotals, { color }]} numberOfLines={1}>
            {data.totalSpentLabel}
            <Text allowFontScaling={false} style={{ color: themeColors.textMuted }}>
              {' '}
              / {data.totalBudgetLabel}
            </Text>
          </Text>
        </View>
      </View>

      {/* Overall usage bar with the same pacing tick as the ring. */}
      <View style={[styles.totalTrack, { backgroundColor: withColorAlpha(color, 0.14) }]}>
        <View style={[styles.totalFill, { width: `${usedPct}%`, backgroundColor: color }]} />
        <View
          style={[
            styles.paceTick,
            { left: `${pacePct}%`, backgroundColor: withColorAlpha(themeColors.text, 0.55) },
          ]}
        />
      </View>
      <Text
        allowFontScaling={false}
        style={[styles.remainingLabel, { color: data.isOver ? themeColors.error : color }]}
        numberOfLines={1}
      >
        {data.remainingLabel}
      </Text>

      <View style={styles.rows}>
        {data.categories.map((line) => (
          <BreakdownRow key={line.categoryId} line={line} themeColors={themeColors} />
        ))}
      </View>

      {data.unbudgetedLabel || data.moreLabel ? (
        <View style={styles.footerRow}>
          <Text
            allowFontScaling={false}
            style={[styles.footerText, { color: themeColors.textMuted }]}
            numberOfLines={1}
          >
            {data.unbudgetedLabel}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.footerText, { color: themeColors.textMuted }]}
            numberOfLines={1}
          >
            {data.moreLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
  },
  setupPad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: WIDGET_PADDING,
  },
  // ----- Ring (small) -----
  ringPad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    bottom: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  ringCaption: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: FONT.bold,
  },
  ringFooter: {
    fontSize: 9.5,
    lineHeight: 12,
    fontFamily: FONT.bold,
    marginTop: 2,
  },
  // ----- Breakdown (large) -----
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTotals: {
    fontFamily: FONT.monoBold,
    fontSize: 15,
    lineHeight: 19,
    marginTop: 2,
  },
  totalTrack: {
    height: 10,
    borderRadius: 999,
    marginTop: 10,
    overflow: 'hidden',
  },
  totalFill: {
    height: '100%',
    borderRadius: 999,
  },
  paceTick: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    width: 2,
    borderRadius: 1,
  },
  remainingLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: FONT.bold,
    marginTop: 5,
  },
  rows: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowEmoji: {
    width: 20,
    fontSize: 13,
    textAlign: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: FONT.bold,
  },
  rowValues: {
    fontFamily: FONT.monoBold,
    fontSize: 10.5,
    lineHeight: 14,
  },
  rowTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 3,
  },
  rowFill: {
    height: '100%',
    borderRadius: 999,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontFamily: FONT.bold,
  },
});

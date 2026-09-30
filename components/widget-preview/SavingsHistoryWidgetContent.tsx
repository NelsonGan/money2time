import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import type { SavingsHistorySnapshot } from '~/services/widgetSnapshot.shared';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

const BANNER_SOURCE = require('../../assets/banner.png');
const WIDGET_PADDING = 16;

function SavingsHistoryRow({ month }: { month: SavingsHistorySnapshot['months'][number] }) {
  const themeColors = useThemeColors();
  const accent = !month.hasIncome
    ? themeColors.textMuted
    : month.isPositive
      ? themeColors.success
      : themeColors.error;
  // Positive rate fills proportionally; overspend shows a small coral bar.
  const fillPct = !month.hasIncome
    ? 0
    : month.isPositive
      ? Math.max(4, Math.min(1, month.savingsRate) * 100)
      : Math.max(8, Math.min(1, Math.abs(month.savingsRate)) * 100);

  return (
    <View style={styles.histRow}>
      <Text variant="caption" style={[styles.histMonth, { color: themeColors.textSoft }]}>
        {month.monthLabel}
      </Text>
      <View style={[styles.histTrack, { backgroundColor: withColorAlpha(themeColors.text, 0.06) }]}>
        <View
          style={[
            styles.histFill,
            {
              width: `${fillPct}%`,
              backgroundColor: month.hasActivity ? accent : withColorAlpha(themeColors.text, 0.08),
            },
          ]}
        />
      </View>
      <View style={styles.histValues}>
        <Text
          allowFontScaling={false}
          style={[styles.histRate, { color: month.hasActivity ? accent : themeColors.textMuted }]}
          numberOfLines={1}
        >
          {month.rateLabel}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.histSaved, { color: themeColors.textMuted }]}
          numberOfLines={1}
        >
          {month.savedLabel}
        </Text>
      </View>
    </View>
  );
}

/** The large savings-history widget's face: total saved, then one bar per month. */
export function SavingsHistoryWidgetContent({
  data,
  bannerWidth,
}: {
  data: SavingsHistorySnapshot;
  bannerWidth: number;
}) {
  const themeColors = useThemeColors();
  const totalColor = data.totalIsPositive ? themeColors.success : themeColors.error;

  return (
    <View style={styles.pad}>
      <View style={styles.headerRow}>
        <Image
          source={BANNER_SOURCE}
          contentFit="contain"
          contentPosition="left center"
          style={{ width: bannerWidth, height: bannerWidth * 0.27 }}
        />
        <View style={styles.headerRight}>
          <Text style={[styles.totalAmount, { color: totalColor }]} numberOfLines={1}>
            {data.totalSavedLabel}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {data.averageRateLabel}
          </Text>
        </View>
      </View>
      <View style={styles.histRows}>
        {data.months.map((month) => (
          <SavingsHistoryRow key={month.monthKey} month={month} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  histRows: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  histMonth: {
    width: 34,
    fontFamily: FONT.bold,
  },
  histTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  histFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 4,
  },
  histValues: {
    width: 64,
    alignItems: 'flex-end',
  },
  histRate: {
    textAlign: 'right',
    fontFamily: FONT.monoBold,
    fontSize: 15,
    lineHeight: 18,
  },
  histSaved: {
    textAlign: 'right',
    fontFamily: FONT.bold,
    fontSize: 10,
    lineHeight: 12,
  },
});

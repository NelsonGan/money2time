import { Image } from 'expo-image';
import { Clock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { SavingsRateSnapshot } from '~/services/widgetSnapshot.shared';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

const BANNER_SOURCE = require('../../assets/banner.png');
const WIDGET_PADDING = 16;

export function lightenColor(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix(Number.parseInt(value.slice(0, 2), 16));
  const g = mix(Number.parseInt(value.slice(2, 4), 16));
  const b = mix(Number.parseInt(value.slice(4, 6), 16));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function GradientPercent({
  label,
  color,
  gradientId,
}: {
  label: string;
  color: string;
  gradientId: string;
}) {
  const hasPercent = label.endsWith('%');
  const numberPart = hasPercent ? label.slice(0, -1) : label;
  const NUM_SIZE = 44;
  const PCT_SIZE = 24;
  const width = Math.ceil(
    numberPart.length * (NUM_SIZE * 0.6) + (hasPercent ? PCT_SIZE * 0.7 : 0) + 6,
  );
  const height = 50;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor={lightenColor(color, 0.22)} />
          <Stop offset="1" stopColor={color} />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        x={0}
        y={height - 12}
        fill={`url(#${gradientId})`}
        fontFamily={FONT.monoBold}
        textAnchor="start"
      >
        <TSpan fontSize={NUM_SIZE} letterSpacing={-1}>
          {numberPart}
        </TSpan>
        {hasPercent ? (
          <TSpan fontSize={PCT_SIZE} dx={1}>
            %
          </TSpan>
        ) : null}
      </SvgText>
    </Svg>
  );
}

export function SavingsRateWidgetContent({
  data,
  gradientId = 'savingsRateGradient',
}: {
  data: SavingsRateSnapshot;
  gradientId?: string;
}) {
  const themeColors = useThemeColors();

  const heroColor = !data.hasIncome
    ? themeColors.textMuted
    : data.isPositive
      ? themeColors.success
      : themeColors.coral;
  const savedFillPct = data.isPositive ? Math.max(0, Math.min(1, data.savingsRate)) * 100 : 0;
  const subtitle = !data.hasIncome
    ? I18n.t('widgets.add_income_hint')
    : data.timeEquivalentLabel || I18n.t('widgets.of_income_saved');

  return (
    <View style={styles.pad}>
      <View style={styles.headerRow}>
        <Image
          source={BANNER_SOURCE}
          contentFit="contain"
          contentPosition="left center"
          style={{ width: 104, height: 104 * 0.27 }}
        />
        <Text variant="bodyStrong" style={{ color: themeColors.text }} numberOfLines={1}>
          {data.monthLabel}
        </Text>
      </View>

      <View style={styles.heroRow}>
        {data.hasIncome ? (
          <GradientPercent label={data.rateLabel} color={heroColor} gradientId={gradientId} />
        ) : (
          <Text style={[styles.rateFallback, { color: heroColor }]} numberOfLines={1}>
            {data.rateLabel}
          </Text>
        )}
        <View style={styles.subtitle}>
          {data.hasIncome && data.timeEquivalentLabel ? (
            <Clock size={13} color={themeColors.primary} strokeWidth={2.4} />
          ) : null}
          <Text
            variant="caption"
            style={{ color: themeColors.textSoft, flexShrink: 1 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.bar, { backgroundColor: withColorAlpha(themeColors.error, 0.22) }]}>
          <View
            style={[
              styles.barFill,
              { width: `${savedFillPct}%`, backgroundColor: themeColors.success },
            ]}
          />
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.dot,
                { backgroundColor: data.isPositive ? themeColors.success : themeColors.coral },
              ]}
            />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {data.savedCaption} {data.savedLabel}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: themeColors.error }]} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('widgets.spent')} {data.expenseLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  rateFallback: {
    fontFamily: FONT.monoBold,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1,
  },
  subtitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 5,
  },
  footer: {
    gap: 8,
  },
  bar: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});

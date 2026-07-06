import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

interface BudgetShowcaseProps {
  width: number;
}

// Static sample so the visual reads the same on every device; only the currency
// symbol follows the user's settings.
const SPENT = 3971;
const TOTAL = 6064;
const REMAINING = 2092;

export function BudgetShowcase({ width }: BudgetShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  // Always render in money mode so the showcase shows the user's currency even
  // when the app is in time-display mode.
  const money = { currencySymbol: settings.currencySymbol, displayMode: 'money' as const };

  const rows = [
    { labelKey: 'news.showcase.budget_food', emoji: '🍔', ratio: 0.68, color: colors.success },
    { labelKey: 'news.showcase.budget_transport', emoji: '🚗', ratio: 1.12, color: colors.error },
  ];

  return (
    <View style={[styles.container, { width }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
        ]}
      >
        <View style={[styles.ringWrap, { backgroundColor: withColorAlpha(colors.primary, 0.08) }]}>
          <SavingsRateRing
            size={62}
            strokeWidth={7}
            progress={SPENT / TOTAL}
            color={colors.primary}
            trackColor={withColorAlpha(colors.primary, 0.16)}
          >
            <Text variant="bodyStrong" style={{ color: colors.text, fontSize: 15 }}>
              65%
            </Text>
          </SavingsRateRing>
        </View>
        <View style={styles.figures}>
          <Text variant="subheading" numberOfLines={1} style={{ color: colors.text }}>
            {formatAmount(SPENT, money, { showSign: false })}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            / {formatAmount(TOTAL, money, { showSign: false })}
          </Text>
          <View style={[styles.chip, { backgroundColor: withColorAlpha(colors.primary, 0.12) }]}>
            <Text variant="caption" numberOfLines={1} style={{ color: colors.primary }}>
              {I18n.t('budget.left', {
                amount: formatAmount(REMAINING, money, { showSign: false }),
              })}
            </Text>
          </View>
        </View>
      </View>

      {rows.map((row) => {
        const percent = Math.round(row.ratio * 100);
        const fill = Math.max(0, Math.min(row.ratio, 1)) * 100;
        return (
          <View
            key={row.labelKey}
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <Text style={styles.emoji}>{row.emoji}</Text>
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
                  {I18n.t(row.labelKey)}
                </Text>
                <Text variant="caption" style={{ color: row.color }}>
                  {percent}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: withColorAlpha(row.color, 0.14) }]}>
                <View style={[styles.fill, { width: `${fill}%`, backgroundColor: row.color }]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ringWrap: {
    borderRadius: 999,
    padding: 5,
  },
  figures: {
    flex: 1,
    minWidth: 0,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emoji: {
    fontSize: 20,
    width: 26,
    textAlign: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});

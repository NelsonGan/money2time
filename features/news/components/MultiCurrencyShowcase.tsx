import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { currencyNameForCode } from '~/utils/currency';

interface MultiCurrencyShowcaseProps {
  width: number;
}

interface Row {
  symbol: string;
  code: string;
  rate: string | null;
}

// Static sample so the visual reads the same on every device regardless of the
// user's own currency setup.
const ROWS: Row[] = [
  { symbol: 'RM', code: 'MYR', rate: null },
  { symbol: '$', code: 'USD', rate: '0.21' },
  { symbol: '€', code: 'EUR', rate: '0.20' },
];

export function MultiCurrencyShowcase({ width }: MultiCurrencyShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { width }]}>
      {ROWS.map((row) => {
        const isMain = row.rate === null;
        return (
          <View
            key={row.code}
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: withColorAlpha(colors.sky, 0.16) }]}>
              <Text variant="bodyStrong" style={{ color: colors.sky }}>
                {row.symbol}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
                {row.code}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {currencyNameForCode(row.code)}
              </Text>
            </View>
            {isMain ? (
              <View style={[styles.tag, { backgroundColor: withColorAlpha(colors.sky, 0.16) }]}>
                <Text variant="caption" style={[styles.tagText, { color: colors.sky }]}>
                  {I18n.t('news.multi_currency_update.showcase_main')}
                </Text>
              </View>
            ) : (
              <Text variant="body" tone="muted">
                {row.rate}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
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
  badge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontWeight: '600',
  },
});

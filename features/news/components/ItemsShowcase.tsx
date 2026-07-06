import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

interface ItemsShowcaseProps {
  width: number;
}

interface SampleItem {
  labelKey: string;
  emoji: string;
  perDay: number;
  days: number;
  tint: (colors: ReturnType<typeof useThemeColors>) => string;
}

// Static sample; only the currency symbol follows the user's settings so the
// "cost per day" idea reads the same everywhere.
const ITEMS: SampleItem[] = [
  {
    labelKey: 'news.showcase.item_headphones',
    emoji: '🎧',
    perDay: 0.82,
    days: 412,
    tint: (c) => c.lavender,
  },
  {
    labelKey: 'news.showcase.item_jacket',
    emoji: '🧥',
    perDay: 1.4,
    days: 56,
    tint: (c) => c.sky,
  },
];

export function ItemsShowcase({ width }: ItemsShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { currencySymbol: settings.currencySymbol, displayMode: 'money' as const };

  return (
    <View style={[styles.container, { width }]}>
      {ITEMS.map((item) => {
        const tint = item.tint(colors);
        return (
          <View
            key={item.labelKey}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: withColorAlpha(tint, 0.16) }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <View style={styles.textCol}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
                {I18n.t(item.labelKey)}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {I18n.t('items.days_count', { count: item.days })}
              </Text>
            </View>
            <View style={styles.costCol}>
              <Text variant="subheading" numberOfLines={1} style={{ color: tint }}>
                {formatAmount(item.perDay, money, { showSign: false })}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {I18n.t('items.per_day')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  costCol: {
    alignItems: 'flex-end',
  },
});

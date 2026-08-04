import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

interface ReceiptSplitShowcaseProps {
  width: number;
}

// Static sample bill: two items shared between "Me" and a friend, plus the
// prorated tax line — only the currency symbol follows the user's settings.
const AVATARS: { initial: string; color: string }[] = [
  { initial: 'M', color: '#3E9A78' },
  { initial: 'S', color: '#C2604A' },
];

export function ReceiptSplitShowcase({ width }: ReceiptSplitShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { currencySymbol: settings.currencySymbol, displayMode: 'money' as const };

  const rows = [
    { label: I18n.t('news.showcase.receipt_pasta'), amount: 14, sharers: [0] },
    { label: I18n.t('news.showcase.receipt_wine'), amount: 18, sharers: [0, 1] },
  ];

  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
      ]}
    >
      <View style={styles.header}>
        <ClayIcon name="money-time/receipt" size={24} />
        <Text variant="bodyStrong" style={{ color: colors.text }} numberOfLines={1}>
          {I18n.t('transactions.receiptSplit.title')}
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: withColorAlpha(colors.text, 0.08) }]} />
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <View style={styles.rowText}>
            <Text variant="body" style={{ color: colors.text }} numberOfLines={1}>
              {row.label}
            </Text>
          </View>
          <View style={styles.avatars}>
            {row.sharers.map((index, position) => (
              <View
                key={AVATARS[index]!.initial}
                style={[
                  styles.avatar,
                  {
                    backgroundColor: AVATARS[index]!.color,
                    borderColor: colors.card,
                    marginLeft: position > 0 ? -8 : 0,
                  },
                ]}
              >
                <Text variant="caption" style={styles.avatarText}>
                  {AVATARS[index]!.initial}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="bodyStrong" style={{ color: colors.text }}>
            {formatAmount(row.amount, money, { showSign: false })}
          </Text>
        </View>
      ))}
      <View style={[styles.divider, { backgroundColor: withColorAlpha(colors.text, 0.08) }]} />
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('transactions.receiptSplit.your_share')}
          </Text>
        </View>
        <Text variant="subheading" style={{ color: colors.primary }}>
          {formatAmount(24.53, money, { showSign: false })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 10,
  },
});

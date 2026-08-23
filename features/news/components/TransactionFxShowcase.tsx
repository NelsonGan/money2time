import { ArrowRightLeft, Pencil } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { currencySymbolForCode } from '~/utils/currency';

interface TransactionFxShowcaseProps {
  width: number;
}

export function TransactionFxShowcase({ width }: TransactionFxShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const fromCurrency = settings.currencyCode === 'USD' ? 'EUR' : 'USD';
  const fromSymbol = currencySymbolForCode(fromCurrency);
  const rate = settings.currencyCode === 'MYR' ? 4.6 : 1.25;
  const converted = 120 * rate;
  const border = withColorAlpha(colors.text, 0.08);

  return (
    <View style={[styles.container, { width }]}>
      <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: border }]}>
        <View>
          <Text variant="caption" tone="muted">
            {I18n.t('transactions.editor.amount')}
          </Text>
          <Text variant="heading" style={{ color: colors.text }}>
            {fromSymbol}120.00
          </Text>
        </View>
        <View style={styles.amountRight}>
          <View
            style={[styles.currencyChip, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}
          >
            <Text variant="mono" style={{ color: colors.success }}>
              {fromCurrency}
            </Text>
          </View>
          <View style={styles.editRow}>
            <Text variant="caption" tone="muted">
              ≈ {settings.currencySymbol}
              {converted.toFixed(2)}
            </Text>
            <Pencil size={11} color={colors.success} />
          </View>
        </View>
      </View>

      <View style={[styles.rateCard, { backgroundColor: withColorAlpha(colors.success, 0.11) }]}>
        <View style={styles.rateTitle}>
          <ArrowRightLeft size={15} color={colors.success} />
          <Text variant="bodyStrong" style={{ color: colors.success }}>
            {I18n.t('transactions.editor.fx_title')}
          </Text>
        </View>
        <View style={styles.rateLine}>
          <Text variant="caption" tone="muted">
            {I18n.t('transactions.editor.fx_rate')}
          </Text>
          <Text variant="mono" style={{ color: colors.text }}>
            1 {fromCurrency} = {rate.toFixed(4)} {settings.currencyCode}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  amountCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  amountRight: {
    alignItems: 'flex-end',
    gap: 7,
  },
  currencyChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rateCard: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 9,
  },
  rateTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});

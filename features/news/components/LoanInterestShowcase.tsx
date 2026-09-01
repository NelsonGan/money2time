import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatCurrency } from '~/utils/formatters';

interface LoanInterestShowcaseProps {
  width: number;
}

/**
 * Sample loan: 20,000 over 5 years (60 instalments) at 6% reducing balance.
 * These are the figures `buildLoanQuote` produces for that contract, so a
 * reader checking them against their own loan is not misled. The total is the
 * rounded instalment times the term, not the exact-arithmetic answer, because
 * that is what the quote derives it from. The rate is a bare `X%` because that
 * is how the loan screens themselves print one.
 */
const RATE_LABEL = '6%';
const MONTHLY_INSTALMENT = 386.66;
const TOTAL_INTEREST = 3199.6;

/**
 * The interest model picker that now leads the loan form, with the figures it
 * decides underneath. 015 covered where a loan instalment is filed; this one is
 * about the contract behind it, so the pills are the subject and the numbers
 * are what they move.
 */
export function LoanInterestShowcase({ width }: LoanInterestShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const symbol = settings.currencySymbol;
  const border = withColorAlpha(colors.text, 0.08);

  const options: readonly { key: 'reducing' | 'flat'; selected: boolean }[] = [
    { key: 'reducing', selected: true },
    { key: 'flat', selected: false },
  ];

  return (
    <View style={[styles.card, { width, backgroundColor: colors.card, borderColor: border }]}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {I18n.t('accounts.loan.interest_model_label')}
      </Text>

      <View style={styles.pillRow}>
        {options.map((option) => (
          <View
            key={option.key}
            style={[
              styles.pill,
              {
                backgroundColor: option.selected
                  ? withColorAlpha(colors.accent, 0.15)
                  : withColorAlpha(colors.text, 0.05),
                borderColor: option.selected
                  ? withColorAlpha(colors.accent, 0.5)
                  : withColorAlpha(colors.text, 0.1),
              },
            ]}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              tone={option.selected ? 'default' : 'muted'}
              style={option.selected ? { color: colors.accent } : undefined}
            >
              {I18n.t(`accounts.loan.interest_model_${option.key}`)}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: border }]} />

      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={1}>
          {I18n.t('accounts.loan.interest_rate_label')}
        </Text>
        <Text variant="mono" numberOfLines={1}>
          {RATE_LABEL}
        </Text>
      </View>

      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={1}>
          {I18n.t('accounts.loan.instalment_label')}
        </Text>
        <Text variant="mono" numberOfLines={1}>
          {formatCurrency(MONTHLY_INSTALMENT, symbol)}
        </Text>
      </View>

      <View style={[styles.footer, { backgroundColor: withColorAlpha(colors.accent, 0.12) }]}>
        <Text variant="caption" style={{ color: colors.accent }} numberOfLines={1}>
          {I18n.t('accounts.loan.total_interest_label')}
        </Text>
        <Text variant="caption" style={{ color: colors.accent }} numberOfLines={1}>
          {formatCurrency(TOTAL_INTEREST, symbol)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 11,
  },
  pillRow: {
    flexDirection: 'row',
    // Wraps like the real editor's row: side by side the Russian and Ukrainian
    // labels are wider than the card.
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});

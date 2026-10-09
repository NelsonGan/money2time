import { Check, ChevronRight, Wallet } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface LoanInstalmentShowcaseProps {
  width: number;
}

/**
 * The instalment side of a loan: which account it comes out of, whether it
 * counts as spending, and where it is filed. The 014 announcement showed the
 * loan balance itself, so this one stays on the repayment settings.
 */
export function LoanInstalmentShowcase({ width }: LoanInstalmentShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const border = withColorAlpha(colors.text, 0.08);
  const amount = `${settings.currencySymbol}640`;

  return (
    <View style={[styles.card, { width, backgroundColor: colors.card, borderColor: border }]}>
      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={1}>
          {I18n.t('accounts.loan.collect_account_label')}
        </Text>
        <View style={[styles.value, { backgroundColor: withColorAlpha(colors.accent, 0.13) }]}>
          <Wallet size={13} color={colors.accent} />
          <Text variant="caption" style={{ color: colors.accent }} numberOfLines={1}>
            {I18n.t('accounts.account_name_placeholder')}
          </Text>
          <ChevronRight size={13} color={colors.accent} />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: border }]} />

      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={2}>
          {I18n.t('accounts.loan.count_as_expense_label')}
        </Text>
        <View style={[styles.switchTrack, { backgroundColor: colors.accent }]}>
          <View style={[styles.switchThumb, { backgroundColor: colors.card }]} />
        </View>
      </View>

      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={1}>
          {I18n.t('accounts.loan.payment_category_label')}
        </Text>
        <View style={[styles.value, { backgroundColor: withColorAlpha(colors.text, 0.06) }]}>
          <Text variant="caption" numberOfLines={1}>
            {I18n.t('accounts.loan.payment_note')}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { backgroundColor: withColorAlpha(colors.accent, 0.12) }]}>
        <Check size={14} color={colors.accent} />
        <Text variant="caption" style={{ color: colors.accent }} numberOfLines={1}>
          {I18n.t('accounts.loan.monthly_chip', { amount })}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('accounts.loan.projection_payments_only_other', { count: 18 })}
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
    gap: 12,
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
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '58%',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    padding: 3,
    alignItems: 'flex-end',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
});

import { CalendarClock, Landmark } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface LoanAccountShowcaseProps {
  width: number;
}

export function LoanAccountShowcase({ width }: LoanAccountShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const border = withColorAlpha(colors.text, 0.08);
  const formatMoney = (value: number) =>
    `${settings.currencySymbol}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <View style={[styles.card, { width, backgroundColor: colors.card, borderColor: border }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: withColorAlpha(colors.accent, 0.18) }]}>
          <Landmark size={21} color={colors.accent} strokeWidth={2.2} />
        </View>
        <View style={styles.titleColumn}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('accounts.type_loan')}
          </Text>
          <Text variant="caption" tone="muted">
            {I18n.t('accounts.loan.balance_owed_label')}
          </Text>
        </View>
        <Text variant="subheading" style={{ color: colors.text }}>
          {formatMoney(24800)}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: withColorAlpha(colors.text, 0.08) }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent }]} />
      </View>

      <View style={styles.footer}>
        <View style={[styles.chip, { backgroundColor: withColorAlpha(colors.accent, 0.14) }]}>
          <Text variant="caption" style={{ color: colors.accent }}>
            {I18n.t('accounts.loan.monthly_chip', { amount: formatMoney(640) })}
          </Text>
        </View>
        <View style={styles.dueRow}>
          <CalendarClock size={13} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            {I18n.t('accounts.loan.projection_payments_only_other', { count: 18 })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  track: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    width: '58%',
    height: 9,
    borderRadius: 999,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';
import { formatCurrency } from '~/utils/formatters';

interface LiveEarningsShowcaseProps {
  width: number;
}

/** Sample shift: three hours into an eight hour day at 24 an hour, ending at 5pm. */
const HOURLY_RATE = 24;
const ELAPSED_HOURS = 3;
const SHIFT_HOURS = 8;
const PROGRESS = ELAPSED_HOURS / SHIFT_HOURS;
const ENDS_AT_HOUR = 17;

/**
 * The Lock Screen card, laid out row for row like the real one: headline and
 * rate, the amount with the shift total beside it, the bar, then the elapsed
 * clock and the end time. Static on purpose, since the announcement is a still
 * and the real card counts up where it lives.
 *
 * Amounts go through `formatCurrency` rather than `formatAmount` for the same
 * reason the card does: in time display mode `formatAmount` would divide the
 * earned amount by the very rate that produced it and print the elapsed clock
 * a second time.
 */
export function LiveEarningsShowcase({ width }: LiveEarningsShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const symbol = settings.currencySymbol;
  const locale = settings.locale ?? I18n.locale ?? 'en';

  // A wall-clock end time so the footer reads like the real card. Built off
  // today so the 12 vs 24 hour choice follows the user's own locale.
  const endsText = useMemo(() => {
    const end = new Date();
    end.setHours(ENDS_AT_HOUR, 0, 0, 0);
    return I18n.t('widgets.live.ends_at', {
      time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(end),
    });
  }, [locale]);

  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
      ]}
    >
      {/* The headline takes the row first and the rate is what truncates, the
          same priority the real Lock Screen card gives them. */}
      <View style={styles.headRow}>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {I18n.t('widgets.live.headline')}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.rate}>
          {I18n.t('widgets.live.rate', { amount: formatCurrency(HOURLY_RATE, symbol) })}
        </Text>
      </View>

      {/* The shift total sits beside the amount, as it does on the card: it is
          what scales the bar below into money. */}
      <View style={styles.amountRow}>
        <Text
          numberOfLines={1}
          style={[styles.amount, { color: colors.primary, fontFamily: FONT.monoBold }]}
        >
          {formatCurrency(HOURLY_RATE * ELAPSED_HOURS, symbol)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.total}>
          {I18n.t('widgets.live.of_total', {
            total: formatCurrency(HOURLY_RATE * SHIFT_HOURS, symbol),
          })}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: withColorAlpha(colors.text, 0.08) }]}>
        <View style={[styles.fill, { flex: PROGRESS, backgroundColor: colors.primary }]} />
        <View style={{ flex: 1 - PROGRESS }} />
      </View>

      <View style={styles.footRow}>
        <Text
          variant="caption"
          tone="muted"
          numberOfLines={1}
          style={{ fontFamily: FONT.monoBold }}
        >
          {`${ELAPSED_HOURS}:00:00`}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {endsText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 9,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rate: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    // A hair smaller than the headline beside it, as on the real card, so a
    // long symbol like RM still fits the row instead of eliding.
    fontSize: 11,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  amount: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  total: {
    flex: 1,
    minWidth: 0,
  },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});

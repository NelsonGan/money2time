import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface ReviewShowcaseProps {
  width: number;
}

// Static sample so the visual reads the same on every device; only the currency
// symbol follows the user's settings.
const EXPENSE = 842;
const INCOME = 1360;
const SAVED_RATIO = 0.38;

/**
 * The two cards the review page opens on: what went out over a closed period
 * with its change against the one before, and the in-and-out ring. Rebuilt at
 * showcase scale rather than rendered from `ReviewPagerView`, which needs real
 * transactions and a live period rail.
 */
export function ReviewShowcase({ width }: ReviewShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const border = withColorAlpha(colors.text, 0.08);
  // Whole-number amounts in the user's currency (no cents), so the sample cards
  // read clean regardless of time-display mode.
  const whole = (value: number) =>
    `${settings.currencySymbol}${Math.round(value)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  return (
    <View style={[styles.container, { width }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
        <View style={styles.cardHead}>
          <Text variant="bodyStrong" style={{ color: colors.text }}>
            {I18n.t('review.spent')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('news.showcase.review_week')}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <Text variant="subheading" numberOfLines={1} style={{ color: colors.text }}>
            {whole(EXPENSE)}
          </Text>
          <View style={[styles.chip, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}>
            <Text variant="caption" style={{ color: colors.success }}>
              -12%
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
        <View style={styles.cardHead}>
          <Text variant="bodyStrong" style={{ color: colors.text }}>
            {I18n.t('review.in_and_out')}
          </Text>
        </View>
        <View style={styles.flowRow}>
          <SavingsRateRing
            size={58}
            strokeWidth={6}
            progress={SAVED_RATIO}
            color={colors.success}
            trackColor={withColorAlpha(colors.text, 0.1)}
          >
            <Text variant="bodyStrong" style={[styles.ringValue, { color: colors.text }]}>
              {`${Math.round(SAVED_RATIO * 100)}%`}
            </Text>
          </SavingsRateRing>
          <View style={styles.flowLines}>
            <FlowLine
              color={colors.success}
              label={I18n.t('review.came_in')}
              value={whole(INCOME)}
            />
            <FlowLine
              color={colors.error}
              label={I18n.t('review.went_out')}
              value={whole(EXPENSE)}
            />
            <View style={[styles.divider, { backgroundColor: border }]} />
            <View style={styles.flowLine}>
              <Text variant="caption" style={[styles.flowLabel, { color: colors.text }]}>
                {I18n.t('review.saved')}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.success }}>
                {whole(INCOME - EXPENSE)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function FlowLine({ color, label, value }: { color: string; label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.flowLine}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" tone="muted" style={styles.flowLabel}>
        {label}
      </Text>
      <Text variant="caption" numberOfLines={1} style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringValue: {
    fontSize: 13,
    lineHeight: 17,
  },
  flowLines: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  flowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flowLabel: {
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});

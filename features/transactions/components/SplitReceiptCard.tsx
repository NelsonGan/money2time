import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import type { PersonDebt } from '~/types';
import { FONT } from '~/utils/fonts';

const BANNER_SOURCE = require('../../../assets/banner.png');
const BANNER_ASPECT = 2120 / 742;
const BANNER_WIDTH = 156;

interface SplitReceiptCardProps {
  person: PersonDebt;
  /** e.g. "Nelson → Mi". */
  fromTo: string;
  /** Resolved file uri of the user's payment QR, or null. */
  qrUri: string | null;
  /** Formats a native amount + currency, e.g. (60, 'MYR') => "RM60.00". */
  formatNative: (amount: number, currency: string) => string;
}

// Fixed light palette so the shared image reads cleanly on any device / chat
// background, independent of the sender's app theme.
const C = {
  bg: '#FFFFFF',
  ink: '#181A12',
  muted: '#8A8D80',
  hair: '#ECE9E0',
  accent: '#1F8A6F',
  owed: '#B26A28',
  qrBg: '#FFFFFF',
  qrBorder: '#ECE9E0',
};

/**
 * A self-contained, fixed-light receipt rendered for image sharing. The parent
 * captures it via Skia's makeImageFromView on the forwarded ref, so the root
 * View carries `collapsable={false}` for a reliable Android snapshot.
 */
export const SplitReceiptCard = forwardRef<View, SplitReceiptCardProps>(function SplitReceiptCard(
  { person, fromTo, qrUri, formatNative },
  ref,
) {
  const totalText = person.byCurrency.map((c) => formatNative(c.amount, c.currency)).join(' + ');

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Image
        source={BANNER_SOURCE}
        style={{ width: BANNER_WIDTH, height: BANNER_WIDTH / BANNER_ASPECT }}
        resizeMode="contain"
      />

      {qrUri ? (
        <View style={styles.qrBlock}>
          <View style={styles.qrFrame}>
            <Image source={{ uri: qrUri }} style={styles.qrImage} resizeMode="contain" />
          </View>
          <Text style={styles.scan}>{I18n.t('transactions.settleUp.receipt_scan_short')}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{fromTo}</Text>
      <Text style={styles.subtitle}>{I18n.t('transactions.settleUp.receipt_heading')}</Text>

      <View style={styles.divider} />

      <View style={styles.lines}>
        {person.bills.map((bill) => (
          <View key={bill.splitId} style={styles.line}>
            <CategoryEmoji icon={bill.categoryIcon} size={18} />
            <Text style={styles.lineLabel} numberOfLines={1}>
              {bill.note?.trim() ||
                bill.categoryName ||
                I18n.t('transactions.settleUp.untitled_bill')}
            </Text>
            <Text style={styles.lineAmount}>{formatNative(bill.amount, bill.currency)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{I18n.t('transactions.settleUp.receipt_total_label')}</Text>
        <Text style={styles.totalAmount}>{totalText}</Text>
      </View>

      <Text style={styles.footer}>{I18n.t('transactions.settleUp.receipt_footer')}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 328,
    backgroundColor: C.bg,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: 'center',
  },
  qrBlock: {
    alignItems: 'center',
    marginTop: 16,
  },
  qrFrame: {
    backgroundColor: C.qrBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.qrBorder,
    padding: 10,
  },
  qrImage: {
    width: 188,
    height: 188,
    borderRadius: 8,
  },
  scan: {
    marginTop: 10,
    color: C.accent,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    marginTop: 20,
    color: C.ink,
    fontFamily: FONT.bold,
    fontWeight: '700',
    fontSize: 18,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 2,
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: C.hair,
    marginVertical: 14,
  },
  lines: {
    alignSelf: 'stretch',
    gap: 12,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineLabel: {
    flex: 1,
    color: C.ink,
    fontFamily: FONT.regular,
    fontSize: 14,
  },
  lineAmount: {
    color: C.ink,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    fontSize: 14,
  },
  totalRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: C.muted,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmount: {
    color: C.owed,
    fontFamily: FONT.bold,
    fontWeight: '700',
    fontSize: 22,
  },
  footer: {
    marginTop: 18,
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});

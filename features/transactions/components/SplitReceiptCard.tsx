import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui';
import { FONT } from '~/utils/fonts';

const BANNER_SOURCE = require('../../../assets/banner.png');
const BANNER_ASPECT = 2120 / 742;
const BANNER_WIDTH = 156;

/** One row on the receipt: a bill (category icon) or a person (initial). */
export interface ReceiptLine {
  key: string;
  /** Category emoji to lead the row (bill rows). */
  categoryIcon?: string | null;
  /** Single-letter avatar to lead the row (person rows). */
  initial?: string | null;
  label: string;
  /** Secondary muted line under the label, e.g. a date. */
  sublabel?: string | null;
  /**
   * Per-item breakdown under the label: each shows as its own bullet line
   * instead of a dot-joined `sublabel`. The line's total sits on the right, so
   * the bullets are names only. A `shared` item leads its bullet with a small
   * "Shared" badge (label from {@link ReceiptContent.sharedLabel}).
   */
  items?: { key: string; name: string; shared?: boolean }[] | null;
  /** Pre-formatted amount, e.g. "$32.00". */
  amount: string;
}

export interface ReceiptContent {
  /** Subject line: a person's name or a bill's description. */
  title: string;
  /** Optional muted line under the title, e.g. the bill date. */
  subtitle?: string | null;
  /** e.g. "You owe". Omit (with totalText) to drop the total row entirely. */
  totalLabel?: string | null;
  /** Pre-formatted total, e.g. "$112.00". */
  totalText?: string | null;
  /** Localized "Shared" word for the badge on shared item bullets. */
  sharedLabel?: string;
  lines: ReceiptLine[];
}

interface SplitReceiptCardProps {
  content: ReceiptContent;
  /** Resolved file uri of the user's payment QR, or null. */
  qrUri: string | null;
}

// Fixed light palette (the app's light theme) so the shared image reads cleanly
// on any device / chat background, independent of the sender's app theme.
const C = {
  bg: '#FAF7F0',
  ink: '#1A2E2A',
  muted: '#8A8D80',
  hair: '#E4DFD1',
  accent: '#1F8A6F',
  owed: '#B26A28',
  qrBg: '#FFFFFF',
  qrBorder: '#E4DFD1',
};

const INITIAL_COLORS = [
  '#C2604A',
  '#4A78C2',
  '#8A5AC2',
  '#3E9A78',
  '#C28A3E',
  '#B94A78',
  '#4AA5C2',
  '#7A7A3E',
];

function initialColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[hash % INITIAL_COLORS.length];
}

/**
 * A self-contained receipt rendered for image sharing. The parent captures it
 * via Skia's makeImageFromView on the forwarded ref, so the root View carries
 * `collapsable={false}` for a reliable Android snapshot.
 */
export const SplitReceiptCard = forwardRef<View, SplitReceiptCardProps>(function SplitReceiptCard(
  { content, qrUri },
  ref,
) {
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
        </View>
      ) : null}

      <Text style={styles.title}>{content.title}</Text>
      {content.subtitle ? <Text style={styles.subtitle}>{content.subtitle}</Text> : null}

      <View style={styles.divider} />

      <View style={styles.lines}>
        {content.lines.map((line) => {
          const hasItemList = !!(line.items && line.items.length > 0);
          return (
            <View key={line.key} style={[styles.line, hasItemList && styles.lineTop]}>
              {line.categoryIcon ? (
                <CategoryEmoji icon={line.categoryIcon} size={18} />
              ) : line.initial ? (
                <View style={[styles.initialCircle, { backgroundColor: initialColor(line.key) }]}>
                  <Text style={styles.initialText}>{line.initial}</Text>
                </View>
              ) : null}
              <View style={styles.lineText}>
                <Text style={styles.lineLabel} numberOfLines={1}>
                  {line.label}
                </Text>
                {line.sublabel ? <Text style={styles.lineSublabel}>{line.sublabel}</Text> : null}
                {hasItemList ? (
                  <View style={styles.itemList}>
                    {line.items!.map((item) => (
                      <View key={item.key} style={styles.itemRow}>
                        <Text style={styles.itemBullet}>{'•'}</Text>
                        {item.shared ? (
                          <View style={styles.sharedBadge}>
                            <Text style={styles.sharedBadgeText}>
                              {content.sharedLabel ?? 'Shared'}
                            </Text>
                          </View>
                        ) : null}
                        {item.name ? (
                          <Text style={styles.itemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <Text style={styles.lineAmount}>{line.amount}</Text>
            </View>
          );
        })}
      </View>

      {content.totalLabel && content.totalText ? (
        <>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{content.totalLabel}</Text>
            <Text style={styles.totalAmount}>{content.totalText}</Text>
          </View>
        </>
      ) : null}
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
    paddingBottom: 20,
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
    width: 212,
    height: 212,
    borderRadius: 8,
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
    marginTop: 3,
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 13,
    textAlign: 'center',
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
  lineTop: {
    alignItems: 'flex-start',
  },
  initialCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#FFFFFF',
    fontFamily: FONT.semibold,
    fontWeight: '600',
    fontSize: 12,
  },
  lineText: {
    flex: 1,
  },
  lineLabel: {
    color: C.ink,
    fontFamily: FONT.regular,
    fontSize: 14,
  },
  lineSublabel: {
    marginTop: 1,
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  itemList: {
    marginTop: 3,
    gap: 3,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  itemBullet: {
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  itemName: {
    flexShrink: 1,
    color: C.muted,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  sharedBadge: {
    borderRadius: 5,
    backgroundColor: '#E6F1EC',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sharedBadgeText: {
    color: C.accent,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
});

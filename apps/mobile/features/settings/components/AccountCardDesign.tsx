import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, type TextStyle, View } from 'react-native';

import { AccountLogo, Text } from '~/components/ui';
import {
  type CardDesignAppearance,
  type CardTextTone,
  resolveCardDesignAppearance,
} from '~/constants/cardDesigns';
import { forgetCustomLogoUri, getCustomLogoUri } from '~/services/userAssets';
import type { AccountType } from '~/types';

/**
 * Colours for everything drawn on top of card artwork. The wash under the text
 * (see CardDesignBackground) carries the contrast; these keep the secondary
 * text strong enough to survive on it, and give chips and tiles a backing of
 * their own because they hold the smallest type on the card.
 */
export interface CardDesignInk {
  text: string;
  meta: string;
  metaValue: string;
  divider: string;
  /** Behind chips, badges and tiles. */
  panel: string;
  border: string;
  /** Negative balances and urgent chips, tuned to read on the wash. */
  negative: string;
  textShadow: TextStyle;
}

const INK: Record<CardTextTone, CardDesignInk> = {
  light: {
    text: '#FFFFFF',
    meta: 'rgba(255,255,255,0.78)',
    metaValue: 'rgba(255,255,255,0.92)',
    divider: 'rgba(255,255,255,0.24)',
    panel: 'rgba(0,0,0,0.32)',
    border: 'rgba(255,255,255,0.2)',
    negative: '#FFB4AB',
    textShadow: {
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
  },
  dark: {
    text: '#1A1A1A',
    meta: 'rgba(26,26,26,0.74)',
    metaValue: 'rgba(26,26,26,0.9)',
    divider: 'rgba(26,26,26,0.2)',
    panel: 'rgba(255,255,255,0.55)',
    border: 'rgba(0,0,0,0.12)',
    negative: '#A8201A',
    // A soft light halo: contrast is measured on the blurred artwork, and a
    // patterned design (gingham, terrazzo) can still run a motif through a
    // letter. The halo separates the glyph from it without veiling the card.
    textShadow: {
      textShadowColor: 'rgba(255,255,255,0.75)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 4,
    },
  },
};

export function cardDesignInk(textTone: CardTextTone): CardDesignInk {
  return INK[textTone];
}

/**
 * Resolves a stored `accounts.card_design` value for drawing, or null.
 * Deliberately not memoised on the value: an upload can be deleted while the
 * value stays put, and the next render has to notice. Each call is a map
 * lookup or one cached stat.
 */
export function useCardDesignAppearance(value?: string | null): CardDesignAppearance | null {
  return resolveCardDesignAppearance(value, getCustomLogoUri);
}

interface CardDesignBackgroundProps {
  value: string | null | undefined;
  appearance: CardDesignAppearance;
  /** An account left out of totals: the artwork stays, but recedes. */
  dimmed?: boolean;
}

/**
 * The artwork and its wash, filling the card behind its content. The image is
 * cover-fitted and centred, so a collapsed card shows the middle band of the
 * design and expanding it reveals the rest, the same framing the crop screen
 * shows an uploader.
 */
export function CardDesignBackground({ value, appearance, dimmed }: CardDesignBackgroundProps) {
  const washColor = appearance.textTone === 'light' ? '0,0,0' : '255,255,255';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={appearance.source}
        style={[StyleSheet.absoluteFill, dimmed ? styles.dimmed : null]}
        contentFit="cover"
        contentPosition="center"
        transition={120}
        recyclingKey={value ?? undefined}
        onError={() => forgetCustomLogoUri(value)}
      />
      {appearance.scrim > 0 ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `rgba(${washColor},${appearance.scrim})` },
          ]}
        />
      ) : null}
    </View>
  );
}

interface CardDesignPreviewProps {
  value: string | null;
  appearance: CardDesignAppearance;
  accountName: string;
  logoId?: string | null;
  accountType: AccountType;
  balanceLabel: string;
  height: number;
}

/**
 * A still card face for pickers: the artwork with an account's logo, name and
 * balance laid out as the Accounts screen lays them, so legibility is judged
 * on the real thing rather than on a bare swatch.
 */
export function CardDesignPreview({
  value,
  appearance,
  accountName,
  logoId,
  accountType,
  balanceLabel,
  height,
}: CardDesignPreviewProps) {
  const ink = cardDesignInk(appearance.textTone);
  return (
    <View style={[styles.preview, { height, borderColor: ink.border }]}>
      <CardDesignBackground value={value} appearance={appearance} />
      <View style={styles.previewRow}>
        <AccountLogo logoId={logoId} type={accountType} size={30} />
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          style={[styles.previewName, { color: ink.text }, ink.textShadow]}
        >
          {accountName}
        </Text>
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          style={[styles.previewBalance, { color: ink.text }, ink.textShadow]}
        >
          {balanceLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dimmed: {
    opacity: 0.45,
  },
  preview: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#1E1E22',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  previewName: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.3,
  },
  previewBalance: {
    fontSize: 16,
    letterSpacing: -0.5,
  },
});

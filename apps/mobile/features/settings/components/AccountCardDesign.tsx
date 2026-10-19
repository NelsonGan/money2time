import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useSyncExternalStore } from 'react';
import { StyleSheet, type TextStyle, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AccountLogo, Text } from '~/components/ui';
import {
  type CardDesignAppearance,
  type CardTextTone,
  resolveCardDesignAppearance,
} from '~/constants/cardDesigns';
import {
  forgetCustomLogoUri,
  getCustomAssetRevision,
  getCustomLogoUri,
  subscribeCustomAssets,
} from '~/services/userAssets';
import type { AccountType } from '~/types';

/**
 * Colours for everything drawn on top of card artwork. Text only sits in two
 * places: the top row, over the measured band (see CardDesignBackground), and
 * an open card's details, over the sheet. These keep the secondary text close
 * to full strength on both, and give chips, tiles and buttons a panel of their
 * own because they hold the smallest type on the card.
 */
export interface CardDesignInk {
  text: string;
  meta: string;
  metaValue: string;
  divider: string;
  /** Behind chips, badges and tiles. */
  panel: string;
  border: string;
  /**
   * Opacity of the wash behind an open card's details, below the top row. A
   * floor: a design whose band is stronger (the busiest patterns) gets its
   * band's strength here too.
   */
  sheetOpacity: number;
  /** Negative balances and urgent chips, tuned to read on the band. */
  negative: string;
  textShadow: TextStyle;
}

const INK: Record<CardTextTone, CardDesignInk> = {
  light: {
    text: '#FFFFFF',
    meta: 'rgba(255,255,255,0.88)',
    metaValue: 'rgba(255,255,255,0.96)',
    divider: 'rgba(255,255,255,0.24)',
    panel: 'rgba(0,0,0,0.3)',
    border: 'rgba(255,255,255,0.2)',
    sheetOpacity: 0.42,
    negative: '#FFB4AB',
    textShadow: {
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
  },
  dark: {
    text: '#1A1A1A',
    meta: 'rgba(26,26,26,0.86)',
    metaValue: 'rgba(26,26,26,0.96)',
    divider: 'rgba(26,26,26,0.2)',
    panel: 'rgba(255,255,255,0.6)',
    border: 'rgba(0,0,0,0.14)',
    sheetOpacity: 0.66,
    negative: '#A8201A',
    // A soft light halo, so a motif that survives the band (a strawberry, a
    // terrazzo chip) still cannot run through a letter.
    textShadow: {
      textShadowColor: 'rgba(255,255,255,0.9)',
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
 * Subscribed to the upload store, so deleting an upload redraws every card
 * wearing it as the plain card at once, without rewriting those accounts.
 * Each call is a map lookup or one cached stat.
 */
export function useCardDesignAppearance(value?: string | null): CardDesignAppearance | null {
  useSyncExternalStore(subscribeCustomAssets, getCustomAssetRevision);
  return resolveCardDesignAppearance(value, getCustomLogoUri);
}

/** Height of the top row (name, balance, chips): the strip a stacked card shows. */
export const CARD_TEXT_BAND_HEIGHT = 54;
/** Where the band has faded out completely, below the top row. */
export const CARD_TEXT_BAND_FADE_END = 100;

interface CardDesignBackgroundProps {
  value: string | null | undefined;
  appearance: CardDesignAppearance;
  /**
   * `card` draws the band behind the top row (and the sheet when `expanded`);
   * `thumb` is the bare artwork, for swatches that carry no text.
   */
  variant?: 'card' | 'thumb';
  /** An open card: its details get the sheet behind them. */
  expanded?: boolean;
  /** Where the top row sits, when the face is taller than the row's card. */
  bandTop?: number;
  /** An account left out of totals: the artwork stays, but recedes. */
  dimmed?: boolean;
}

/**
 * The artwork and what keeps text readable on it, filling the card behind its
 * content. The image is cover-fitted and centred, so a closed card shows the
 * middle of the design and opening it reveals the rest, the framing the crop
 * screen shows an uploader.
 *
 * Nothing is washed uniformly. A band, as strong as the generator measured,
 * sits behind the top row and fades out below it, so the rest of a closed card
 * (which holds no text) keeps the artwork at full strength. An open card's
 * details sit on a frosted sheet instead, whatever the artwork is doing there.
 */
export function CardDesignBackground({
  value,
  appearance,
  variant = 'card',
  expanded = false,
  bandTop = 0,
  dimmed,
}: CardDesignBackgroundProps) {
  const wash = appearance.textTone === 'light' ? '0,0,0' : '255,255,255';
  const band = `rgba(${wash},${appearance.scrim})`;
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
      {variant === 'card' ? (
        <LinearGradient
          colors={[band, band, `rgba(${wash},0)`]}
          locations={[0, CARD_TEXT_BAND_HEIGHT / CARD_TEXT_BAND_FADE_END, 1]}
          style={[styles.band, { top: bandTop }]}
        />
      ) : null}
      {variant === 'card' && expanded ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={[
            styles.sheet,
            {
              backgroundColor: `rgba(${wash},${Math.max(
                cardDesignInk(appearance.textTone).sheetOpacity,
                appearance.scrim,
              )})`,
            },
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
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CARD_TEXT_BAND_FADE_END,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Just under the top row and its divider.
    top: CARD_TEXT_BAND_HEIGHT + 2,
    bottom: 0,
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

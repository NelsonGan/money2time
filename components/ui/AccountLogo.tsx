import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { resolveAccountLogoSource } from '~/constants/accountLogos';
import { getCustomLogoUri, isCustomLogoId } from '~/services/userAssets';
import type { AccountType } from '~/types';

interface AccountLogoProps {
  logoId?: string | null;
  /** Drives the fallback glyph when no logo is set. */
  type?: AccountType;
  /** Goal accounts render this emoji instead of a bank logo; 🎯 when unset. */
  goalEmoji?: string | null;
  /** Box dimension in px. Defaults to 32. */
  size?: number;
}

/**
 * Renders an account's bank/institution logo as-is (no tile, border, or padding).
 * Falls back to the bank/credit-card category icon when no logo is assigned.
 *
 * Memoized since it renders in long lists and grids with stable primitive props.
 */
export const AccountLogo = React.memo(function AccountLogo({
  logoId,
  type = 'debit',
  goalEmoji,
  size = 32,
}: AccountLogoProps) {
  const borderRadius = Math.round(size * 0.22);

  // Savings goals have no bank identity; their emoji is the logo. Raw emoji
  // render as text, so size via fontSize (CategoryEmoji's size only applies
  // to the hand-drawn PNG icons).
  if (type === 'goal') {
    return (
      <View style={[styles.fallback, { width: size, height: size }]}>
        <CategoryEmoji
          icon={goalEmoji || 'target'}
          size={Math.round(size * 0.78)}
          style={{ fontSize: Math.round(size * 0.62) }}
        />
      </View>
    );
  }

  // User-uploaded logos: render from disk and cover-crop so off-square images
  // fit the square footprint (the "crop to fit" behaviour).
  if (isCustomLogoId(logoId)) {
    const uri = getCustomLogoUri(logoId);
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
        />
      );
    }
  } else {
    const source = resolveAccountLogoSource(logoId);
    if (source) {
      return (
        <Image
          source={source}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="contain"
        />
      );
    }
  }

  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <CategoryEmoji
        icon={type === 'credit' ? 'credit-card' : 'bank'}
        size={Math.round(size * 0.78)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

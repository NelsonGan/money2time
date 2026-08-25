import { Repeat } from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { resolveSubscriptionLogoSource } from '~/constants/subscriptionLogos';
import { useThemeColors } from '~/hooks/useThemeColors';
import { forgetCustomLogoUri, getCustomLogoUri, isCustomLogoId } from '~/services/userAssets';

/**
 * Whether a stored id still resolves to art in this build. A rule keeps its
 * `logo_id` forever, but the bundled catalog is generated from the PNGs that a
 * fetch run actually produced, so an id can outlive its asset (a brand dropped
 * from the catalog, or a backup restored onto an older build). Callers that
 * have their own fallback should ask first rather than render an empty tile.
 */
export function hasSubscriptionLogoArt(logoId?: string | null): boolean {
  if (!logoId) return false;
  if (isCustomLogoId(logoId)) return getCustomLogoUri(logoId) != null;
  return resolveSubscriptionLogoSource(logoId) != null;
}

interface SubscriptionLogoProps {
  logoId?: string | null;
  /** Box dimension in px. Defaults to 32. */
  size?: number;
  /** Renders nothing (not even the repeat glyph) when no logo is set. */
  hideFallback?: boolean;
}

/**
 * Renders a recurring rule's subscription logo as-is (no tile, border, or
 * padding), mirroring AccountLogo. Falls back to the repeat glyph when the rule
 * carries no logo, which is what every pre-existing rule shows.
 */
export const SubscriptionLogo = React.memo(function SubscriptionLogo({
  logoId,
  size = 32,
  hideFallback = false,
}: SubscriptionLogoProps) {
  const themeColors = useThemeColors();
  const borderRadius = Math.round(size * 0.22);
  // A uri that just failed to load natively despite stat'ing as present at
  // resolve time (Sentry MONEY2TIME-R); see AccountLogo for the same guard.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);

  if (isCustomLogoId(logoId)) {
    const uri = getCustomLogoUri(logoId);
    if (uri && uri !== brokenUri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
          onError={() => {
            forgetCustomLogoUri(logoId);
            setBrokenUri(uri);
          }}
        />
      );
    }
  } else {
    const source = resolveSubscriptionLogoSource(logoId);
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

  if (hideFallback) return null;

  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Repeat size={Math.round(size * 0.62)} color={themeColors.textMuted} />
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

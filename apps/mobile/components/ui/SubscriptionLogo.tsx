import { Repeat } from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  isDarkSubscriptionMark,
  resolveSubscriptionLogoSource,
} from '~/constants/subscriptionLogos';
import { useResolvedTheme } from '~/context/ThemeContext';
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
 * The surface a plated mark sits on. Deliberately outside the theme palette:
 * these are third-party brand marks drawn for a white background, which is what
 * their own app icons use, so tinting it per palette would misrepresent them.
 */
const BRAND_PLATE = '#FFFFFF';
/**
 * How much of the plate the mark occupies. The inset is what makes a plated
 * tile read as an app icon rather than as a mark that has been boxed in.
 */
const PLATED_MARK_SCALE = 0.78;

/**
 * Renders a recurring rule's subscription logo as-is (no tile, border, or
 * padding), mirroring AccountLogo. Falls back to the repeat glyph when the rule
 * carries no logo, which is what every pre-existing rule shows.
 *
 * The one exception is a mark drawn dark on transparency (Apple's glyph,
 * Amazon's wordmark): bare on the dark surface it disappears, so in dark mode
 * it gets a white plate behind it. The tiles themselves stay transparent, which
 * is what keeps light mode free of the paper-card look a baked-in plate gives
 * (see scripts/lib/darkMark.mjs).
 */
export const SubscriptionLogo = React.memo(function SubscriptionLogo({
  logoId,
  size = 32,
  hideFallback = false,
}: SubscriptionLogoProps) {
  const themeColors = useThemeColors();
  const isDarkTheme = useResolvedTheme() === 'dark';
  const borderRadius = Math.round(size * 0.22);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
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
      if (isDarkTheme && isDarkSubscriptionMark(logoId)) {
        const markSize = Math.round(size * PLATED_MARK_SCALE);
        return (
          <View
            style={[
              styles.plate,
              { width: size, height: size, borderRadius, backgroundColor: BRAND_PLATE },
            ]}
          >
            <Image
              source={source}
              style={{ width: markSize, height: markSize }}
              resizeMode="contain"
            />
          </View>
        );
      }
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
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

import { Package } from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { resolveItemIconSource } from '~/constants/itemIcons';
import { useThemeColors } from '~/hooks/useThemeColors';
import { forgetCustomLogoUri, getCustomLogoUri, isCustomLogoId } from '~/services/userAssets';

interface ItemIconProps {
  iconId?: string | null;
  /** Box dimension in px. Defaults to 40. */
  size?: number;
}

/**
 * Renders an item's icon — a bundled library glyph, a user-uploaded image, or a
 * package fallback when none is set. Mirrors AccountLogo's resolve-or-fallback
 * shape but for the item-icon library. Images render with `contain` so the whole
 * image is always shown (never cropped).
 *
 * Memoized since it renders in long lists with stable primitive props.
 */
export const ItemIcon = React.memo(function ItemIcon({ iconId, size = 40 }: ItemIconProps) {
  const themeColors = useThemeColors();
  const box = { width: size, height: size } as const;
  // A uri that just failed to load natively despite stat'ing as present at
  // resolve time (Sentry MONEY2TIME-R); see CategoryEmoji for the same guard.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);

  // Library glyph (require) or user-uploaded image (file uri).
  const resolvedCustomUri = isCustomLogoId(iconId) ? getCustomLogoUri(iconId) : null;
  const customUri = resolvedCustomUri && resolvedCustomUri !== brokenUri ? resolvedCustomUri : null;
  const source = customUri ? { uri: customUri } : resolveItemIconSource(iconId);

  if (source) {
    return (
      <Image
        source={source}
        style={box}
        resizeMode="contain"
        onError={
          customUri
            ? () => {
                forgetCustomLogoUri(iconId);
                setBrokenUri(customUri);
              }
            : undefined
        }
      />
    );
  }

  return (
    <View style={[styles.fallback, box]}>
      <Package size={Math.round(size * 0.6)} color={themeColors.mutedForeground} strokeWidth={2} />
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

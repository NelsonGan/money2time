import { Package } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { resolveItemIconSource } from '~/constants/itemIcons';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getCustomLogoUri, isCustomLogoId } from '~/services/userAssets';

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

  // Library glyph (require) or user-uploaded image (file uri).
  const customUri = isCustomLogoId(iconId) ? getCustomLogoUri(iconId) : null;
  const source = customUri ? { uri: customUri } : resolveItemIconSource(iconId);

  if (source) {
    return <Image source={source} style={box} resizeMode="contain" />;
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

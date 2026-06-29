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
 * shape but for the item-icon library.
 *
 * Memoized since it renders in long lists with stable primitive props.
 */
export const ItemIcon = React.memo(function ItemIcon({ iconId, size = 40 }: ItemIconProps) {
  const themeColors = useThemeColors();
  const borderRadius = Math.round(size * 0.22);

  if (isCustomLogoId(iconId)) {
    const uri = getCustomLogoUri(iconId);
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
    const source = resolveItemIconSource(iconId);
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

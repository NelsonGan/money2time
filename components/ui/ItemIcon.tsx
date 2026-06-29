import { Package } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { resolveItemIconSource } from '~/constants/itemIcons';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getCustomLogoUri, isCustomLogoId } from '~/services/userAssets';

interface ItemIconProps {
  iconId?: string | null;
  /** Box dimension in px. Defaults to 40. Ignored when `fill` is set. */
  size?: number;
  /** Fill the parent (which must size it) instead of using a fixed `size`. */
  fill?: boolean;
}

/**
 * Renders an item's icon — a bundled library glyph, a user-uploaded image, or a
 * package fallback when none is set. Mirrors AccountLogo's resolve-or-fallback
 * shape but for the item-icon library. With `fill`, it expands to its parent so
 * the image scales responsively (e.g. the index card's hero tile).
 *
 * Memoized since it renders in long lists with stable primitive props.
 */
export const ItemIcon = React.memo(function ItemIcon({ iconId, size = 40, fill }: ItemIconProps) {
  const themeColors = useThemeColors();
  const borderRadius = fill ? 0 : Math.round(size * 0.22);
  // In fill mode, flex into the parent's content box (so parent padding is
  // respected); otherwise use a fixed square.
  const box = fill
    ? ({ flex: 1, alignSelf: 'stretch' } as const)
    : ({ width: size, height: size } as const);
  const fallbackGlyphSize = fill ? 56 : Math.round(size * 0.6);

  // Library glyph (require) or user-uploaded image (file uri). Both render with
  // `contain` so the whole image is shown — item images are never cropped.
  const customUri = isCustomLogoId(iconId) ? getCustomLogoUri(iconId) : null;
  const source = customUri ? { uri: customUri } : resolveItemIconSource(iconId);

  if (source) {
    return <Image source={source} style={[box, { borderRadius }]} resizeMode="contain" />;
  }

  return (
    <View style={[styles.fallback, box]}>
      <Package size={fallbackGlyphSize} color={themeColors.mutedForeground} strokeWidth={2} />
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

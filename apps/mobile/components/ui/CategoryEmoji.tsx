import { useState } from 'react';
import type { TextProps } from 'react-native';
import { Image, Platform, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { CATEGORY_ICON_CELL_SIZE, classifyCategoryIcon } from '~/constants/categoryIcons';
import { useResolvedTheme } from '~/context/ThemeContext';
import { forgetCustomLogoUri, getCustomLogoUri } from '~/services/userAssets';
import { cn } from '~/utils';

interface CategoryEmojiProps extends Omit<TextProps, 'children'> {
  icon?: string | null;
  parentIcon?: string | null;
  className?: string;
  /** Width/height in px when an image is rendered. Defaults to 20. */
  size?: number;
  /** When true, render nothing (instead of the circle placeholder) if no icon resolves. */
  hidePlaceholder?: boolean;
}

function normalize(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Renders the icon of a category, savings goal or budget template. Handles
 * every form of the stored value grammar (see constants/categoryIcons.ts):
 * a bundled hand-drawn PNG, a user-uploaded image, or a Unicode emoji glyph.
 * When no icon is set (and no parent icon to inherit), falls back to a
 * black/white circle placeholder that contrasts with the theme.
 */
export function CategoryEmoji({
  icon,
  parentIcon,
  className,
  size,
  hidePlaceholder,
  style,
  ...textProps
}: CategoryEmojiProps) {
  const theme = useResolvedTheme();
  const resolved = normalize(icon) ?? normalize(parentIcon);
  const classified = classifyCategoryIcon(resolved);
  const dimension = size ?? 20;
  // A uri that just failed to load natively despite stat'ing as present at
  // resolve time — the file was deleted between the sync exists-check and the
  // async decode (Sentry MONEY2TIME-R). Skipping it here, rather than retrying
  // it forever, is what makes the fallthrough to the placeholder below stick.
  // Every other user-asset image kind points back at this comment.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);

  if (classified.kind === 'bundled') {
    const { atlas, column, row } = classified.source;
    const scale = dimension / CATEGORY_ICON_CELL_SIZE;
    return (
      <View style={{ width: dimension, height: dimension, overflow: 'hidden' }}>
        <Image
          source={atlas.source}
          style={{
            position: 'absolute',
            width: atlas.width * scale,
            height: atlas.height * scale,
            left: -column * dimension,
            top: -row * dimension,
          }}
          resizeMode="stretch"
        />
      </View>
    );
  }

  if (classified.kind === 'custom') {
    // Resolved per render, like components/ui/ItemIcon.tsx. A missing file
    // (deleted outside the app, or a backup restored without its assets) falls
    // through to the placeholder rather than rendering a broken image.
    const uri = getCustomLogoUri(classified.ref);
    if (uri && uri !== brokenUri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          resizeMode="contain"
          onError={() => {
            forgetCustomLogoUri(classified.ref);
            setBrokenUri(uri);
          }}
        />
      );
    }
  }

  if (classified.kind === 'emoji') {
    // Match the image branch's footprint when the caller sized us, so a grid
    // mixing PNGs and emoji lines up. An explicit `style` still wins.
    //
    // lineHeight has to be set alongside fontSize: an emoji glyph overflows the
    // em box, so at the platform default line height its top and bottom get
    // clipped (visible wherever we size one into a fixed tile, e.g. the editor
    // icon rows). 1.25 clears the tallest glyphs. Android additionally reserves
    // font padding that offsets the glyph inside that box, so drop it.
    return (
      <Text
        {...textProps}
        className={className}
        style={[
          size ? { fontSize: size, lineHeight: Math.ceil(size * 1.25) } : null,
          size && Platform.OS === 'android' ? { includeFontPadding: false } : null,
          style,
        ]}
      >
        {classified.glyph}
      </Text>
    );
  }

  if (hidePlaceholder) {
    return null;
  }
  return (
    <Text {...textProps} className={cn(className, 'leading-7')} style={style}>
      {theme === 'dark' ? '⚪' : '⚫'}
    </Text>
  );
}

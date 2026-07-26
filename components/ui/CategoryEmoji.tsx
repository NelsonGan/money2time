import type { TextProps } from 'react-native';
import { Image } from 'react-native';

import { Text } from '~/components/ui/text';
import { classifyCategoryIcon } from '~/constants/categoryIcons';
import { useResolvedTheme } from '~/context/ThemeContext';
import { getCustomLogoUri } from '~/services/userAssets';
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

  if (classified.kind === 'bundled') {
    return (
      <Image
        source={classified.source}
        style={{ width: dimension, height: dimension }}
        resizeMode="contain"
      />
    );
  }

  if (classified.kind === 'custom') {
    // Resolved per render, like components/ui/ItemIcon.tsx. A missing file
    // (deleted outside the app, or a backup restored without its assets) falls
    // through to the placeholder rather than rendering a broken image.
    const uri = getCustomLogoUri(classified.ref);
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          resizeMode="contain"
        />
      );
    }
  }

  if (classified.kind === 'emoji') {
    // Match the image branch's footprint when the caller sized us, so a grid
    // mixing PNGs and emoji lines up. An explicit `style` still wins.
    return (
      <Text {...textProps} className={className} style={[size ? { fontSize: size } : null, style]}>
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

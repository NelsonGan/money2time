import type { TextProps } from 'react-native';
import { Image } from 'react-native';

import { Text } from '~/components/ui/text';
import { resolveCategoryIconSource } from '~/constants/categoryIcons';
import { useResolvedTheme } from '~/context/ThemeContext';
import { cn } from '~/utils';

interface CategoryEmojiProps extends Omit<TextProps, 'children'> {
  icon?: string | null;
  parentIcon?: string | null;
  className?: string;
  /** Width/height in px when a hand-drawn icon is rendered. Defaults to 20. */
  size?: number;
}

function normalize(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Renders a category's icon. Emoji values stored in the DB resolve to hand-drawn
 * PNG icons via resolveCategoryIconSource; emojis without a matching icon render as the
 * emoji glyph. When no icon is set (and no parent icon to inherit), falls back to
 * a black/white circle placeholder that contrasts with the theme.
 */
export function CategoryEmoji({
  icon,
  parentIcon,
  className,
  size,
  ...textProps
}: CategoryEmojiProps) {
  const theme = useResolvedTheme();
  const resolved = normalize(icon) ?? normalize(parentIcon);

  const source = resolveCategoryIconSource(resolved);
  if (source) {
    const dimension = size ?? 20;
    return (
      <Image source={source} style={{ width: dimension, height: dimension }} resizeMode="contain" />
    );
  }

  if (resolved) {
    return (
      <Text {...textProps} className={className}>
        {resolved}
      </Text>
    );
  }
  return (
    <Text {...textProps} className={cn(className, 'leading-7')}>
      {theme === 'dark' ? '⚪' : '⚫'}
    </Text>
  );
}

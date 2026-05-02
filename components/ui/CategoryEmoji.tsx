import type { TextProps } from 'react-native';

import { Text } from '~/components/ui/text';
import { useResolvedTheme } from '~/context/ThemeContext';
import { cn } from '~/utils';

interface CategoryEmojiProps extends Omit<TextProps, 'children'> {
  icon?: string | null;
  parentIcon?: string | null;
  className?: string;
}

function normalize(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Renders a category's icon. When no emoji is set (and no parent icon to inherit),
 * falls back to a black/white circle placeholder that contrasts with the theme.
 * The placeholder uses a generous line-height so the emoji glyph isn't clipped.
 */
export function CategoryEmoji({ icon, parentIcon, className, ...textProps }: CategoryEmojiProps) {
  const theme = useResolvedTheme();
  const resolved = normalize(icon) ?? normalize(parentIcon);
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

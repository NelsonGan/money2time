import type { TextProps } from 'react-native';

import { Text } from '~/components/ui/text';
import { cn } from '~/utils';

interface CategoryEmojiProps extends Omit<TextProps, 'children'> {
  icon?: string | null;
  parentIcon?: string | null;
  name?: string | null;
  className?: string;
}

function normalize(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Renders a category's icon. When no emoji is set (and no parent icon to inherit),
 * falls back to the uppercase first letter of the name as a muted monogram.
 */
export function CategoryEmoji({
  icon,
  parentIcon,
  name,
  className,
  ...textProps
}: CategoryEmojiProps) {
  const resolved = normalize(icon) ?? normalize(parentIcon);
  if (resolved) {
    return (
      <Text {...textProps} className={className}>
        {resolved}
      </Text>
    );
  }
  const initial = (normalize(name)?.charAt(0) ?? '·').toUpperCase();
  return (
    <Text {...textProps} className={cn('text-muted-foreground font-semibold', className)}>
      {initial}
    </Text>
  );
}

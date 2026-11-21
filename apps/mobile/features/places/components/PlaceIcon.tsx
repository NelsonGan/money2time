import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { useIsFlatIcons } from '~/context/ThemeContext';

import type { PlaceIconSpec } from '../lib/placeIcons';

interface PlaceIconProps {
  spec: PlaceIconSpec;
  /** The clay art's box. */
  size: number;
  /** The flat line icon's size; line art reads smaller than clay. */
  flatSize: number;
  /** The flat line icon's colour (clay is never tinted). */
  color: string;
}

/**
 * A place's icon in the user's icon style: clay art from the category pack by
 * default, the Lucide line icon with flat icons (README: Icon style). A site
 * that puts a tinted plate behind the flat icon checks `useIsFlatIcons()`
 * itself, since clay never sits on one.
 */
export function PlaceIcon({ spec, size, flatSize, color }: PlaceIconProps) {
  if (useIsFlatIcons()) {
    const Icon = spec.flat;
    return <Icon size={flatSize} color={color} />;
  }
  return <CategoryEmoji icon={spec.clay} size={size} hidePlaceholder />;
}

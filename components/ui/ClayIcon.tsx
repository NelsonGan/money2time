import type { ImageStyle, StyleProp } from 'react-native';
import { Image } from 'react-native';

import { CLAY_ICON_SOURCES, type ClayIconName } from '~/constants/clayIcons.generated';

export type { ClayIconName };
export { CLAY_ICON_SOURCES };

interface ClayIconProps {
  name: ClayIconName;
  /** Width and height in px. These read best between 18 and 44. */
  size?: number;
  /** 0–1. For a resting bottom-tab glyph, or art behind a disabled control. */
  opacity?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * A soft-clay illustration from `assets/clay-icons/`.
 *
 * These carry their own colour and depth, so they are deliberately **never
 * tinted** — not per theme, not for an active state. Light and dark render the
 * same artwork; contrast comes from the surface behind them. An active tab uses
 * a different file (`nav/home-active`), not a tint, and a resting one is dimmed
 * with `opacity` rather than recoloured.
 *
 * Use clay for anything that names a *thing*: tab glyphs, Settings tiles,
 * insight-type art, empty-state illustrations. Small interface chrome that
 * needs crisp edges at 15–16px (chevrons, close buttons, numpad keys) stays on
 * Lucide line icons, which clay cannot match at that size.
 */
export function ClayIcon({ name, size = 24, opacity, style, accessibilityLabel }: ClayIconProps) {
  return (
    <Image
      source={CLAY_ICON_SOURCES[name]}
      style={[{ width: size, height: size }, opacity == null ? null : { opacity }, style]}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
    />
  );
}

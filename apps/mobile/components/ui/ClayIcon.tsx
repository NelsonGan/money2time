import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { Image, View } from 'react-native';

import { CLAY_ICON_SOURCES, type ClayIconName } from '~/constants/clayIcons.generated';
import type { ColorPalette } from '~/constants/designSystem';
import {
  DEFAULT_FLAT_SIZE_RATIO,
  FLAT_ICON_FOR_CLAY,
  type FlatIconSpec,
  type FlatIconTone,
} from '~/constants/flatIcons';
import { useIconStyle } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';

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
  /**
   * Overrides for the flat rendering only. Pass this where the site's pre-clay
   * icon differed from the shared entry in `FLAT_ICON_FOR_CLAY` — the same clay
   * art is reused across screens that used to draw different line icons.
   */
  flat?: Partial<FlatIconSpec>;
  /** Flat-only pixel size. Defaults to 72% of `size`; see `constants/flatIcons`. */
  flatSize?: number;
  /** Flat-only colour, overriding the tone in the map. */
  flatColor?: string;
  /** Flat-only tone token, resolved against the active theme palette. */
  flatTone?: FlatIconTone;
}

/**
 * An icon in the app's own chrome, drawn either as a soft-clay illustration
 * from `assets/clay-icons/` (the default) or as the flat Lucide line icon that
 * preceded it, per the user's `settings.iconStyle`.
 *
 * **Clay** carries its own colour and depth, so it is deliberately **never
 * tinted** — not per theme, not for an active state. Light and dark render the
 * same artwork; contrast comes from the surface behind them. An active tab uses
 * a different file (`nav/home-active`), not a tint, and a resting one is dimmed
 * with `opacity` rather than recoloured.
 *
 * **Flat** is the opposite: it is a single-colour stroke that has to be told
 * what colour to be, and it wants the tinted plate or filled disc behind it
 * that clay does without. This component only swaps the glyph — a site whose
 * container also changed reads `useIconStyle()` and branches there.
 *
 * Use this for anything that names a *thing*: tab glyphs, Settings tiles,
 * insight-type art, empty-state illustrations. Small interface chrome that
 * needs crisp edges at 15–16px (chevrons, close buttons, numpad keys) stays on
 * Lucide line icons directly, which clay cannot match at that size.
 */
export function ClayIcon({
  name,
  size = 24,
  opacity,
  style,
  accessibilityLabel,
  flat,
  flatSize,
  flatColor,
  flatTone,
}: ClayIconProps) {
  // Only the icon-style read happens here. Resolving a tone against the palette
  // lives in FlatGlyph so the clay path — which is every icon for most users, on
  // screens that draw dozens of them — subscribes to one context, not two.
  if (useIconStyle() === 'flat') {
    return (
      <FlatGlyph
        name={name}
        size={size}
        opacity={opacity}
        style={style}
        accessibilityLabel={accessibilityLabel}
        flat={flat}
        flatSize={flatSize}
        flatColor={flatColor}
        flatTone={flatTone}
      />
    );
  }

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

function FlatGlyph({
  name,
  size = 24,
  opacity,
  style,
  accessibilityLabel,
  flat,
  flatSize,
  flatColor,
  flatTone,
}: ClayIconProps) {
  const themeColors = useThemeColors();
  const spec = { ...FLAT_ICON_FOR_CLAY[name], ...flat };
  const Icon = spec.icon;
  const color = flatColor ?? resolveTone(flatTone ?? spec.tone ?? 'primary', themeColors);
  const resolvedSize = flatSize ?? Math.round(size * DEFAULT_FLAT_SIZE_RATIO);

  // The clay art occupies a full `size` square, so a smaller flat glyph is
  // centred in that same box to keep every surrounding layout unchanged.
  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style as StyleProp<ViewStyle>,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
    >
      <Icon
        size={resolvedSize}
        color={color}
        strokeWidth={spec.strokeWidth ?? 2}
        fill={spec.filled ? color : 'none'}
        opacity={opacity}
      />
    </View>
  );
}

function resolveTone(tone: FlatIconTone, themeColors: ColorPalette): string {
  switch (tone) {
    case 'text':
      return themeColors.text;
    case 'muted':
      return themeColors.textMuted;
    case 'success':
      return themeColors.success;
    case 'destructive':
      return themeColors.error;
    case 'white':
      return '#FFFFFF';
    case 'primary':
    default:
      return themeColors.primary;
  }
}

import { getThemePalette } from '~/constants/designSystem';
import type { ThemeColor } from '~/types';

/**
 * The user's theme primary, in both appearances, as the 0xRRGGBB integers the
 * widget extension expects.
 *
 * Neither the extension nor the Live Activity can read `ThemeContext`, so the
 * colour has to travel to them as data. Both variants go, because the OS draws
 * these surfaces in whichever appearance the viewer is in and never asks the
 * app which theme is active.
 */
export interface LiveEarningsAccent {
  accentLightHex: number;
  accentDarkHex: number;
}

function hexToInt(color: string): number {
  const parsed = Number.parseInt(color.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0x1f8a6f;
}

export function liveEarningsAccent(themeColor: ThemeColor): LiveEarningsAccent {
  return {
    accentLightHex: hexToInt(getThemePalette(themeColor, 'light').primary),
    accentDarkHex: hexToInt(getThemePalette(themeColor, 'dark').primary),
  };
}

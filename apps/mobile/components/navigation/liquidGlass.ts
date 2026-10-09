import { Platform } from 'react-native';

type GlassNavView = typeof import('expo-glass-effect').GlassView;

let cachedGlassView: GlassNavView | null | undefined;

/** Use the native effect only when both the compiled app and iOS support it. */
export function getLiquidGlassNavView(): GlassNavView | null {
  if (cachedGlassView !== undefined) return cachedGlassView;
  cachedGlassView = null;
  if (Platform.OS !== 'ios') return null;

  try {
    // Defer loading the native view so older binaries without this module can
    // render the blurred fallback after an over-the-air update.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glass = require('expo-glass-effect') as typeof import('expo-glass-effect');
    if (glass.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()) {
      cachedGlassView = glass.GlassView;
    }
  } catch {
    // The native module is not present in this build.
  }

  return cachedGlassView;
}

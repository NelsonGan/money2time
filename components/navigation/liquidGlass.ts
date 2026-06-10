import { Platform } from 'react-native';

export const GLASS_NAV_HEIGHT = 62;
const GLASS_NAV_CLEARANCE = 10;

export function getGlassNavBottomGap(safeBottom: number) {
  return Math.max(safeBottom - 12, 12);
}

/** Vertical space the floating glass bar occupies above the screen bottom. */
export function getGlassNavReservedInset(safeBottom: number) {
  return getGlassNavBottomGap(safeBottom) + GLASS_NAV_HEIGHT + GLASS_NAV_CLEARANCE;
}

let cachedAvailability: boolean | null = null;

/**
 * True when the OS supports Liquid Glass (iOS 26+ built against the iOS 26 SDK).
 * Guarded so it safely returns false in Jest, Expo Go without the native module,
 * and on Android/web.
 */
export function isLiquidGlassNavEnabled(): boolean {
  if (cachedAvailability !== null) return cachedAvailability;
  if (Platform.OS !== 'ios') {
    cachedAvailability = false;
    return cachedAvailability;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glass = require('expo-glass-effect') as {
      isLiquidGlassAvailable: () => boolean;
    };
    cachedAvailability = glass.isLiquidGlassAvailable();
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

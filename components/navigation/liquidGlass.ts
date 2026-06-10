import { Platform } from 'react-native';

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

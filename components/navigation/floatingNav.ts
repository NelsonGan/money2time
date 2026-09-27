import { Platform } from 'react-native';

export const FLOATING_NAV_HEIGHT = 62;
const FLOATING_NAV_CLEARANCE = 10;

export function getFloatingNavBottomGap(safeBottom: number) {
  // Android's gesture handle sits inside the bottom inset. Keep the entire
  // floating bar above it, including on edge-to-edge devices reporting zero.
  if (Platform.OS === 'android') return Math.max(safeBottom + 8, 24);
  return Math.max(safeBottom - 12, 12);
}

/** Vertical space the floating bar occupies above the screen bottom. */
export function getFloatingNavReservedInset(safeBottom: number) {
  return getFloatingNavBottomGap(safeBottom) + FLOATING_NAV_HEIGHT + FLOATING_NAV_CLEARANCE;
}

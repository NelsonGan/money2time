import { Platform } from 'react-native';

import type { NavPlacement } from '~/utils/adaptiveLayout';

export const FLOATING_NAV_HEIGHT = 62;
const FLOATING_NAV_CLEARANCE = 10;

export function getFloatingNavBottomGap(safeBottom: number) {
  // Android's gesture handle sits inside the bottom inset. Keep the entire
  // floating bar above it, including on edge-to-edge devices reporting zero.
  if (Platform.OS === 'android') return Math.max(safeBottom + 8, 24);
  return Math.max(safeBottom - 12, 12);
}

/**
 * Vertical space the tab bar occupies above the screen bottom. With the side
 * rail (iPhone Duo) nothing sits along the bottom, so only the home indicator
 * needs clearing.
 */
export function getFloatingNavReservedInset(
  safeBottom: number,
  placement: NavPlacement = 'bottom',
) {
  if (placement === 'side') return getSideRailFootGap(safeBottom) + FLOATING_NAV_CLEARANCE;
  return getFloatingNavBottomGap(safeBottom) + FLOATING_NAV_HEIGHT + FLOATING_NAV_CLEARANCE;
}

/*
 * The side rail. On iPhone Duo the tab pill runs down the system's side strip
 * with the + button at its foot, where iOS puts its own vertical tab bar. On
 * iPad it sits at the top of the leading edge, where a sidebar sits, with the
 * + right under it.
 */

/** One tab's extent along the bar, in a row or a column. */
export const NAV_ITEM_EXTENT = 58;
/** The pill's padding at each end, along its length. */
const NAV_PILL_END_PADDING = 8;
/** Gap between the top safe area and a top-aligned rail (iPad). */
const SIDE_RAIL_TOP_GAP = 12;

/** Width of the rail's tab pill, centred in the side strip. */
export const SIDE_RAIL_PILL_WIDTH = 64;
/** Room kept under the pill for the + button, whether or not it shows. */
export const SIDE_RAIL_FAB_SLOT = 76;

/** Gap between the bottom of the window and the rail's lowest item. */
export function getSideRailFootGap(safeBottom: number) {
  return Math.max(safeBottom - 12, 12);
}

/** Distance from the top of the window to a top-aligned rail's pill (iPad). */
export function getSideRailTopGap(safeTop: number) {
  return safeTop + SIDE_RAIL_TOP_GAP;
}

/** Length of the vertical tab pill holding `tabCount` tabs. */
export function getSideRailPillLength(tabCount: number) {
  return tabCount * NAV_ITEM_EXTENT + NAV_PILL_END_PADDING * 2;
}

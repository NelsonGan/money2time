import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Where the app's chrome goes for the space it is given. Pure, so the rules
 * are testable and every screen reads the same answer through
 * `useDeviceLayout()`.
 *
 * Phones keep the bottom bar. iPhone Duo (Apple's foldable) gets the layout
 * its own system UI uses: navigation in a vertical rail on the side, and on
 * the open inner display a second pane. Duo is recognised by the space it
 * gives the app, never by model: an iPhone that reserves a side strip of the
 * window for the system (the closed outer display), or an iPhone window wider
 * than tall (the open inner display, which ignores the app's portrait lock).
 * Neither ever happens on another iPhone or Android, so their layout is
 * unchanged.
 *
 * iPad gets the same rail on its leading edge whenever its window is wider
 * than a phone, and two panes once the content beside the rail fits two
 * phone-width columns. It goes by window size, not model, so Split View,
 * Slide Over and resizable windows get the layout that fits them: a narrow
 * window is laid out exactly like a phone.
 */

export type NavPlacement = 'bottom' | 'side';

interface AdaptiveLayoutInput {
  platform: string;
  isPad: boolean;
  width: number;
  height: number;
  insets: EdgeInsets;
}

interface AdaptiveLayout {
  /** Bottom floating bar (every phone and tablet) or a vertical side rail. */
  navPlacement: NavPlacement;
  /** The window edge the side rail sits on. Always the trailing hardware edge. */
  navEdge: 'left' | 'right';
  /**
   * Width the side rail takes from the content, measured from the window
   * edge. 0 with the bottom bar.
   */
  navRailInset: number;
  /**
   * Where the rail's tabs sit: at the foot on the Duo, under the system's
   * clock and camera; at the top on iPad, where a sidebar sits.
   */
  navRailAlign: 'top' | 'bottom';
  /** The window is wide enough for two phone-width panes side by side. */
  isTwoPane: boolean;
  /**
   * The window is too wide for a phone layout to stretch across, so
   * phone-shaped pages and sheets are centred in a readable column.
   */
  isWide: boolean;
  /**
   * Tab pages with a wide layout of their own (grids, side-by-side cards) may
   * use the whole content width. iPad only: on the open Duo they get a frame
   * centred on the fold instead (`foldSpan`), so nothing straddles the hinge.
   */
  wideTabs: boolean;
  /**
   * Pane widths when `isTwoPane`, else null, adding up to the content beside
   * the rail. On the Duo the panes meet at the window's centre, where it
   * folds, so nothing straddles the hinge (physical sides, so they do not
   * flip in right-to-left languages); the rail comes out of the pane on its
   * side. On iPad the content is split evenly.
   */
  panes: { left: number; right: number } | null;
}

/** A system side strip narrower than this is a rounding artefact, not a bar. */
const SIDE_STRIP_MIN = 40;
/** Two phone-width panes need at least this much width. */
const TWO_PANE_MIN_WIDTH = 800;
/** Rail width when the system gives no side strip (open, before 27.1 bars). */
export const SIDE_RAIL_WIDTH = 84;
/**
 * An iPad window narrower than this (Slide Over, a third of Split View, a
 * small window) is phone-sized: bottom bar, phone layout.
 */
const IPAD_SIDE_RAIL_MIN_WIDTH = 600;
/** Content width beside the iPad rail that fits two phone-width panes. */
const IPAD_TWO_PANE_MIN_CONTENT = 800;

const BOTTOM_LAYOUT: AdaptiveLayout = {
  navPlacement: 'bottom',
  navEdge: 'right',
  navRailInset: 0,
  navRailAlign: 'bottom',
  isTwoPane: false,
  isWide: false,
  wideTabs: false,
  panes: null,
};

function resolvePadLayout(width: number): AdaptiveLayout {
  if (width < IPAD_SIDE_RAIL_MIN_WIDTH) return BOTTOM_LAYOUT;
  const content = width - SIDE_RAIL_WIDTH;
  const isTwoPane = content >= IPAD_TWO_PANE_MIN_CONTENT;
  const left = Math.round(content / 2);
  return {
    navPlacement: 'side',
    navEdge: 'left',
    navRailInset: SIDE_RAIL_WIDTH,
    navRailAlign: 'top',
    isTwoPane,
    isWide: true,
    wideTabs: true,
    panes: isTwoPane ? { left, right: content - left } : null,
  };
}

export function resolveAdaptiveLayout({
  platform,
  isPad,
  width,
  height,
  insets,
}: AdaptiveLayoutInput): AdaptiveLayout {
  if (platform !== 'ios') return BOTTOM_LAYOUT;
  if (isPad) return resolvePadLayout(width);

  const sideStrip = Math.max(insets.left, insets.right);
  const hasSideStrip = sideStrip >= SIDE_STRIP_MIN;
  const isTwoPane = width > height && width >= TWO_PANE_MIN_WIDTH;
  if (!hasSideStrip && !isTwoPane) return BOTTOM_LAYOUT;

  // iOS puts its side strip on the hardware's trailing edge; follow it.
  const navEdge = insets.left > insets.right ? 'left' : 'right';
  const navRailInset = hasSideStrip ? sideStrip : SIDE_RAIL_WIDTH;
  const half = width / 2;
  return {
    navPlacement: 'side',
    navEdge,
    navRailInset,
    navRailAlign: 'bottom',
    isTwoPane,
    isWide: isTwoPane,
    wideTabs: false,
    panes: isTwoPane
      ? navEdge === 'right'
        ? { left: half, right: half - navRailInset }
        : { left: half - navRailInset, right: half }
      : null,
  };
}

/**
 * Widest a phone-shaped page is drawn on the open iPhone Duo and on iPad.
 * Tablets centre their content at the same width (`TABLET_CONTENT_MAX_WIDTH`
 * reuses it).
 */
export const READABLE_COLUMN_MAX_WIDTH = 600;

/**
 * In a wide window (the open iPhone Duo, iPad), a page that has no wide
 * layout of its own is centred in a readable column, the way iOS centres
 * sheets there, instead of stretching a phone layout across the screen.
 * Returns the column's width and the margin on each side of it within
 * `available`.
 */
export function readableColumn(available: number, isWide: boolean) {
  const width = isWide ? Math.min(available, READABLE_COLUMN_MAX_WIDTH) : available;
  return { width, margin: (available - width) / 2 };
}

/**
 * Side padding that keeps a list's rows in a readable column of at most
 * `READABLE_COLUMN_MAX_WIDTH` (plus `minPadding` each side) on a wide screen,
 * and `minPadding` when the list is narrower than that.
 */
export function readableColumnPadding(listWidth: number, minPadding: number): number {
  return Math.max(minPadding, (listWidth - READABLE_COLUMN_MAX_WIDTH) / 2);
}

/** Widest a wide tab page's content runs on iPad (grids, cards side by side). */
export const WIDE_TAB_CONTENT_MAX_WIDTH = 1180;
/** Width a wide tab page needs before it lays out a second column. */
const WIDE_TAB_TWO_COLUMN_MIN_WIDTH = 880;

/**
 * How a tab page with a wide layout of its own (Accounts, Albums, Settings)
 * uses `available` width. On iPad (`wideTabs`) it gets two columns once there
 * is room for them, in a column of at most `WIDE_TAB_CONTENT_MAX_WIDTH`;
 * narrower, a single readable column. On the open iPhone Duo, in a frame
 * centred on the fold (`onFold`, see `foldSpan`), two columns across the
 * whole frame, so they meet on the hinge. Elsewhere one column, with the
 * width left to the page as before (`maxWidth` null).
 */
export function wideTabColumns(
  available: number,
  wideTabs: boolean,
  onFold = false,
): { columns: 1 | 2; maxWidth: number | null } {
  if (onFold && !wideTabs) return { columns: 2, maxWidth: available };
  if (!wideTabs) return { columns: 1, maxWidth: null };
  if (available >= WIDE_TAB_TWO_COLUMN_MIN_WIDTH) {
    return { columns: 2, maxWidth: WIDE_TAB_CONTENT_MAX_WIDTH };
  }
  return { columns: 1, maxWidth: READABLE_COLUMN_MAX_WIDTH };
}

/**
 * The open iPhone Duo's frame for a page with two equal columns of its own
 * (`wideTabColumns`): centred on the fold and twice as wide as the narrower
 * side, so the columns meet on the hinge, one on each half of the display,
 * and the side rail is balanced by an equal margin on the other side.
 * `foldAt` is where the fold falls within `available`. Returns the frame's
 * width and the margins left on each side of it.
 */
export function foldSpan(
  available: number,
  foldAt: number,
): { width: number; left: number; right: number } {
  const half = Math.max(0, Math.min(foldAt, available - foldAt));
  return { width: half * 2, left: foldAt - half, right: available - foldAt - half };
}

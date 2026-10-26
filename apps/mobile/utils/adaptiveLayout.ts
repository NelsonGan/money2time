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
 * Neither ever happens on another iPhone, iPad or Android, so their layout is
 * unchanged.
 */

export type NavPlacement = 'bottom' | 'side';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AdaptiveLayoutInput {
  platform: 'ios' | 'android' | string;
  isPad: boolean;
  width: number;
  height: number;
  insets: EdgeInsets;
}

export interface AdaptiveLayout {
  /** Bottom floating bar (every phone and tablet) or a vertical side rail. */
  navPlacement: NavPlacement;
  /** The window edge the side rail sits on. Always the trailing hardware edge. */
  navEdge: 'left' | 'right';
  /**
   * Width the side rail takes from the content, measured from the window
   * edge. 0 with the bottom bar.
   */
  navRailInset: number;
  /** The window is wide enough for two phone-width panes side by side. */
  isTwoPane: boolean;
  /**
   * Pane widths when `isTwoPane`, else null. The panes meet at the window's
   * centre, where the Duo folds, so nothing straddles the hinge (physical
   * sides, so they do not flip in right-to-left languages); the rail
   * comes out of the pane on its side.
   */
  panes: { left: number; right: number } | null;
}

/** A system side strip narrower than this is a rounding artefact, not a bar. */
const SIDE_STRIP_MIN = 40;
/** Two phone-width panes need at least this much width. */
const TWO_PANE_MIN_WIDTH = 800;
/** Rail width when the system gives no side strip (open, before 27.1 bars). */
export const SIDE_RAIL_WIDTH = 84;

const BOTTOM_LAYOUT: AdaptiveLayout = {
  navPlacement: 'bottom',
  navEdge: 'right',
  navRailInset: 0,
  isTwoPane: false,
  panes: null,
};

export function resolveAdaptiveLayout({
  platform,
  isPad,
  width,
  height,
  insets,
}: AdaptiveLayoutInput): AdaptiveLayout {
  if (platform !== 'ios' || isPad) return BOTTOM_LAYOUT;

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
    isTwoPane,
    panes: isTwoPane
      ? navEdge === 'right'
        ? { left: half, right: half - navRailInset }
        : { left: half - navRailInset, right: half }
      : null,
  };
}

/**
 * Widest a phone-shaped page is drawn on the open iPhone Duo. Tablets centre
 * their content at the same width (`TABLET_CONTENT_MAX_WIDTH` reuses it).
 */
export const READABLE_COLUMN_MAX_WIDTH = 600;

/**
 * On the open iPhone Duo, a page that has no two-pane layout of its own is
 * centred in a readable column, the way iOS centres sheets there, instead of
 * stretching a phone layout across both halves. Returns the column's width
 * and the margin on each side of it within `available`.
 */
export function readableColumn(available: number, isTwoPane: boolean) {
  const width = isTwoPane ? Math.min(available, READABLE_COLUMN_MAX_WIDTH) : available;
  return { width, margin: (available - width) / 2 };
}

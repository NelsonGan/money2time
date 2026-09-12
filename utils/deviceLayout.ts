export const TABLET_COMPACT_MAX_WIDTH = 743;
export const TABLET_EXPANDED_MIN_WIDTH = 1024;
export const TABLET_SIDEBAR_WIDTH = 224;

export const TABLET_READABLE_MAX_WIDTH = 760;
export const TABLET_FORM_MAX_WIDTH = 900;
/** Legacy cap used by floating navigation and sheet-style controls. */
export const TABLET_CONTENT_MAX_WIDTH = 600;
/** Wider destination canvas introduced for the responsive iPad layouts. */
export const TABLET_CANVAS_MAX_WIDTH = 1040;
export const TABLET_WIDE_MAX_WIDTH = 1180;

export type DeviceLayoutTier = 'compact' | 'regular' | 'expanded';

interface ResolveDeviceLayoutInput {
  windowWidth: number;
  windowHeight: number;
  /** The native idiom/min-dimension check performed by the React Native hook. */
  isTablet: boolean;
  /** Width made available by an outer shell, such as the area beside the iPad sidebar. */
  viewportWidth?: number;
}

export interface DeviceLayoutMetrics {
  tier: DeviceLayoutTier;
  isTablet: boolean;
  isLandscape: boolean;
  isCompact: boolean;
  isRegularTablet: boolean;
  isExpandedTablet: boolean;
  windowWidth: number;
  windowHeight: number;
  screenWidth: number;
  screenHeight: number;
  workAreaWidth: number;
  sidebarWidth: number;
  /** Backward-compatible 600pt tablet width used by legacy consumers. */
  contentWidth: number;
  /** Width of the responsive destination canvas for newly migrated screens. */
  canvasWidth: number;
  readableWidth: number;
  formWidth: number;
  wideWidth: number;
  tabletPadding: number;
  gutter: number;
  paneGap: number;
  gridColumns: number;
}

function columnsForWidth(width: number): number {
  if (width >= 1180) return 5;
  if (width >= 1000) return 4;
  if (width >= 744) return 3;
  if (width >= 600) return 2;
  return 1;
}

/**
 * Pure responsive-layout resolver shared by the hook and Jest tests.
 *
 * `windowWidth` decides the navigation tier. `viewportWidth` only scopes the
 * content a shell gives its descendants, so the expanded tier remains stable
 * inside the work area beside the sidebar.
 */
export function resolveDeviceLayout({
  windowWidth,
  windowHeight,
  isTablet,
  viewportWidth,
}: ResolveDeviceLayoutInput): DeviceLayoutMetrics {
  const isLandscape = windowWidth > windowHeight;
  const isCompact = !isTablet || windowWidth <= TABLET_COMPACT_MAX_WIDTH;
  const isExpandedTablet =
    isTablet && !isCompact && isLandscape && windowWidth >= TABLET_EXPANDED_MIN_WIDTH;
  const isRegularTablet = isTablet && !isCompact && !isExpandedTablet;
  const tier: DeviceLayoutTier = isCompact ? 'compact' : isExpandedTablet ? 'expanded' : 'regular';
  const sidebarWidth = isExpandedTablet ? TABLET_SIDEBAR_WIDTH : 0;
  const workAreaWidth = Math.max(1, windowWidth - sidebarWidth);
  // Only descendants of the main shell are scoped to the area beside its
  // sidebar. Pushed root-stack screens have no sidebar of their own and must
  // continue to see the full native window.
  const screenWidth = Math.max(1, viewportWidth ?? windowWidth);
  const gutter = isTablet && !isCompact ? 24 : 0;
  const paneGap = isExpandedTablet ? 20 : 16;
  const boundedWidth = Math.max(1, screenWidth - gutter * 2);
  const contentWidth = isTablet ? Math.min(screenWidth, TABLET_CONTENT_MAX_WIDTH) : screenWidth;
  const canvasWidth = isCompact
    ? screenWidth
    : Math.min(screenWidth, isExpandedTablet ? TABLET_CANVAS_MAX_WIDTH : TABLET_READABLE_MAX_WIDTH);

  return {
    tier,
    isTablet,
    isLandscape,
    isCompact,
    isRegularTablet,
    isExpandedTablet,
    windowWidth,
    windowHeight,
    screenWidth,
    screenHeight: windowHeight,
    workAreaWidth,
    sidebarWidth,
    contentWidth,
    canvasWidth,
    readableWidth: isCompact ? screenWidth : Math.min(boundedWidth, TABLET_READABLE_MAX_WIDTH),
    formWidth: isCompact ? screenWidth : Math.min(boundedWidth, TABLET_FORM_MAX_WIDTH),
    wideWidth: isCompact ? screenWidth : Math.min(boundedWidth, TABLET_WIDE_MAX_WIDTH),
    tabletPadding: isTablet ? Math.max(0, (screenWidth - contentWidth) / 2) : 0,
    gutter,
    paneGap,
    gridColumns: columnsForWidth(screenWidth),
  };
}

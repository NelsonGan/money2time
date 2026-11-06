import {
  foldSpan,
  readableColumn,
  readableColumnPadding,
  resolveAdaptiveLayout,
  SIDE_RAIL_WIDTH,
  WIDE_TAB_CONTENT_MAX_WIDTH,
  wideTabColumns,
} from '~/utils/adaptiveLayout';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

describe('resolveAdaptiveLayout', () => {
  it('keeps the bottom bar on a regular iPhone in portrait', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 402,
      height: 874,
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
    });
    expect(layout).toEqual({
      navPlacement: 'bottom',
      navEdge: 'right',
      navRailInset: 0,
      navRailAlign: 'bottom',
      isTwoPane: false,
      isWide: false,
      wideTabs: false,
      panes: null,
    });
  });

  it('keeps the bottom bar on Android, including a wide unfolded window', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'android',
      isPad: false,
      width: 900,
      height: 700,
      insets: { top: 24, right: 48, bottom: 24, left: 0 },
    });
    expect(layout.navPlacement).toBe('bottom');
    expect(layout.isTwoPane).toBe(false);
  });

  it('moves navigation into the side strip on the closed iPhone Duo', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 466,
      height: 678,
      insets: { ...NO_INSETS, right: 84 },
    });
    expect(layout).toEqual({
      navPlacement: 'side',
      navEdge: 'right',
      navRailInset: 84,
      navRailAlign: 'bottom',
      isTwoPane: false,
      isWide: false,
      wideTabs: false,
      panes: null,
    });
  });

  it('splits the open iPhone Duo into two panes with a side rail', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 951,
      height: 669,
      insets: { ...NO_INSETS, right: 84 },
    });
    expect(layout).toEqual({
      navPlacement: 'side',
      navEdge: 'right',
      navRailInset: 84,
      navRailAlign: 'bottom',
      isTwoPane: true,
      isWide: true,
      wideTabs: false,
      // Split on the fold at 475.5 pt; the rail comes out of the right pane.
      panes: { left: 475.5, right: 391.5 },
    });
  });

  it('follows the side strip to the left edge', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 951,
      height: 669,
      insets: { ...NO_INSETS, left: 84 },
    });
    expect(layout.navEdge).toBe('left');
    expect(layout.navRailInset).toBe(84);
    expect(layout.panes).toEqual({ left: 391.5, right: 475.5 });
  });

  it('reserves its own rail width when a wide window has no side strip', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 951,
      height: 669,
      insets: NO_INSETS,
    });
    expect(layout.navPlacement).toBe('side');
    expect(layout.navRailInset).toBe(SIDE_RAIL_WIDTH);
    expect(layout.isTwoPane).toBe(true);
  });

  it('keeps one pane on the open display held in portrait', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 669,
      height: 951,
      insets: { top: 84, right: 0, bottom: 95, left: 0 },
    });
    expect(layout.navPlacement).toBe('bottom');
    expect(layout.isTwoPane).toBe(false);
  });

  it('ignores a sub-bar sliver of horizontal inset', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: false,
      width: 402,
      height: 874,
      insets: { top: 62, right: 4, bottom: 34, left: 0 },
    });
    expect(layout.navPlacement).toBe('bottom');
  });
});

describe('resolveAdaptiveLayout on iPad', () => {
  const IPAD_INSETS = { top: 24, right: 0, bottom: 20, left: 0 };
  const ipad = (width: number, height: number) =>
    resolveAdaptiveLayout({ platform: 'ios', isPad: true, width, height, insets: IPAD_INSETS });

  it('puts a top-aligned rail on the leading edge and two panes on a 13-inch in landscape', () => {
    expect(ipad(1376, 1032)).toEqual({
      navPlacement: 'side',
      navEdge: 'left',
      navRailInset: SIDE_RAIL_WIDTH,
      navRailAlign: 'top',
      isTwoPane: true,
      isWide: true,
      wideTabs: true,
      // The content beside the rail, split evenly: no hinge to avoid.
      panes: { left: 646, right: 646 },
    });
  });

  it('splits a 13-inch in portrait too', () => {
    const layout = ipad(1032, 1376);
    expect(layout.isTwoPane).toBe(true);
    expect(layout.panes).toEqual({ left: 474, right: 474 });
  });

  it('keeps one pane beside the rail on an 11-inch in portrait', () => {
    const layout = ipad(834, 1210);
    expect(layout.navPlacement).toBe('side');
    expect(layout.isTwoPane).toBe(false);
    expect(layout.panes).toBeNull();
    expect(layout.isWide).toBe(true);
    expect(layout.wideTabs).toBe(true);
  });

  it('splits an iPad mini in landscape, not in portrait', () => {
    expect(ipad(1133, 744).isTwoPane).toBe(true);
    expect(ipad(744, 1133).isTwoPane).toBe(false);
  });

  it('panes always add up to the content beside the rail', () => {
    const layout = ipad(1195, 900);
    expect(layout.panes).not.toBeNull();
    expect(layout.panes!.left + layout.panes!.right).toBe(1195 - SIDE_RAIL_WIDTH);
  });

  it('falls back to the phone layout in a narrow window (Slide Over, a third of Split View)', () => {
    expect(ipad(375, 1032)).toEqual(
      resolveAdaptiveLayout({
        platform: 'ios',
        isPad: false,
        width: 375,
        height: 1032,
        insets: IPAD_INSETS,
      }),
    );
    expect(ipad(507, 1032).navPlacement).toBe('bottom');
  });

  it('keeps the rail from half of a 13-inch in Split View', () => {
    const layout = ipad(688, 1032);
    expect(layout.navPlacement).toBe('side');
    expect(layout.isTwoPane).toBe(false);
  });
});

describe('readableColumn', () => {
  it('centres a 600 pt column on the open Duo', () => {
    expect(readableColumn(867, true)).toEqual({ width: 600, margin: 133.5 });
  });

  it('never widens a narrower area', () => {
    expect(readableColumn(520, true)).toEqual({ width: 520, margin: 0 });
  });

  it('uses the whole width with one pane', () => {
    expect(readableColumn(382, false)).toEqual({ width: 382, margin: 0 });
  });
});

describe('readableColumnPadding', () => {
  it('keeps rows to a 600 pt column on a wide tablet list', () => {
    // iPad Pro 13" landscape: rows 600 wide, centred.
    expect(readableColumnPadding(1376, 20)).toBe(388);
    expect(1376 - 2 * readableColumnPadding(1376, 20)).toBe(600);
  });

  it('never goes below the list’s own padding', () => {
    expect(readableColumnPadding(640, 20)).toBe(20);
    expect(readableColumnPadding(390, 18)).toBe(18);
  });
});

describe('wideTabColumns', () => {
  it('leaves phones, the Duo and other tablets to the page', () => {
    expect(wideTabColumns(1292, false)).toEqual({ columns: 1, maxWidth: null });
  });

  it('splits a page in the open Duo’s fold frame into two columns across it', () => {
    expect(wideTabColumns(783, false, true)).toEqual({ columns: 2, maxWidth: 783 });
  });

  it('keeps the iPad rules on iPad whatever the frame says', () => {
    expect(wideTabColumns(750, true, true)).toEqual({ columns: 1, maxWidth: 600 });
  });

  it('lays out two columns beside the rail on a 13-inch iPad, both ways round', () => {
    expect(wideTabColumns(1292, true)).toEqual({
      columns: 2,
      maxWidth: WIDE_TAB_CONTENT_MAX_WIDTH,
    });
    expect(wideTabColumns(948, true).columns).toBe(2);
  });

  it('keeps one readable column on an 11-inch iPad in portrait', () => {
    expect(wideTabColumns(750, true)).toEqual({ columns: 1, maxWidth: 600 });
  });
});

describe('foldSpan', () => {
  it('centres the frame on the fold beside a right-hand rail on the open Duo', () => {
    // 951 pt window less the 84 pt rail; the fold is at 475.5 pt.
    expect(foldSpan(867, 475.5)).toEqual({ width: 783, left: 84, right: 0 });
  });

  it('mirrors it when the rail is on the left', () => {
    expect(foldSpan(867, 391.5)).toEqual({ width: 783, left: 0, right: 84 });
  });

  it('uses the whole width when the fold is in the middle', () => {
    expect(foldSpan(800, 400)).toEqual({ width: 800, left: 0, right: 0 });
  });
});

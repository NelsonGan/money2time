import {
  readableColumn,
  readableColumnPadding,
  resolveAdaptiveLayout,
  SIDE_RAIL_WIDTH,
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
      isTwoPane: false,
      panes: null,
    });
  });

  it('keeps the bottom bar on iPad, whatever its size', () => {
    const layout = resolveAdaptiveLayout({
      platform: 'ios',
      isPad: true,
      width: 1194,
      height: 834,
      insets: { top: 24, right: 0, bottom: 20, left: 0 },
    });
    expect(layout.navPlacement).toBe('bottom');
    expect(layout.isTwoPane).toBe(false);
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
      isTwoPane: false,
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
      isTwoPane: true,
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

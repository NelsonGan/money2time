import { resolveDeviceLayout } from '~/utils/deviceLayout';

describe('resolveDeviceLayout', () => {
  it('keeps an iPhone in the unchanged compact layout', () => {
    expect(
      resolveDeviceLayout({
        windowWidth: 440,
        windowHeight: 956,
        isTablet: false,
      }),
    ).toMatchObject({
      tier: 'compact',
      isCompact: true,
      isRegularTablet: false,
      isExpandedTablet: false,
      sidebarWidth: 0,
      screenWidth: 440,
      contentWidth: 440,
    });
  });

  it('uses a readable tablet canvas without a sidebar in portrait', () => {
    expect(
      resolveDeviceLayout({
        windowWidth: 1032,
        windowHeight: 1376,
        isTablet: true,
      }),
    ).toMatchObject({
      tier: 'regular',
      isCompact: false,
      isRegularTablet: true,
      isExpandedTablet: false,
      sidebarWidth: 0,
      screenWidth: 1032,
      contentWidth: 760,
      gridColumns: 4,
    });
  });

  it('reserves a sidebar and exposes the remaining work area in landscape', () => {
    expect(
      resolveDeviceLayout({
        windowWidth: 1376,
        windowHeight: 1032,
        isTablet: true,
      }),
    ).toMatchObject({
      tier: 'expanded',
      isCompact: false,
      isRegularTablet: false,
      isExpandedTablet: true,
      sidebarWidth: 224,
      screenWidth: 1152,
      contentWidth: 1040,
      gridColumns: 4,
    });
  });

  it('uses a provided child viewport without losing the expanded tier', () => {
    expect(
      resolveDeviceLayout({
        windowWidth: 1376,
        windowHeight: 1032,
        viewportWidth: 1152,
        isTablet: true,
      }),
    ).toMatchObject({
      tier: 'expanded',
      sidebarWidth: 224,
      screenWidth: 1152,
      contentWidth: 1040,
    });
  });

  it('collapses a narrow iPad multitasking window back to compact behavior', () => {
    expect(
      resolveDeviceLayout({
        windowWidth: 700,
        windowHeight: 1032,
        isTablet: true,
      }),
    ).toMatchObject({
      tier: 'compact',
      isCompact: true,
      isExpandedTablet: false,
      sidebarWidth: 0,
      screenWidth: 700,
      contentWidth: 700,
      gridColumns: 2,
    });
  });
});

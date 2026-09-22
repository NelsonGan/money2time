import {
  getCalendarYearLayout,
  getMonthToYearZoomGeometry,
} from '~/features/calendar/lib/calendarZoom';

describe('calendar month-to-year zoom geometry', () => {
  it('lays the selected month out in the matching 3-column year slot', () => {
    const layout = getCalendarYearLayout(393);
    const january = layout.monthFrames[0];
    const september = layout.monthFrames[8];

    expect(january.x).toBe(20);
    expect(january.y).toBe(36);
    expect(september.x).toBe(20 + 2 * (layout.monthWidth + 14));
    expect(september.y).toBe(36 + 2 * (layout.miniMonthHeight + 20));
  });

  it('maps the full month grid exactly onto its mini-month destination width', () => {
    const geometry = getMonthToYearZoomGeometry({
      screenWidth: 393,
      contentWidth: 393,
      monthIndex: 8,
    });

    expect(geometry.source.x * geometry.scale + geometry.translateX).toBeCloseTo(
      geometry.target.x,
      5,
    );
    expect(geometry.source.y * geometry.scale + geometry.translateY).toBeCloseTo(
      geometry.target.y,
      5,
    );
    expect(geometry.source.width * geometry.scale).toBeCloseTo(geometry.target.width, 5);
    expect(geometry.scale).toBeGreaterThan(0.2);
    expect(geometry.scale).toBeLessThan(0.4);
  });

  it('keeps geometry finite on narrow layouts', () => {
    const geometry = getMonthToYearZoomGeometry({
      screenWidth: 320,
      contentWidth: 280,
      monthIndex: 11,
    });

    expect(Object.values(geometry).flatMap((value) => Object.values(value))).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(
      [
        geometry.scale,
        geometry.translateX,
        geometry.translateY,
        geometry.target.x,
        geometry.target.y,
      ].every(Number.isFinite),
    ).toBe(true);
  });
});

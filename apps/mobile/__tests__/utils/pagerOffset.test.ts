import { pageIndexFromOffset } from '~/utils/pagerOffset';

describe('pageIndexFromOffset', () => {
  it('reads the page a settled pager is on', () => {
    expect(pageIndexFromOffset(2400 * 474, 474, 474)).toBe(2400);
  });

  it('skips a settle measured mid-resize, at a width other than the page', () => {
    // Seen on iPad: page 2400 at 600 pt, reported from a 206 pt animation
    // frame after the 375 pt page had rendered. Dividing gave page 4800.
    expect(pageIndexFromOffset(2400 * 600, 206, 375)).toBeNull();
  });

  it('tolerates sub-point rounding between the frame and the page width', () => {
    expect(pageIndexFromOffset(2400 * 646.4, 646, 646.4)).toBe(2400);
  });

  it('uses the page width when the event has no measurement', () => {
    expect(pageIndexFromOffset(1200, undefined, 400)).toBe(3);
    expect(pageIndexFromOffset(1200, 0, 400)).toBe(3);
  });

  it('rounds to the nearest page', () => {
    expect(pageIndexFromOffset(390 * 4.4, 390, 390)).toBe(4);
    expect(pageIndexFromOffset(390 * 4.6, 390, 390)).toBe(5);
  });
});

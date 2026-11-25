import {
  RECEIPT_PHOTO_MAX_EDGE,
  receiptMaxEdge,
  SCREENSHOT_MAX_EDGE,
} from '../../utils/receiptImageSize';

describe('receiptMaxEdge', () => {
  it('keeps photos of receipts at the photo cap', () => {
    expect(receiptMaxEdge({ width: 3024, height: 4032 })).toBe(RECEIPT_PHOTO_MAX_EDGE);
    expect(receiptMaxEdge({ width: 1290, height: 2796 }, 'photo')).toBe(RECEIPT_PHOTO_MAX_EDGE);
  });

  it('caps phone screenshots in screenshot scans smaller', () => {
    // iPhone 16/17 Pro Max, iPhone 15, a 20:9 Android phone, landscape too.
    expect(receiptMaxEdge({ width: 1290, height: 2796 }, 'screenshot')).toBe(SCREENSHOT_MAX_EDGE);
    expect(receiptMaxEdge({ width: 1179, height: 2556 }, 'screenshot')).toBe(SCREENSHOT_MAX_EDGE);
    expect(receiptMaxEdge({ width: 1080, height: 2400 }, 'screenshot')).toBe(SCREENSHOT_MAX_EDGE);
    expect(receiptMaxEdge({ width: 2796, height: 1290 }, 'screenshot')).toBe(SCREENSHOT_MAX_EDGE);
  });

  it('keeps the photo cap for images in the screenshot path that are not screen-shaped', () => {
    // A camera photo of a paper receipt shared to the app, and an iPad screenshot.
    expect(receiptMaxEdge({ width: 3024, height: 4032 }, 'screenshot')).toBe(
      RECEIPT_PHOTO_MAX_EDGE,
    );
    expect(receiptMaxEdge({ width: 2048, height: 2732 }, 'screenshot')).toBe(
      RECEIPT_PHOTO_MAX_EDGE,
    );
  });

  it('keeps the photo cap when the size is unknown', () => {
    expect(receiptMaxEdge({}, 'screenshot')).toBe(RECEIPT_PHOTO_MAX_EDGE);
    expect(receiptMaxEdge({ width: 0, height: 2796 }, 'screenshot')).toBe(RECEIPT_PHOTO_MAX_EDGE);
  });
});

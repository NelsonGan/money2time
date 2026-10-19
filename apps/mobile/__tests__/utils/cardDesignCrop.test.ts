import {
  cardCropPixels,
  clampZoom,
  coverScale,
  MAX_CARD_CROP_ZOOM,
  maxPan,
} from '~/utils/cardDesignCrop';

const FRAME = { width: 320, height: 200 };

describe('card design crop geometry', () => {
  it('covers the frame by the tighter side', () => {
    // A tall photo fills the width; a wide one fills the height.
    expect(coverScale(FRAME, { width: 1000, height: 2000 })).toBeCloseTo(0.32);
    expect(coverScale(FRAME, { width: 4000, height: 1000 })).toBeCloseTo(0.2);
  });

  it('keeps zoom between 1x and the maximum', () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(50)).toBe(MAX_CARD_CROP_ZOOM);
  });

  it('allows no pan along an axis the photo exactly fills', () => {
    const limit = maxPan(FRAME, { width: 1600, height: 1000 }, 1);
    expect(limit.x).toBeCloseTo(0);
    expect(limit.y).toBeCloseTo(0);
  });

  it('cuts the centred card-shaped middle of an untouched photo', () => {
    // 2000x2000 covers a 320x200 frame at 0.16: the frame sees 2000x1250.
    expect(cardCropPixels(FRAME, { width: 2000, height: 2000 }, 1, 0, 0)).toEqual({
      originX: 0,
      originY: 375,
      width: 2000,
      height: 1250,
    });
  });

  it('follows a drag, in source pixels, and a zoom', () => {
    // Dragging the photo down 40pt shows 250 source pixels nearer its top.
    expect(cardCropPixels(FRAME, { width: 2000, height: 2000 }, 1, 0, 40).originY).toBe(125);
    // At 2x the frame sees half as much, still centred.
    expect(cardCropPixels(FRAME, { width: 2000, height: 2000 }, 2, 0, 0)).toEqual({
      originX: 500,
      originY: 688,
      width: 1000,
      height: 625,
    });
  });

  it('never cuts outside the photo, however far the pan is pushed', () => {
    const crop = cardCropPixels(FRAME, { width: 2000, height: 2000 }, 1, 900, -900);
    expect(crop.originX).toBe(0);
    expect(crop.originY).toBe(750);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(2000);
  });
});

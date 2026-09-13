import {
  containedImageFrame,
  cropPixelsFromDisplayRect,
  hasCropChanged,
  moveCropRect,
  resizeCropRect,
} from '~/utils/receiptCrop';

describe('containedImageFrame', () => {
  it('centers a portrait receipt inside a wide viewport', () => {
    expect(containedImageFrame({ width: 300, height: 400 }, { width: 100, height: 200 })).toEqual({
      x: 50,
      y: 0,
      width: 200,
      height: 400,
    });
  });

  it('centers a landscape receipt inside a tall viewport', () => {
    expect(containedImageFrame({ width: 300, height: 400 }, { width: 600, height: 300 })).toEqual({
      x: 0,
      y: 125,
      width: 300,
      height: 150,
    });
  });
});

describe('resizeCropRect', () => {
  const bounds = { x: 20, y: 40, width: 200, height: 300 };

  it('moves the requested corner and keeps the opposite corner fixed', () => {
    expect(resizeCropRect(bounds, bounds, 'topLeft', 30, 50, 48)).toEqual({
      x: 50,
      y: 90,
      width: 170,
      height: 250,
    });
  });

  it('stays inside the image and preserves the minimum crop size', () => {
    expect(resizeCropRect(bounds, bounds, 'bottomRight', 500, 500, 64)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 300,
    });
    expect(resizeCropRect(bounds, bounds, 'topLeft', 500, 500, 64)).toEqual({
      x: 156,
      y: 276,
      width: 64,
      height: 64,
    });
  });

  it('moves each edge independently for freeform cropping', () => {
    const crop = { x: 60, y: 100, width: 120, height: 180 };

    expect(resizeCropRect(crop, bounds, 'top', 80, 30, 48)).toEqual({
      x: 60,
      y: 130,
      width: 120,
      height: 150,
    });
    expect(resizeCropRect(crop, bounds, 'right', 30, 80, 48)).toEqual({
      x: 60,
      y: 100,
      width: 150,
      height: 180,
    });
    expect(resizeCropRect(crop, bounds, 'bottom', 80, 30, 48)).toEqual({
      x: 60,
      y: 100,
      width: 120,
      height: 210,
    });
    expect(resizeCropRect(crop, bounds, 'left', 30, 80, 48)).toEqual({
      x: 90,
      y: 100,
      width: 90,
      height: 180,
    });
  });
});

describe('moveCropRect', () => {
  const bounds = { x: 20, y: 40, width: 200, height: 300 };
  const crop = { x: 60, y: 100, width: 120, height: 180 };

  it('moves the crop rectangle without resizing it', () => {
    expect(moveCropRect(crop, bounds, 25, 35)).toEqual({
      x: 85,
      y: 135,
      width: 120,
      height: 180,
    });
  });

  it('clamps the whole crop rectangle inside the image', () => {
    expect(moveCropRect(crop, bounds, 500, -500)).toEqual({
      x: 100,
      y: 40,
      width: 120,
      height: 180,
    });
  });
});

describe('cropPixelsFromDisplayRect', () => {
  it('maps the visible crop back to source-image pixels', () => {
    expect(
      cropPixelsFromDisplayRect(
        { width: 1200, height: 2400 },
        { x: 50, y: 0, width: 200, height: 400 },
        { x: 75, y: 40, width: 150, height: 320 },
      ),
    ).toEqual({ originX: 150, originY: 240, width: 900, height: 1920 });
  });

  it('clamps floating display coordinates to valid integer pixels', () => {
    expect(
      cropPixelsFromDisplayRect(
        { width: 101, height: 201 },
        { x: 10, y: 20, width: 100, height: 200 },
        { x: 9.4, y: 19.7, width: 102, height: 202 },
      ),
    ).toEqual({ originX: 0, originY: 0, width: 101, height: 201 });
  });
});

describe('hasCropChanged', () => {
  const full = { x: 10, y: 20, width: 100, height: 200 };

  it('ignores subpixel layout noise but notices a real crop', () => {
    expect(hasCropChanged({ ...full, x: 10.2, width: 99.8 }, full)).toBe(false);
    expect(hasCropChanged({ ...full, y: 24, height: 196 }, full)).toBe(true);
  });
});

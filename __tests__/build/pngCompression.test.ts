const sharp = require('sharp');
const { optimizePng } = require('../../scripts/lib/optimizePng.cjs');

describe('PNG compression', () => {
  it('compresses an unfiltered indexed screenshot without changing any pixel', async () => {
    // A 64x64 grayscale gradient encoded as PNG8 with the None row filter.
    const input = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAwFBMVEUAAAAEBAQICAgMDAwQEBAUFBQYGBgcHBwgICAkJCQoKCgsLCwwMDA0NDQ4ODg8PDxAQEBERERISEhMTExQUFBUVFRYWFhcXFxgYGBkZGRoaGhsbGxwcHB0dHR4eHh8fHyAgICEhISIiIiMjIyQkJCUlJSYmJicnJygoKCkpKSoqKisrKywsLC0tLS4uLi8vLzAwMDExMTIyMjMzMzQ0NDU1NTY2Njc3Nzg4ODk5OTo6Ojs7Ozw8PD09PT4+Pj8/PyNTNmZAAAAa0lEQVR42u3MBxpCYAAG4N8mlKaSkVGUrITs+9/KPXq+9wAvIRTNsBwviNJKVtT1Rtvu9ofjST9fjKtp2c7N9fzg/gij5yt+J2mWF5/yW9XNr+36YZxmggABAgQIECBAgAABAgQIECD492ABqvb4EJufFpMAAAAASUVORK5CYII=',
      'base64',
    );
    const result = await optimizePng(input);
    expect(result.buffer.length).toBeLessThan(input.length);
    expect(await sharp(result.buffer).ensureAlpha().raw().toBuffer()).toEqual(
      await sharp(input).ensureAlpha().raw().toBuffer(),
    );
  });

  it('retains dimensions and exact visible pixels in lossless mode', async () => {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0]);
    const input = await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } })
      .png()
      .toBuffer();
    const result = await optimizePng(input);
    expect(result.buffer.length).toBeLessThanOrEqual(input.length);
    const decoded = await sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(decoded.info.width).toBe(2);
    expect(decoded.info.height).toBe(2);
    expect(decoded.data).toEqual(pixels);
  });

  it('never turns fully transparent pixels into a visible surround', async () => {
    const pixels = Buffer.alloc(128 * 128 * 4);
    for (let y = 16; y < 112; y += 1) {
      for (let x = 16; x < 112; x += 1) {
        const offset = (y * 128 + x) * 4;
        pixels[offset] = x * 2;
        pixels[offset + 1] = y * 2;
        pixels[offset + 2] = 100;
        pixels[offset + 3] = 255;
      }
    }
    const input = await sharp(pixels, { raw: { width: 128, height: 128, channels: 4 } })
      .png()
      .toBuffer();
    const result = await optimizePng(input, { quantize: true, cellSize: 128, displaySize: 52 });
    const decoded = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] === 0) expect(decoded[index]).toBe(0);
    }
    expect(result.maxRmse).toBeLessThanOrEqual(3);
    expect(result.buffer.length).toBeLessThanOrEqual(input.length);
  });

  it('does not quantize an already indexed image a second time', async () => {
    const input = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#CA754C' },
    })
      .png({ palette: true })
      .toBuffer();
    const result = await optimizePng(input, { quantize: true });
    expect(result.mode).not.toBe('quantized');
    expect(await sharp(result.buffer).raw().toBuffer()).toEqual(
      await sharp(input).raw().toBuffer(),
    );
  });
});

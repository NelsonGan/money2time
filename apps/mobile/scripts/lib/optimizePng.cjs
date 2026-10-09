const sharp = require('sharp');
const { filterIndexedPng } = require('./filterIndexedPng.cjs');

async function visibleError(before, after, { cellSize, displaySize }) {
  const metadata = await sharp(before).metadata();
  const original = await sharp(before).ensureAlpha().raw().toBuffer();
  const candidate = await sharp(after).ensureAlpha().raw().toBuffer();
  for (let index = 3; index < original.length; index += 4) {
    if (original[index] === 0 && candidate[index] !== 0) return Infinity;
  }

  const cell = cellSize ?? Math.max(metadata.width, metadata.height);
  let maxRmse = 0;
  for (let top = 0; top < metadata.height; top += cell) {
    for (let left = 0; left < metadata.width; left += cell) {
      const region = {
        left,
        top,
        width: Math.min(cell, metadata.width - left),
        height: Math.min(cell, metadata.height - top),
      };
      const [a, b] = await Promise.all(
        [before, after].map((input) =>
          sharp(input)
            .extract(region)
            .resize({ width: displaySize ?? region.width })
            .ensureAlpha()
            .raw()
            .toBuffer(),
        ),
      );
      // Compare on both light and dark surfaces, including opacity changes.
      for (const background of [0, 255]) {
        let squaredError = 0;
        for (let index = 0; index < a.length; index += 4) {
          for (let channel = 0; channel < 3; channel += 1) {
            const av =
              (a[index + channel] * a[index + 3] + background * (255 - a[index + 3])) / 255;
            const bv =
              (b[index + channel] * b[index + 3] + background * (255 - b[index + 3])) / 255;
            squaredError += (av - bv) ** 2;
          }
        }
        maxRmse = Math.max(maxRmse, Math.sqrt(squaredError / (a.length * 0.75)));
      }
    }
  }
  return maxRmse;
}

async function optimizePng(input, options = {}) {
  let result = { buffer: input, mode: 'original', maxRmse: 0 };
  const indexed = input[25] === 3;
  const lossless = indexed
    ? filterIndexedPng(input)
    : await sharp(input)
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toBuffer();
  if (lossless.length < result.buffer.length && (await visibleError(input, lossless, {})) === 0) {
    result = { buffer: lossless, mode: 'lossless', maxRmse: 0 };
  }

  // Existing PNG8 art has already been quantized. Repeated palette reduction
  // accumulates quality loss, so only consider it for true-colour sources.
  if (options.quantize && !indexed) {
    const candidate = await sharp(input)
      .png({
        palette: true,
        colours: 256,
        quality: 100,
        dither: 0,
        effort: 10,
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();
    if (candidate.length < result.buffer.length) {
      const maxRmse = await visibleError(input, candidate, options);
      if (maxRmse <= 3) result = { buffer: candidate, mode: 'quantized', maxRmse };
    }
  }
  return result;
}

module.exports = { optimizePng };

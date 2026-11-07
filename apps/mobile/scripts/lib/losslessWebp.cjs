const sharp = require('sharp');

async function rgba(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** True when both decode to the same alpha everywhere and the same colour wherever a pixel is visible. */
function sameVisiblePixels(before, after) {
  if (before.width !== after.width || before.height !== after.height) return false;
  for (let index = 0; index < before.data.length; index += 4) {
    const alpha = before.data[index + 3];
    if (alpha !== after.data[index + 3]) return false;
    // iOS and Android decode into premultiplied bitmaps, where a fully
    // transparent pixel has no colour, so the encoder may change it freely.
    if (alpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      if (before.data[index + channel] !== after.data[index + channel]) return false;
    }
  }
  return true;
}

/**
 * Re-encodes an image as lossless WebP and checks it pixel for pixel. Throws
 * rather than return a file that would render differently.
 */
async function encodeLosslessWebp(input) {
  const webp = await sharp(input).webp({ lossless: true, effort: 6 }).toBuffer();
  const [before, after] = await Promise.all([rgba(input), rgba(webp)]);
  if (!sameVisiblePixels(before, after)) {
    throw new Error('Lossless WebP did not reproduce the source pixels');
  }
  return webp;
}

module.exports = { encodeLosslessWebp, sameVisiblePixels };

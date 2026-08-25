// Minimal indexed-colour PNG encoder with median-cut quantization, used by the
// subscription-logo pipeline. Brandfetch delivers true-colour art whose
// gradients make a plain RGBA PNG roughly 3x larger than the palette-indexed
// bank logos it sits beside in the picker; across a few hundred brands that is
// megabytes of app binary spent on pixels nobody can distinguish at 52pt.
//
// Same hand-rolled encoder shape as scripts/generate-app-icons.mjs (chunked
// PNG, level-9 deflate), but colour type 3 with PLTE + tRNS.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function packRgba(r, g, b, a) {
  // Fully transparent pixels differ only in their (meaningless) colour, so
  // collapse them onto one key rather than spending palette slots on them.
  if (a === 0) return 0;
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0 || 1;
}

function unpackRgba(key) {
  if (key === 0) return [0, 0, 0, 0];
  return [(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff];
}

/**
 * Median-cut over the distinct RGBA values present, weighted by pixel count so
 * a large flat field is not out-voted by a handful of antialiased rim pixels.
 * Alpha participates as a fourth axis, which keeps a logo's transparent
 * surround from being merged into its darkest colour.
 */
function buildPalette(data, maxColors) {
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = packRgba(data[i], data[i + 1], data[i + 2], data[i + 3]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const entries = [...counts.entries()].map(([key, count]) => ({ rgba: unpackRgba(key), count }));
  if (entries.length <= maxColors) return entries.map((entry) => entry.rgba);

  let boxes = [entries];
  while (boxes.length < maxColors) {
    // Split the box with the widest spread on any axis; stop early once every
    // remaining box holds a single colour.
    let target = -1;
    let targetAxis = 0;
    let targetRange = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let axis = 0; axis < 4; axis += 1) {
        let min = 255;
        let max = 0;
        for (const entry of box) {
          if (entry.rgba[axis] < min) min = entry.rgba[axis];
          if (entry.rgba[axis] > max) max = entry.rgba[axis];
        }
        if (max - min > targetRange) {
          targetRange = max - min;
          target = index;
          targetAxis = axis;
        }
      }
    });
    if (target < 0) break;

    const box = boxes[target].slice().sort((a, b) => a.rgba[targetAxis] - b.rgba[targetAxis]);
    // Cut at the weighted median so both halves carry similar pixel mass.
    const half = box.reduce((sum, entry) => sum + entry.count, 0) / 2;
    let acc = 0;
    let cut = box.length - 1;
    for (let i = 0; i < box.length - 1; i += 1) {
      acc += box[i].count;
      if (acc >= half) {
        cut = i + 1;
        break;
      }
    }
    boxes = [
      ...boxes.slice(0, target),
      box.slice(0, cut),
      box.slice(cut),
      ...boxes.slice(target + 1),
    ];
  }

  return boxes
    .filter((box) => box.length)
    .map((box) => {
      const total = box.reduce((sum, entry) => sum + entry.count, 0);
      const avg = [0, 0, 0, 0];
      for (const entry of box) {
        for (let axis = 0; axis < 4; axis += 1) avg[axis] += entry.rgba[axis] * entry.count;
      }
      return avg.map((value) => Math.round(value / total));
    });
}

/** Encodes a Jimp image as an indexed-colour PNG of at most `maxColors` entries. */
export function encodeIndexedPng(image, maxColors = 256) {
  const { width, height, data } = image.bitmap;
  const palette = buildPalette(data, maxColors);

  const cache = new Map();
  const nearest = (r, g, b, a) => {
    const key = packRgba(r, g, b, a);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const p = palette[i];
      const da = a - p[3];
      // Weight alpha heavily: changing a pixel's opacity is far more visible
      // than nudging its hue, and green carries most perceived luminance.
      let dist = da * da * 4;
      if (a > 0 || p[3] > 0) {
        const dr = r - p[0];
        const dg = g - p[1];
        const db = b - p[2];
        dist += dr * dr + dg * dg * 2 + db * db;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    cache.set(key, best);
    return best;
  };

  // Palette indices are labels, not intensities, so the byte-predicting filters
  // only add noise here: "None" compresses flat logo art best.
  const stride = width;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      raw[rowStart + 1 + x] = nearest(
        data[source],
        data[source + 1],
        data[source + 2],
        data[source + 3],
      );
    }
  }

  const plte = Buffer.alloc(palette.length * 3);
  const trns = Buffer.alloc(palette.length);
  let needsTrns = false;
  palette.forEach((p, i) => {
    plte[i * 3] = p[0];
    plte[i * 3 + 1] = p[1];
    plte[i * 3 + 2] = p[2];
    trns[i] = p[3];
    if (p[3] !== 255) needsTrns = true;
  });

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 3; // colour type: indexed
  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('PLTE', plte),
  ];
  if (needsTrns) chunks.push(pngChunk('tRNS', trns));
  chunks.push(pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

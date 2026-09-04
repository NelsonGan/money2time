// Composes the alternate app icon tiles under assets/app-icons/ from
// purpose-built whole-tile artwork in assets/app-icon-sources/.
//
//   assets/app-icon-sources/<name>.png -> assets/app-icons/<variant>/
//                                        icon-light.png    1024, cream backdrop, no alpha
//                                        icon-dark.png     1024, midnight backdrop, no alpha
//                                        icon-tinted.png   1024, greyscale on black, no alpha
//                                        foreground.png     432, transparent (Android adaptive)
//                                        monochrome.png     432, transparent (Android themed)
//                                        preview-light.png  256, cream backdrop (in-app picker)
//                                        preview-dark.png   256, midnight backdrop (in-app picker)
//
// Each transparent source is already composed at 1024px tile scale, so every
// variant uses the same identity placement. Android scales that complete tile
// into the launcher's 72/108 safe window without independently fitting the
// visible pixels; props therefore cannot move or resize the mascot.
//
// The shipped `happy` tile is NOT recropped here: its light face is the supplied
// artwork passed through untouched, because recropping it would change the icon
// every existing user already has. Its other faces come from a cut-out of that
// same complete tile (see cutOutFromBackdrop), so the identity transform lands
// it back in exactly the same place.
//
// Re-run after the pose list or the framing changes:
//   node scripts/generate-app-icons.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import Jimp from 'jimp-compact';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(REPO_ROOT, 'assets/app-icons');
const SHIPPED_TILE = path.join(REPO_ROOT, 'assets/ios/AppIcon~ios-marketing.png');
const SOURCES_DIR = path.join(REPO_ROOT, 'assets/app-icon-sources');

/**
 * The variant the shipped icon uses. Its artwork is passed through, not composed.
 * The id is deliberately not the mascot's name: it is what the DB row, the iOS
 * alternate icon and the Android activity-alias are all keyed by, so it has to
 * survive the artwork behind it being swapped for a different pose.
 */
const DEFAULT_VARIANT = { id: 'classic' };

/**
 * Mascot variants redrawn specifically for the launcher-icon canvas. Unlike
 * the old 512px pose-sheet crops, these use the same face-dominant zoom as the
 * Original icon, keep at most one identifying prop beside the face, and carry
 * no detached background decoration.
 */
const GENERATED = [
  { id: 'party', source: 'party' },
  { id: 'love', source: 'love' },
  { id: 'nice', source: 'nice' },
  { id: 'detective', source: 'detective' },
  { id: 'chill', source: 'chill' },
  { id: 'sleepy', source: 'sleepy' },
  { id: 'piggy', source: 'piggy' },
  { id: 'cards', source: 'cards' },
];

/**
 * Variants whose artwork is not a mascot pose but a whole tile, already composed
 * at tile scale: `assets/app-icon-sources/<source>.png` is a transparent cut-out
 * the size of the icon itself, so it is stamped through the identity transform
 * rather than fitted to the mascot rig's head.
 *
 * `purse` is the icon the app wore immediately before the current mascot, lifted
 * back out of git history; `assets/app-icon-sources/README.md` records where it
 * came from. It is the one alternate that is NOT Pro (see `free` in
 * `constants/appIcons.ts`): users who had it on their home screen should be able
 * to put it back without paying for the privilege.
 */
const RESTORED = [{ id: 'purse', source: 'purse' }];

const TILE = 1024;
const ANDROID_CANVAS = 432;
// An adaptive layer is 108dp but the system only ever shows the middle 72dp of
// it: the outer 18dp on each side is reserved for the launcher's parallax and
// pulse effects, and the mask is applied inside what is left. So the tile is
// composed for that 72/108 window, and the pose is left to run out into the
// reserved margin rather than stopping at it — the background layer is the same
// colour, so there is no seam wherever the mask lands.
const ANDROID_WINDOW = (ANDROID_CANVAS * 72) / 108;
const PREVIEW = 256;

const CREAM = 0xfdf0d8;
const MIDNIGHT = 0x17212e;

/**
 * Scales a complete 1024px source tile into `window` and stamps it at the
 * centre of `size`. `window` is the whole tile on iOS and the 72/108 visible
 * window on Android.
 */
function stampArtwork(tile, source, size, window = size) {
  const inset = (size - window) / 2;
  const scale = window / TILE;
  const scaled = source.clone().resize(Math.round(source.bitmap.width * scale), Jimp.AUTO);
  const offsetX = Math.round(inset);
  const offsetY = Math.round(inset);

  const srcX = Math.max(0, -offsetX);
  const srcY = Math.max(0, -offsetY);
  const destX = Math.max(0, offsetX);
  const destY = Math.max(0, offsetY);
  const width = Math.min(scaled.bitmap.width - srcX, size - destX);
  const height = Math.min(scaled.bitmap.height - srcY, size - destY);
  if (width <= 0 || height <= 0) return tile;

  return tile.composite(scaled.crop(srcX, srcY, width, height), destX, destY);
}

/** A flat backdrop with the cut-out stamped on it, as an opaque tile. */
function composeTile(cutOut, size, backdrop) {
  const tile = new Jimp(size, size, (backdrop * 0x100 + 0xff) >>> 0);
  return stampArtwork(tile, cutOut, size);
}

/**
 * The face iOS tints itself: the pose in luminance only, on black.
 *
 * iOS derives its tint from luminance, so a light field would swallow the whole
 * gradient and read as a flat chip. Black backdrop, chick lifted well clear of
 * it, and no colour left to fight the tint.
 */
function composeTinted(cutOut, size) {
  const grey = cutOut.clone().greyscale();
  grey.scan(0, 0, grey.bitmap.width, grey.bitmap.height, (x, y, idx) => {
    const data = grey.bitmap.data;
    // Stretch what is left: the chick's yellows all greyscale to a narrow band
    // around 0.75, which would render as one featureless shade under a tint.
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[idx + channel] / 255;
      data[idx + channel] = clampByte(255 * Math.min(1, Math.max(0, (value - 0.12) / 0.76)));
    }
  });
  return composeTile(grey, size, 0x000000);
}

function clampByte(value) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * Lifts the pose off a flat backdrop as a transparent cut-out. Used for the
 * shipped pose, whose only source is an already-composed tile.
 *
 * Coverage cannot be read from colour distance alone: the eye whites sit only a
 * few levels further from cream than the card's own inner shadow does, so any
 * threshold that erases the shadow also eats the eyes. The background is instead
 * taken to be the near-cream region *reachable from the tile border*, which the
 * chick encloses and the eyes are therefore not part of. Colour distance is then
 * only used to feather the one-pixel boundary band.
 */
function cutOutFromBackdrop(tile, backdrop) {
  const { width, height, data } = tile.bitmap;
  const bgR = (backdrop >> 16) & 0xff;
  const bgG = (backdrop >> 8) & 0xff;
  const bgB = backdrop & 0xff;

  const distanceAt = (index) =>
    Math.max(
      Math.abs(data[index] - bgR),
      Math.abs(data[index + 1] - bgG),
      Math.abs(data[index + 2] - bgB),
    );

  // Flood the near-backdrop region inward from every border pixel.
  const OUTSIDE_TOLERANCE = 70;
  const outside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (outside[pixel]) return;
    if (distanceAt(pixel * 4) > OUTSIDE_TOLERANCE) return;
    outside[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = (pixel - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  const out = tile.clone();
  out.scan(0, 0, width, height, (x, y, idx) => {
    const pixel = y * width + x;
    const target = out.bitmap.data;
    if (!outside[pixel]) {
      target[idx + 3] = 255;
      return;
    }
    const coverage = Math.min(1, Math.max(0, (distanceAt(idx) - 20) / 50));
    if (coverage <= 0) {
      target[idx + 3] = 0;
      return;
    }
    // Un-blend the pixel back to the chick's own colour so the cut-out edge does
    // not carry a cream fringe onto a dark background.
    target[idx] = clampByte(bgR + (target[idx] - bgR) / coverage);
    target[idx + 1] = clampByte(bgG + (target[idx + 1] - bgG) / coverage);
    target[idx + 2] = clampByte(bgB + (target[idx + 2] - bgB) / coverage);
    target[idx + 3] = Math.round(coverage * 255);
  });
  return out;
}

/**
 * The Android themed-icon layer: the pose as a solid shape with facial detail
 * knocked out. The system tints by alpha alone, so a straight silhouette would
 * render as a featureless blob. Bright eye whites become holes while dark marks
 * drawn directly on the yellow face (closed eyes, winks, mouths and glasses)
 * become holes too. Dark pupils enclosed by a bright eye stay solid.
 */
function toMonochrome(foreground, knockOutDarkDetails = false) {
  const out = foreground.clone();
  const { width, height, data } = out.bitmap;

  // Preserve the exact legacy conversion for Original and Purse. Their shipped
  // themed layers only knock out whites; changing them would be an unrelated
  // visual update to icons that were not redrawn in this pass.
  if (!knockOutDarkDetails) {
    out.scan(0, 0, width, height, (x, y, idx) => {
      const luminance = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      const knockout = Math.min(1, Math.max(0, (luminance - 0.86) / 0.08));
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = Math.round(data[idx + 3] * (1 - knockout));
    });
    return out;
  }

  const pixels = width * height;
  const dark = new Uint8Array(pixels);
  const visited = new Uint8Array(pixels);
  const darkKnockout = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const component = [];

  const luminanceAt = (pixel) => {
    const idx = pixel * 4;
    return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
  };

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (data[pixel * 4 + 3] > 0 && luminanceAt(pixel) < 0.32) dark[pixel] = 1;
  }

  for (let start = 0; start < pixels; start += 1) {
    if (!dark[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    let brightBoundary = 0;
    let boundary = 0;
    component.length = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      component.push(pixel);
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];

      for (const neighbour of neighbours) {
        if (neighbour < 0) continue;
        if (dark[neighbour]) {
          if (!visited[neighbour]) {
            visited[neighbour] = 1;
            queue[tail] = neighbour;
            tail += 1;
          }
          continue;
        }
        if (data[neighbour * 4 + 3] === 0) continue;
        boundary += 1;
        if (luminanceAt(neighbour) > 0.86) brightBoundary += 1;
      }
    }

    // A pupil is mostly enclosed by its white eye; other dark components sit
    // directly on coloured artwork and need to become transparent detail.
    if (boundary > 0 && brightBoundary / boundary < 0.35) {
      for (const pixel of component) darkKnockout[pixel] = 1;
    }
  }

  out.scan(0, 0, width, height, (x, y, idx) => {
    const pixel = y * width + x;
    const luminance = luminanceAt(pixel);
    const lightKnockout = Math.min(1, Math.max(0, (luminance - 0.86) / 0.08));
    const knockout = Math.max(lightKnockout, darkKnockout[pixel]);
    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = Math.round(data[idx + 3] * (1 - knockout));
  });
  return out;
}

// --- PNG output -------------------------------------------------------------
// Written here rather than through jimp because jimp's own encoder mangles the
// scanlines of a 3-channel (alpha-free) PNG, and the App Store rejects an icon
// that carries an alpha channel, so the opaque tiles have to be 3-channel.

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
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1)
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Encodes a jimp bitmap as a PNG, dropping the alpha channel when `withAlpha` is false. */
function encodePng(image, withAlpha) {
  const { width, height, data } = image.bitmap;
  const channels = withAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 4; // Paeth: flat artwork filters down to long runs of zeroes.
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      for (let channel = 0; channel < channels; channel += 1) {
        const value = data[source + channel];
        const left = x > 0 ? data[source - 4 + channel] : 0;
        const up = y > 0 ? data[source - width * 4 + channel] : 0;
        const upLeft = x > 0 && y > 0 ? data[source - width * 4 - 4 + channel] : 0;
        raw[rowStart + 1 + x * channels + channel] = (value - paeth(left, up, upLeft)) & 0xff;
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = withAlpha ? 6 : 2; // colour type: RGBA / RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writeVariant(variantId, faces) {
  const dir = path.join(ICONS_DIR, variantId);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, face] of Object.entries(faces)) {
    await fs.writeFile(path.join(dir, `${name}.png`), encodePng(face.image, face.withAlpha));
  }
}

/** Every face a variant ships, composed from one transparent cut-out of the pose. */
function buildFaces(
  cutOut,
  lightTile = composeTile(cutOut, TILE, CREAM),
  knockOutDarkDetails = false,
) {
  const foreground = new Jimp(ANDROID_CANVAS, ANDROID_CANVAS, 0x00000000);
  stampArtwork(foreground, cutOut, ANDROID_CANVAS, ANDROID_WINDOW);

  const darkTile = composeTile(cutOut, TILE, MIDNIGHT);

  return {
    'icon-light': { image: lightTile, withAlpha: false },
    'icon-dark': { image: darkTile, withAlpha: false },
    'icon-tinted': { image: composeTinted(cutOut, TILE), withAlpha: false },
    foreground: { image: foreground, withAlpha: true },
    monochrome: { image: toMonochrome(foreground, knockOutDarkDetails), withAlpha: true },
    'preview-light': { image: lightTile.clone().resize(PREVIEW, PREVIEW), withAlpha: false },
    'preview-dark': { image: darkTile.clone().resize(PREVIEW, PREVIEW), withAlpha: false },
  };
}

/** Drops variant folders that are no longer in the list, so a rename leaves nothing behind. */
async function pruneStaleVariants(keep) {
  const entries = await fs.readdir(ICONS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    await fs.rm(path.join(ICONS_DIR, entry.name), { recursive: true, force: true });
    console.log(`Removed stale variant ${entry.name}`);
  }
}

async function main() {
  await pruneStaleVariants(
    new Set([DEFAULT_VARIANT.id, ...GENERATED.map((v) => v.id), ...RESTORED.map((v) => v.id)]),
  );

  // The shipped variant. Its light face is the supplied tile, passed through
  // untouched; every other face is composed from a cut-out of it, which lands in
  // exactly the same place because it uses the same complete-tile transform.
  const shipped = await Jimp.read(SHIPPED_TILE);
  await writeVariant(DEFAULT_VARIANT.id, buildFaces(cutOutFromBackdrop(shipped, CREAM), shipped));
  console.log(`Composed ${DEFAULT_VARIANT.id} (shipped artwork)`);

  for (const variant of GENERATED) {
    // Purpose-built transparent art already occupies a complete 1024px tile.
    const art = await Jimp.read(path.join(SOURCES_DIR, `${variant.source}.png`));
    await writeVariant(variant.id, buildFaces(art, undefined, true));
    console.log(`Composed ${variant.id} (generated ${variant.source})`);
  }

  for (const variant of RESTORED) {
    // Already a transparent cut-out at tile scale, so it needs neither a
    // backdrop lifted off it nor the mascot rig's framing.
    const art = await Jimp.read(path.join(SOURCES_DIR, `${variant.source}.png`));
    await writeVariant(variant.id, buildFaces(art));
    console.log(`Composed ${variant.id} (restored ${variant.source})`);
  }

  const total = GENERATED.length + RESTORED.length + 1;
  console.log(`\n${total} icon variants written to assets/app-icons/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

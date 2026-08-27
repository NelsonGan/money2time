// Turns raw simulator captures into the annotated tutorial art under
// `assets/tutorials/`.
//
//   <raw capture>.png  +  marker spec  ->  assets/tutorials/<name>.png
//
// The marker spec is `scripts/data/tutorial-shots.json`: one entry per image,
// naming the raw capture and the red marks to draw on it. Marks are stored in
// NORMALISED coordinates (0..1 of the capture's width/height) because that is
// what `argent`'s `describe` reports for an element's frame, so a mark can be
// taken straight from the accessibility tree instead of eyeballed off a
// screenshot, and it survives a recapture on a different device size.
//
// Raw captures are deliberately NOT committed: at full device resolution they
// are ~1MB each and there are well over a hundred. The committed artefact is
// the annotated, downscaled PNG plus this spec, which is enough to redraw the
// same marks over a fresh capture.
//
// A `source` of `RAW/<file>` resolves against `TUTORIAL_RAW_DIR` (default
// `.tutorial-raw/`, gitignored), so the spec stays machine independent. The raw
// file name is the one the capture was taken under and does not have to match
// the id: renumbering a tutorial's steps renames the output, not the capture.
//
//   node scripts/annotate-tutorials.mjs                  # all entries
//   node scripts/annotate-tutorials.mjs log-an-expense   # only ids with this prefix
//
// Re-run whenever the spec or a raw capture changes.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp-compact';

import { encodeIndexedPng } from './lib/pngQuantize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(ROOT, 'scripts/data/tutorial-shots.json');
const OUT_DIR = path.join(ROOT, 'assets/tutorials');
/** Where `RAW/<file>` sources are looked up. Not committed, see the header. */
const RAW_DIR = path.resolve(ROOT, process.env.TUTORIAL_RAW_DIR ?? '.tutorial-raw');

/**
 * Palette size for the output. A screenshot of a flat UI quantizes almost
 * losslessly, and true-colour would be ~3.5x the bytes across 140-odd frames.
 * The whole set rides the native binary (it is deliberately kept out of
 * `expo.updates.assetPatternsToBeBundled` so it does not eat the 1000-asset OTA
 * cap), so those bytes are app download size.
 */
const PALETTE_COLORS = 256;

/** Marker red. Bright enough to survive the downscale on a dark screenshot. */
const RED = 0xff2f3aff;
/** Output width. Matches the existing assets/autolog frames. */
const OUT_WIDTH = 820;
/** Stroke and corner radius as a fraction of the output width. */
const STROKE_RATIO = 0.0075;
const RADIUS_RATIO = 0.022;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Paints one pixel, ignoring anything that lands outside the canvas. */
function plot(image, x, y, colour) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.bitmap.width || py >= image.bitmap.height) return;
  image.setPixelColor(colour, px, py);
}

/** Filled disc, used as the pen tip so strokes join without gaps. */
function stamp(image, cx, cy, radius, colour) {
  const r = Math.max(0.5, radius);
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
      if (dx * dx + dy * dy <= r * r) plot(image, cx + dx, cy + dy, colour);
    }
  }
}

/** Straight stroke drawn by stamping the pen along the segment. */
function strokeLine(image, x1, y1, x2, y2, width, colour) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    stamp(image, x1 + dx * t, y1 + dy * t, width / 2, colour);
  }
}

/**
 * Rounded-rectangle outline. The corners are quarter arcs rather than mitres,
 * which is what the control it is circling looks like, so the mark reads as
 * tracing the button instead of boxing it in.
 */
function strokeRoundedRect(image, x, y, w, h, radius, width, colour) {
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  strokeLine(image, x + r, y, x + w - r, y, width, colour);
  strokeLine(image, x + r, y + h, x + w - r, y + h, width, colour);
  strokeLine(image, x, y + r, x, y + h - r, width, colour);
  strokeLine(image, x + w, y + r, x + w, y + h - r, width, colour);

  const corners = [
    [x + r, y + r, Math.PI, 1.5 * Math.PI],
    [x + w - r, y + r, 1.5 * Math.PI, 2 * Math.PI],
    [x + w - r, y + h - r, 0, 0.5 * Math.PI],
    [x + r, y + h - r, 0.5 * Math.PI, Math.PI],
  ];
  for (const [cx, cy, from, to] of corners) {
    const steps = Math.max(6, Math.ceil(r));
    for (let i = 0; i <= steps; i += 1) {
      const angle = from + ((to - from) * i) / steps;
      stamp(image, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, width / 2, colour);
    }
  }
}

/** Ellipse outline inscribed in the given box. */
function strokeEllipse(image, x, y, w, h, width, colour) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const steps = Math.max(48, Math.ceil((rx + ry) * 2));
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    stamp(image, cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry, width / 2, colour);
  }
}

/** Straight arrow with a solid head at the second point. */
function strokeArrow(image, x1, y1, x2, y2, width, colour) {
  strokeLine(image, x1, y1, x2, y2, width, colour);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = width * 3.2;
  for (const spread of [Math.PI * 0.82, -Math.PI * 0.82]) {
    strokeLine(
      image,
      x2,
      y2,
      x2 + Math.cos(angle + spread) * head,
      y2 + Math.sin(angle + spread) * head,
      width,
      colour,
    );
  }
}

async function annotate(id, entry) {
  const sourcePath = entry.source.startsWith('RAW/')
    ? path.join(RAW_DIR, entry.source.slice(4))
    : path.resolve(ROOT, entry.source);
  const image = await Jimp.read(sourcePath);

  // Scale first, then draw, so the stroke stays the same visual weight on every
  // image regardless of what device the capture came off.
  image.resize(OUT_WIDTH, Jimp.AUTO);
  const { width, height } = image.bitmap;
  const stroke = Math.max(3, Math.round(width * STROKE_RATIO));

  for (const mark of entry.marks ?? []) {
    const x = (mark.x ?? 0) * width;
    const y = (mark.y ?? 0) * height;
    const w = (mark.w ?? 0) * width;
    const h = (mark.h ?? 0) * height;
    // Breathing room so the mark sits just outside the control, not on top of
    // its label.
    const pad = mark.pad === undefined ? stroke * 1.6 : mark.pad * width;

    if (mark.type === 'circle') {
      strokeEllipse(image, x - pad, y - pad, w + pad * 2, h + pad * 2, stroke, RED);
    } else if (mark.type === 'arrow') {
      strokeArrow(image, x, y, (mark.x2 ?? 0) * width, (mark.y2 ?? 0) * height, stroke, RED);
    } else {
      const radius = (mark.radius ?? RADIUS_RATIO) * width;
      strokeRoundedRect(image, x - pad, y - pad, w + pad * 2, h + pad * 2, radius, stroke, RED);
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const encoded = encodeIndexedPng(image, PALETTE_COLORS);
  await fs.writeFile(path.join(OUT_DIR, `${id}.png`), encoded);
  return { id, width, height, marks: (entry.marks ?? []).length, bytes: encoded.length };
}

async function main() {
  const filters = process.argv.slice(2);
  const spec = JSON.parse(await fs.readFile(SPEC_PATH, 'utf8'));
  const ids = Object.keys(spec)
    .filter((id) => filters.length === 0 || filters.some((prefix) => id.startsWith(prefix)))
    .sort();

  if (ids.length === 0) {
    console.warn(`No tutorial shots matched ${filters.join(', ') || '(all)'}`);
    return;
  }

  const missing = [];
  for (const id of ids) {
    try {
      const result = await annotate(id, spec[id]);
      console.warn(
        `${result.id}  ${result.width}x${result.height}  ${result.marks} mark(s)  ${Math.round(
          result.bytes / 1024,
        )}KB`,
      );
    } catch (error) {
      missing.push(`${id}: ${error.message}`);
    }
  }

  if (missing.length > 0) {
    console.error(`\n${missing.length} shot(s) failed:`);
    for (const line of missing) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

await main();

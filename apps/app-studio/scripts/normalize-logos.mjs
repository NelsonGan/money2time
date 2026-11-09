// Normalize every logo onto a uniform SIZE x SIZE canvas, centered and filling
// the canvas edge-to-edge.
//
// The app renders logos with resizeMode="contain" inside a rounded box, so any
// transparent margin baked into the PNG shows up as a shrunken logo floating in
// its tile. To avoid that we trim the transparent border, then scale the actual
// content so its long edge is SIZE. Brandfetch serves some icons below SIZE
// (their CDN does not upscale), which is why enlarging has to be allowed.
//
//   node scripts/normalize-logos.mjs           # all folders
//   node scripts/normalize-logos.mjs taiwan    # one country folder
//
// Aspect ratio is always preserved and content is never cropped. Enlargement is
// capped at MAX_UPSCALE so a tiny favicon is left alone rather than smeared
// across the canvas. Idempotent: logos already filling a SIZE x SIZE canvas are
// skipped, so re-runs do not re-encode the whole set.
//
// Uses sharp (a dependency of this repo) rather than an ImageMagick binary, so
// it runs anywhere `npm install` has.

import { readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "logos");
const SIZE = 256;
const MAX_UPSCALE = 2;
// Content within this much of the canvas edge counts as already filling it —
// keeps re-runs from re-encoding over a rounding error.
const FILL_EPSILON = 0.98;
// Alpha at or below this is treated as transparent padding.
const ALPHA_FLOOR = 8;

const only = process.argv.slice(2);

const files = [];
for (const folder of readdirSync(OUT)) {
  if (only.length && !only.includes(folder)) continue;
  const dir = join(OUT, folder);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith(".png")) files.push(join(dir, f));
}

/** Bounding box of the non-transparent pixels, or null for a fully blank image. */
async function contentBox(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

let scaled = 0;
let skipped = 0;
const tooSmall = [];

for (const file of files) {
  const meta = await sharp(file).metadata();
  const box = await contentBox(file);
  if (!box) {
    console.warn(`  ! ${relative(OUT, file)} is fully transparent — left alone`);
    skipped++;
    continue;
  }

  const longEdge = Math.max(box.width, box.height);
  const fills = meta.width === SIZE && meta.height === SIZE && longEdge / SIZE >= FILL_EPSILON;
  if (fills) {
    skipped++;
    continue;
  }

  if (SIZE / longEdge > MAX_UPSCALE) {
    tooSmall.push(`${relative(OUT, file)} (content ${box.width}x${box.height})`);
    skipped++;
    continue;
  }

  const out = await sharp(file)
    .extract(box)
    // fit:"contain" preserves aspect ratio and pads the short edge, so the long
    // edge lands exactly on SIZE and the content is centered.
    .resize(SIZE, SIZE, {
      fit: "contain",
      position: "center",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ palette: true })
    .toBuffer();
  await sharp(out).toFile(file);
  scaled++;
}

console.log(
  `normalized ${scaled} logos to fill a ${SIZE}x${SIZE} canvas; ${skipped} already filled or skipped`,
);
if (tooSmall.length) {
  console.log(`\n${tooSmall.length} left padded (would need >${MAX_UPSCALE}x upscale):`);
  for (const f of tooSmall) console.log("  - " + f);
}

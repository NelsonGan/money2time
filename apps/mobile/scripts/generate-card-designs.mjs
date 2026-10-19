// Generates the bundled card-design registry from the artwork under
// assets/card-designs/. Emits constants/cardDesigns.generated.ts.
//
// Layout is the source of truth:
//
//   assets/card-designs/<genre>/<name>.webp
//
// The genre folder must be one of CARD_DESIGN_GENRES in constants/cardDesigns.ts
// (the order and labels live there), and `<genre>/<name>` is the id stored on
// `accounts.card_design`. Ids are persisted, so never rename a file that has
// shipped.
//
// Legibility is measured here rather than eyeballed. Text only ever sits in two
// places on an artwork card: the name and balance row along the top (the part
// that peeks out of a stack), and the details under it when the card is open,
// which sit on a frosted sheet of their own. So the artwork itself only has to
// carry the top row, and for every design this script works out:
//
//   textTone  'light' (white text) or 'dark' (near-black text), whichever
//             needs the lighter band;
//   scrim     the strength of the band behind the top row (black under light
//             text, white under dark text): the least that brings 98% of the
//             artwork's upper half, barely blurred so a busy motif still
//             counts, to WCAG AA contrast (4.5:1). Contrast alone passes a
//             pale pattern (dark text on cream terrazzo) that is still too
//             busy to read through, so the band also never drops below a
//             floor that rises with the art's edge energy: MIN_SCRIM on calm
//             art, up to MAX_BUSY_SCRIM on the busiest (houndstooth).
//
// The band fades out below the row, so the rest of a closed card (which holds
// no text) shows the artwork at full strength.
//
// New artwork arrives as PNGs (the codex-imagegen skill writes 1536x1024).
// Import them first, which centre-crops to the 16:10 card shape and encodes a
// 960x600 WebP within a ~110 KB budget, then regenerate:
//
//   node scripts/generate-card-designs.mjs --import <dir-of-genre__name.png>
//   node scripts/generate-card-designs.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = path.join(ROOT, 'assets', 'card-designs');
const OUT_FILE = path.join(ROOT, 'constants', 'cardDesigns.generated.ts');

const WIDTH = 960;
const HEIGHT = 600;
const MAX_QUALITY = 80;
const MIN_QUALITY = 56;
const QUALITY_STEP = 8;
const SIZE_BUDGET_BYTES = 110 * 1024;
const TARGET_CONTRAST = 4.5;
// The share of the band allowed to fall short of the target: specks finer
// than a stroke of a letter.
const PERCENTILE = 0.02;
const MIN_SCRIM = 0.2;
const MAX_BUSY_SCRIM = 0.72;
// Edge energy (mean neighbour difference in sqrt-luminance) below which art
// counts as calm, and how fast the floor climbs above it. Calibrated on the
// bundled set, which runs from ~0.001 (graphite) to ~0.035 (sakura street).
const CALM_EDGE_ENERGY = 0.006;
const BUSY_SCRIM_PER_EDGE = 18;
const MAX_SCRIM = 0.8;
const SCRIM_STEP = 0.02;

const ID_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function linear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(r, g, b) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The PERCENTILE-th worst contrast of `textLum` over the pixels after a wash. */
function percentileContrast(pixels, textLum, washValue, alpha) {
  const values = new Float64Array(pixels.length / 3);
  for (let i = 0, p = 0; i < pixels.length; i += 3, p += 1) {
    const mix = (c) => c * (1 - alpha) + washValue * alpha;
    values[p] = contrast(
      textLum,
      luminance(mix(pixels[i]), mix(pixels[i + 1]), mix(pixels[i + 2])),
    );
  }
  values.sort();
  return values[Math.floor(values.length * PERCENTILE)];
}

/** How busy the art is at letter scale: mean neighbour difference. */
function edgeEnergy(pixels, width, height) {
  const perceptual = new Float64Array(width * height);
  for (let i = 0, p = 0; i < pixels.length; i += 3, p += 1) {
    perceptual[p] = Math.sqrt(luminance(pixels[i], pixels[i + 1], pixels[i + 2]));
  }
  let total = 0;
  let count = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = y * width + x;
      total += Math.abs(perceptual[i] - perceptual[i + 1]);
      total += Math.abs(perceptual[i] - perceptual[i + width]);
      count += 2;
    }
  }
  return total / count;
}

async function busyFloor(file) {
  const { data, info } = await sharp(file)
    .resize(384, 240, { fit: 'fill' })
    .extract({ left: 0, top: 0, width: 384, height: 120 })
    .blur(0.8)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const energy = edgeEnergy(data, info.width, info.height);
  const floor = MIN_SCRIM + Math.max(0, energy - CALM_EDGE_ENERGY) * BUSY_SCRIM_PER_EDGE;
  return Math.round(Math.min(MAX_BUSY_SCRIM, floor) * 50) / 50;
}

async function measure(file) {
  const floor = await busyFloor(file);
  // The upper half, which is where the top row lands however tall the card
  // is drawn (it is cover-fitted and centred). Only lightly blurred: film
  // grain does not decide whether a word reads, but a strawberry does.
  const { data } = await sharp(file)
    .resize(192, 120, { fit: 'fill' })
    .extract({ left: 0, top: 0, width: 192, height: 60 })
    .blur(0.6)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const options = [
    { textTone: 'light', textLum: 1, washValue: 0 },
    { textTone: 'dark', textLum: luminance(0x1a, 0x1a, 0x1a), washValue: 255 },
  ].map((option) => {
    let scrim = floor;
    let achieved = percentileContrast(data, option.textLum, option.washValue, scrim);
    while (achieved < TARGET_CONTRAST && scrim < MAX_SCRIM) {
      scrim = Math.round((scrim + SCRIM_STEP) * 100) / 100;
      achieved = percentileContrast(data, option.textLum, option.washValue, scrim);
    }
    return { ...option, scrim, achieved };
  });
  // Least veil wins; on a tie, the tone that reads better unveiled.
  options.sort((a, b) => a.scrim - b.scrim || b.achieved - a.achieved);
  const best = options[0];
  return { textTone: best.textTone, scrim: best.scrim, contrast: best.achieved };
}

async function importArtwork(sourceDir) {
  const entries = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.png'));
  for (const name of entries) {
    const [genre, design] = name.replace(/\.png$/, '').split('__');
    if (!genre || !design || !ID_SEGMENT.test(genre) || !ID_SEGMENT.test(design)) {
      throw new Error(`Expected <genre>__<name>.png, got ${name}`);
    }
    const outDir = path.join(ASSET_DIR, genre);
    await fs.mkdir(outDir, { recursive: true });
    const resized = await sharp(path.join(sourceDir, name))
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .toBuffer();
    // Fine textures (glitter, denim, houndstooth) compress poorly, so step the
    // quality down until the file fits the budget; at card size the loss does
    // not show, and every design ships in the binary.
    let quality = MAX_QUALITY;
    let encoded = await sharp(resized).webp({ quality, effort: 6 }).toBuffer();
    while (encoded.length > SIZE_BUDGET_BYTES && quality > MIN_QUALITY) {
      quality -= QUALITY_STEP;
      encoded = await sharp(resized).webp({ quality, effort: 6 }).toBuffer();
    }
    await fs.writeFile(path.join(outDir, `${design}.webp`), encoded);
    console.log(
      `imported ${genre}/${design} (q${quality}, ${Math.round(encoded.length / 1024)} KB)`,
    );
  }
}

async function generate() {
  const genres = (await fs.readdir(ASSET_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = [];
  for (const genre of genres) {
    const files = (await fs.readdir(path.join(ASSET_DIR, genre)))
      .filter((name) => name.endsWith('.webp'))
      .sort();
    for (const file of files) {
      const name = file.replace(/\.webp$/, '');
      if (!ID_SEGMENT.test(genre) || !ID_SEGMENT.test(name)) {
        throw new Error(`Card design ids must be kebab-case: ${genre}/${name}`);
      }
      const result = await measure(path.join(ASSET_DIR, genre, file));
      rows.push({ id: `${genre}/${name}`, genre, file: `${genre}/${file}`, ...result });
      console.log(
        `${genre}/${name}: ${result.textTone} text, scrim ${result.scrim}, ${result.contrast.toFixed(2)}:1`,
      );
    }
  }

  const body = rows
    .map(
      (row) =>
        `  {\n    id: '${row.id}',\n    genre: '${row.genre}',\n    source: require('../assets/card-designs/${row.file}'),\n    textTone: '${row.textTone}',\n    scrim: ${row.scrim},\n  },`,
    )
    .join('\n');
  const out = `// AUTO-GENERATED by scripts/generate-card-designs.mjs. Do not edit by hand.
// Re-run after adding or replacing artwork under assets/card-designs/.
import type { CardDesignTemplate } from './cardDesigns';

export const CARD_DESIGN_TEMPLATES: readonly CardDesignTemplate[] = [
${body}
];
`;
  await fs.writeFile(OUT_FILE, out);
  console.log(`wrote ${rows.length} designs to ${path.relative(ROOT, OUT_FILE)}`);
}

const importIndex = process.argv.indexOf('--import');
if (importIndex !== -1) {
  const dir = process.argv[importIndex + 1];
  if (!dir) throw new Error('--import needs a directory');
  await importArtwork(path.resolve(dir));
} else {
  await generate();
}

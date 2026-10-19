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
// Legibility is measured here rather than eyeballed. The card draws its name,
// balance and chips straight on the artwork, so for every design this script
// works out:
//
//   textTone  'light' (white text) or 'dark' (near-black text), whichever
//             reads better over the artwork as it is;
//   scrim     the smallest uniform wash (black under light text, white under
//             dark text) that brings 95% of the card, blurred to the scale of
//             a glyph, to WCAG AA contrast (4.5:1) against that text.
//
// The card renders exactly that wash, so a busy design gets just enough of a
// veil and a calm one keeps its colour.
//
// New artwork arrives as PNGs (the codex-imagegen skill writes 1536x1024).
// Import them first, which centre-crops to the 16:10 card shape and encodes a
// 960x600 WebP, then regenerate:
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
const TARGET_CONTRAST = 4.5;
// The share of the card allowed to fall short of the target (detail too fine
// to sit under a whole glyph).
const PERCENTILE = 0.05;
const MAX_SCRIM = 0.7;
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

async function measure(file) {
  // Down-sampled and blurred to roughly glyph scale: film grain and specks
  // below the size of a letter do not decide whether a word can be read.
  const { data } = await sharp(file)
    .resize(192, 120, { fit: 'fill' })
    .blur(1.2)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const options = [
    { textTone: 'light', textLum: 1, washValue: 0 },
    { textTone: 'dark', textLum: luminance(0x1a, 0x1a, 0x1a), washValue: 255 },
  ].map((option) => {
    let scrim = 0;
    let achieved = percentileContrast(data, option.textLum, option.washValue, 0);
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
    await sharp(path.join(sourceDir, name))
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80, effort: 6 })
      .toFile(path.join(outDir, `${design}.webp`));
    console.log(`imported ${genre}/${design}`);
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

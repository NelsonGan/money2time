// Renders every eval case to the image the app would upload and writes
// dataset/generated/manifest.json (cases + answer keys + image hashes).
//
//   node evals/receipt-scanner/build-dataset.mjs          # build if stale
//   node evals/receipt-scanner/build-dataset.mjs --force  # always rebuild
//   node evals/receipt-scanner/build-dataset.mjs --list   # print the case table
//
// The run script calls this itself, so running it by hand is only needed to
// look at the images (dataset/generated/*.jpg) or the case list. Generated
// files are gitignored: the sources here are the dataset, and they rebuild
// byte-identically.
//
// Real photos: drop `<name>.jpg|png|webp|heic` plus `<name>.json` into
// dataset/real/ (gitignored, so private receipts never get committed). The
// JSON is a case without `image` (see dataset/real/README.md); it is
// downscaled exactly like the synthetic ones.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { HAND_WRITTEN_CASES } from './dataset/cases.mjs';
import { proceduralCases } from './dataset/procedural.mjs';
import { computeReceipt, receiptSvg } from './dataset/receipt.mjs';
import { REFERENCE_DATE } from './dataset/reference.mjs';
import { composePhoto, composeScreen } from './dataset/scene.mjs';
import { SCREEN_TEMPLATES } from './dataset/screen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATASET_DIR = path.join(HERE, 'dataset');
export const GENERATED_DIR = path.join(DATASET_DIR, 'generated');
const REAL_DIR = path.join(DATASET_DIR, 'real');
export const MANIFEST_PATH = path.join(GENERATED_DIR, 'manifest.json');

/** Hash of everything that shapes the dataset, so a stale build is detected. */
function sourceHash() {
  const h = createHash('sha256');
  const files = [
    'build-dataset.mjs',
    ...readdirSync(DATASET_DIR)
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => `dataset/${f}`),
  ];
  for (const f of files.sort()) h.update(readFileSync(path.join(HERE, f)));
  if (existsSync(REAL_DIR)) {
    for (const f of readdirSync(REAL_DIR).sort()) {
      if (f === 'README.md') continue;
      h.update(f);
      h.update(readFileSync(path.join(REAL_DIR, f)));
    }
  }
  return h.digest('hex').slice(0, 16);
}

async function renderCase(c) {
  if (c.image.type === 'receipts') {
    const pieces = c.image.receipts.map((spec) => receiptSvg(spec, computeReceipt(spec)));
    return composePhoto(pieces, c.image.scene, c.id);
  }
  if (c.image.type === 'paper') return composePhoto([{ svg: c.image.svg }], c.image.scene, c.id);
  if (c.image.type === 'screen')
    return composeScreen(SCREEN_TEMPLATES[c.image.template](c.image.data));
  throw new Error(`${c.id}: unknown image type ${c.image.type}`);
}

function realCases() {
  if (!existsSync(REAL_DIR)) return [];
  return readdirSync(REAL_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const c = JSON.parse(readFileSync(path.join(REAL_DIR, f), 'utf8'));
      const base = f.replace(/\.json$/, '');
      const imageFile = readdirSync(REAL_DIR).find(
        (g) => g.startsWith(`${base}.`) && /\.(jpe?g|png|webp|heic)$/i.test(g),
      );
      if (!imageFile)
        throw new Error(`dataset/real/${f}: no image named ${base}.<jpg|png|webp|heic>`);
      return {
        difficulty: 'real',
        notes: '',
        ...c,
        id: c.id ?? `real-${base}`,
        // A real receipt is judged against its own "today", or the Worker's date
        // clamp would reset every date after REFERENCE_DATE.
        referenceDate:
          c.referenceDate ??
          c.expect?.transactions?.find((t) => t.date)?.date ??
          new Date().toISOString().slice(0, 10),
        tags: ['real', ...(c.tags ?? [])],
        image: { type: 'file', file: imageFile },
      };
    });
}

function validate(cases) {
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
    if (!['quick', 'itemized', 'screenshot'].includes(c.mode))
      throw new Error(`${c.id}: bad mode ${c.mode}`);
    if (!c.input?.currency || !Array.isArray(c.input.categories))
      throw new Error(`${c.id}: input needs currency + categories`);
    for (const t of c.expect?.transactions ?? []) {
      for (const cat of t.category ?? []) {
        if (!c.input.categories.includes(cat))
          throw new Error(`${c.id}: expected category "${cat}" is not in the case's category list`);
      }
      if (!(t.amount > 0)) throw new Error(`${c.id}: expected amount must be positive`);
      if (c.mode === 'screenshot' && typeof t.account !== 'string') {
        throw new Error(
          `${c.id}: screenshot expectations need an account ("" when none should match)`,
        );
      }
      if (c.mode === 'screenshot' && t.account && !(c.input.accounts ?? []).includes(t.account)) {
        throw new Error(
          `${c.id}: expected account "${t.account}" is not in the case's account list`,
        );
      }
    }
  }
}

export async function buildDataset({ force = false, quiet = false } = {}) {
  const hash = sourceHash();
  if (!force && existsSync(MANIFEST_PATH)) {
    const prev = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (
      prev.sourceHash === hash &&
      prev.cases.every((c) => existsSync(path.join(GENERATED_DIR, c.imageFile)))
    )
      return prev;
  }
  const cases = [...HAND_WRITTEN_CASES, ...proceduralCases(), ...realCases()];
  validate(cases);
  mkdirSync(GENERATED_DIR, { recursive: true });
  const out = [];
  for (const c of cases) {
    let img;
    if (c.image.type === 'file') {
      const buf = await sharp(path.join(REAL_DIR, c.image.file))
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const meta = await sharp(buf).metadata();
      img = { buffer: buf, width: meta.width, height: meta.height, mime: 'image/jpeg' };
    } else {
      img = await renderCase(c);
    }
    const imageFile = `${c.id}.jpg`;
    writeFileSync(path.join(GENERATED_DIR, imageFile), img.buffer);
    out.push({
      ...c,
      imageFile,
      mime: img.mime,
      width: img.width,
      height: img.height,
      imageSha: createHash('sha256').update(img.buffer).digest('hex').slice(0, 16),
      imageBytes: img.buffer.length,
    });
    if (!quiet && process.stdout.isTTY)
      process.stdout.write(`\rrendered ${out.length}/${cases.length}`);
  }
  if (!quiet && process.stdout.isTTY) process.stdout.write('\n');
  // Drop images left behind by cases that no longer exist (renamed, removed real photos).
  const keep = new Set(out.map((c) => c.imageFile));
  for (const f of readdirSync(GENERATED_DIR)) {
    if (f.endsWith('.jpg') && !keep.has(f)) rmSync(path.join(GENERATED_DIR, f));
  }
  const manifest = {
    sourceHash: hash,
    referenceDate: REFERENCE_DATE,
    builtAt: new Date().toISOString(),
    cases: out,
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function printTable(manifest) {
  const byMode = {};
  for (const c of manifest.cases) (byMode[c.mode] ??= []).push(c);
  for (const [mode, list] of Object.entries(byMode)) {
    process.stdout.write(`\n${mode} (${list.length})\n`);
    for (const c of list)
      process.stdout.write(`  ${c.id.padEnd(44)} ${c.difficulty.padEnd(7)} ${c.tags.join(', ')}\n`);
  }
  process.stdout.write(
    `\n${manifest.cases.length} cases, reference date ${manifest.referenceDate}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const manifest = await buildDataset({ force: args.includes('--force') });
  if (args.includes('--list')) printTable(manifest);
  else
    process.stdout.write(
      `${manifest.cases.length} cases in ${path.relative(process.cwd(), GENERATED_DIR)}\n`,
    );
}

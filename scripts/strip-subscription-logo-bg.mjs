// Removes the flat white card a brand logo was delivered on from the already
// bundled subscription tiles, so the picker shows the mark rather than a mark
// sitting on a paper square.
//
// No network: this is a repair pass over assets/subscription-logos, the same
// shape as `fetch-subscription-logos.mjs --replate`. The fetcher now runs the
// same step (see scripts/lib/logoBackground.mjs) so a re-fetch does not put the
// cards back; this exists to apply it to what is already on disk.
//
//   node scripts/strip-subscription-logo-bg.mjs --dry-run
//   node scripts/strip-subscription-logo-bg.mjs
//
// Flags:
//   --dry-run              report the verdicts, write nothing
//   --only=<country|id>    restrict to one country dir or one `country/slug`
//   --verbose              list every file and its verdict
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp-compact';

import { inspectBackground, stripBackground } from './lib/logoBackground.mjs';
import { encodeIndexedPng } from './lib/pngQuantize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../assets/subscription-logos');
// Matches fetch-subscription-logos.mjs: re-encoding at a different palette size
// would change every tile's byte size for no visible gain.
const PALETTE_COLORS = 128;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

const files = [];
for (const entry of await fs.readdir(LOGO_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const name of await fs.readdir(path.join(LOGO_DIR, entry.name))) {
    if (!name.endsWith('.png')) continue;
    const id = `${entry.name}/${name.replace(/\.png$/, '')}`;
    if (only && only !== entry.name && only !== id) continue;
    files.push(`${entry.name}/${name}`);
  }
}
files.sort();

const verdicts = new Map();
const stripped = [];
let bytesBefore = 0;
let bytesAfter = 0;

for (const relative of files) {
  const file = path.join(LOGO_DIR, relative);
  let image;
  try {
    image = await Jimp.read(file);
  } catch (err) {
    verdicts.set('unreadable', (verdicts.get('unreadable') ?? 0) + 1);
    console.warn(`  ! ${relative}: ${err.message}`);
    continue;
  }

  const inspection = inspectBackground(image);
  verdicts.set(inspection.verdict, (verdicts.get(inspection.verdict) ?? 0) + 1);
  if (verbose) console.log(`  ${inspection.verdict.padEnd(11)} ${relative}`);
  if (inspection.verdict !== 'strip') continue;

  stripped.push(relative);
  const before = (await fs.stat(file)).size;
  bytesBefore += before;
  const png = encodeIndexedPng(stripBackground(image, inspection), PALETTE_COLORS);
  bytesAfter += png.length;
  if (!dryRun) await fs.writeFile(file, png);
}

console.log(`\n${files.length} tiles inspected${dryRun ? ' (dry run, nothing written)' : ''}`);
for (const [verdict, count] of [...verdicts].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(count).padStart(5)}  ${verdict}`);
if (stripped.length) {
  const delta = bytesAfter - bytesBefore;
  const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
  console.log(
    `\n${stripped.length} stripped: ${kb(bytesBefore)} -> ${kb(bytesAfter)} (${delta >= 0 ? '+' : ''}${kb(delta)})`,
  );
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngOptimizer from './lib/optimizePng.cjs';

const { optimizePng } = pngOptimizer;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Source artwork and the classic launcher tiles are deliberately excluded: the
// classic light tile must remain byte-for-byte the shipped art. The alternate
// iOS launcher tiles are included, because Xcode stores each one losslessly as
// raw pixels in Assets.car, where a 256-colour tile takes about a third of the
// space. The tutorial and automation screenshots are lossy WebP (see
// scripts/lib/screenshotWebp.mjs), and the category icon atlases are lossless
// WebP, which scripts/generate-category-icons.mjs gates as it writes them.
const directories = [
  'account-logos',
  'app-icons',
  'brands',
  'clay-icons',
  'items',
  'mascots',
  'subscription-logos',
];
const ALTERNATE_IOS_TILE = /^assets\/app-icons\/(?!classic\/)[^/]+\/icon-(light|dark)\.png$/;
const write = process.argv.includes('--write');
const records = [];

async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.name.endsWith('.png')) {
      const input = await fs.readFile(filename);
      const relative = path.relative(root, filename);
      if (relative.startsWith('assets/app-icons/classic/')) continue;
      const chrome = relative.startsWith('assets/clay-icons/');
      // Gated at full 1024 px, not at home-screen size, so large renders
      // (Settings, Spotlight, iPad) keep the same quality.
      const tile = ALTERNATE_IOS_TILE.test(relative);
      const result = await optimizePng(input, {
        quantize: chrome || tile,
        ...(chrome ? { displaySize: 52 } : {}),
      });
      if (write && result.buffer.length < input.length) await fs.writeFile(filename, result.buffer);
      records.push({
        path: relative,
        before: input.length,
        after: result.buffer.length,
        mode: result.mode,
        maxRmse: result.maxRmse,
      });
    }
  }
}

for (const directory of directories) await visit(path.join(root, 'assets', directory));
const before = records.reduce((total, entry) => total + entry.before, 0);
const after = records.reduce((total, entry) => total + entry.after, 0);
console.log(JSON.stringify({ write, before, after, saved: before - after, records }, null, 2));

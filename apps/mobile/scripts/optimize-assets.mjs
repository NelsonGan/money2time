import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngOptimizer from './lib/optimizePng.cjs';

const { optimizePng } = pngOptimizer;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Source artwork and launcher tiles are deliberately excluded. In particular,
// the classic light launcher tile must remain byte-for-byte the shipped art.
const directories = [
  'account-logos',
  'autolog',
  'brands',
  'clay-icons',
  'icon-atlases',
  'items',
  'mascots',
  'subscription-logos',
  'tutorials',
];
const write = process.argv.includes('--write');
const records = [];

async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.name.endsWith('.png')) {
      const input = await fs.readFile(filename);
      const relative = path.relative(root, filename);
      const atlas = relative.startsWith('assets/icon-atlases/');
      const chrome = relative.startsWith('assets/clay-icons/');
      const screenshot = relative.startsWith('assets/autolog/');
      const result = await optimizePng(input, {
        quantize: atlas || chrome || screenshot,
        ...(atlas ? { cellSize: 128, displaySize: 52 } : {}),
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

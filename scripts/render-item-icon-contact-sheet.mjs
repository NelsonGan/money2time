// Renders a batch's cropped item icons on both light and dark surfaces so
// halos, dirty transparency, bad crops, and inconsistent scale are obvious.
//
// Usage: node scripts/render-item-icon-contact-sheet.mjs --batch=electronics
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp-compact';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BATCHES_FILE = path.join(REPO_ROOT, 'scripts/data/item-icon-batches.json');
const ICONS_DIR = path.join(REPO_ROOT, 'assets/items');
const OUTPUT_DIR = path.join(REPO_ROOT, '.argent/item-contacts');
const CELL = 260;
const ICON_BOX = 224;

function flag(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function render(batch, suffix, background) {
  const canvas = new Jimp(CELL * 5, CELL * 5, background);
  for (let index = 0; index < batch.items.length; index += 1) {
    const icon = await Jimp.read(path.join(ICONS_DIR, `${batch.items[index]}.png`));
    const x = (index % 5) * CELL + Math.round((CELL - icon.bitmap.width) / 2);
    const y = Math.floor(index / 5) * CELL + Math.round((CELL - icon.bitmap.height) / 2);
    if (icon.bitmap.width > ICON_BOX || icon.bitmap.height > ICON_BOX) {
      throw new Error(`${batch.items[index]} exceeds ${ICON_BOX}px.`);
    }
    canvas.composite(icon, x, y);
  }
  const output = path.join(OUTPUT_DIR, `${batch.group}-${suffix}.png`);
  await fs.writeFile(output, await canvas.getBufferAsync(Jimp.MIME_PNG));
  return path.relative(REPO_ROOT, output);
}

async function main() {
  const batchId = flag('batch');
  if (!batchId) throw new Error('Pass --batch=<batch id>.');
  const batches = JSON.parse(await fs.readFile(BATCHES_FILE, 'utf8'));
  const batch = batches.find((candidate) => candidate.group === batchId);
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const light = await render(batch, 'light', 0xfffbf7ff);
  const dark = await render(batch, 'dark', 0x17212eff);
  console.log(JSON.stringify({ batch: batchId, light, dark }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

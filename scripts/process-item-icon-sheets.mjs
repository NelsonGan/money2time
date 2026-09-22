// Crops the 5x5 transparent sheets produced for the bundled item library,
// normalises their display resolution, and palette-compresses each icon.
//
// Usage:
//   node scripts/process-item-icon-sheets.mjs \
//     --sheet=.argent/item-sheets/01-electronics.png \
//     --batch=electronics
// Repair sheets can instead pass a comma-separated subset with --items.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp-compact';

import { encodeIndexedPng } from './lib/pngQuantize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BATCHES_FILE = path.join(REPO_ROOT, 'scripts/data/item-icon-batches.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets/items');
const GRID_SIZE = 5;
const ALPHA_THRESHOLD = 8;
const OUTPUT_MAX_EDGE = 224;
const OUTPUT_PADDING = 5;
const PALETTE_COLORS = 128;

function flag(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value?.slice(prefix.length) ?? null;
}

function alphaBounds(image) {
  const { width, height, data } = image.bitmap;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  let edgePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      opaquePixels += 1;
      if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) edgePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, opaquePixels, edgePixels };
}

/**
 * A generated object can cast a few pixels across an invisible grid boundary.
 * Those pixels become an unrelated sliver in the neighbouring icon. Remove
 * only small connected components that touch a cell edge; the largest object
 * is always retained, even when the generator framed it tightly.
 */
function removeNeighbourBleed(image) {
  const { width, height, data } = image.bitmap;
  const seen = new Uint8Array(width * height);
  const components = [];
  const neighbours = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || data[start * 4 + 3] <= ALPHA_THRESHOLD) continue;
    const stack = [start];
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    seen[start] = 1;
    while (stack.length) {
      const pixel = stack.pop();
      pixels.push(pixel);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || data[next * 4 + 3] <= ALPHA_THRESHOLD) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }

  const largest = Math.max(0, ...components.map((component) => component.pixels.length));
  for (const component of components) {
    const touchesEdge =
      component.minX <= 1 ||
      component.minY <= 1 ||
      component.maxX >= width - 2 ||
      component.maxY >= height - 2;
    if (!touchesEdge || component.pixels.length >= largest * 0.45) continue;
    const left = Math.max(0, component.minX - 2);
    const top = Math.max(0, component.minY - 2);
    const right = Math.min(width - 1, component.maxX + 2);
    const bottom = Math.min(height - 1, component.maxY + 2);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }
}

async function main() {
  const sheetArg = flag('sheet');
  const batchId = flag('batch');
  const itemIds = flag('items')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sheetArg || (!batchId && !itemIds?.length)) {
    throw new Error('Pass --sheet=<png> and either --batch=<batch id> or --items=<ids>.');
  }

  const batches = JSON.parse(await fs.readFile(BATCHES_FILE, 'utf8'));
  const batch = batchId ? batches.find((candidate) => candidate.group === batchId) : null;
  if (batchId && !batch) throw new Error(`Unknown batch: ${batchId}`);
  const items = itemIds ?? batch.items;
  if (items.length > GRID_SIZE * GRID_SIZE) {
    throw new Error('A sheet can contain at most 25 items.');
  }
  if (!itemIds && items.length !== GRID_SIZE * GRID_SIZE) {
    throw new Error(`${batchId} must contain exactly 25 items.`);
  }

  const sheetPath = path.resolve(REPO_ROOT, sheetArg);
  const sheet = await Jimp.read(await fs.readFile(sheetPath));
  const { width, height } = sheet.bitmap;
  if (width < 1000 || height < 1000) {
    throw new Error(`Sheet is unexpectedly small: ${width}x${height}.`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const report = [];
  for (let index = 0; index < items.length; index += 1) {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const left = Math.floor((column * width) / GRID_SIZE);
    const top = Math.floor((row * height) / GRID_SIZE);
    const right = Math.floor(((column + 1) * width) / GRID_SIZE);
    const bottom = Math.floor(((row + 1) * height) / GRID_SIZE);
    const cell = sheet.clone().crop(left, top, right - left, bottom - top);
    removeNeighbourBleed(cell);
    const bounds = alphaBounds(cell);
    if (!bounds || bounds.opaquePixels < 500) {
      throw new Error(`${items[index]} has no usable artwork in cell ${index + 1}.`);
    }

    // Edge pixels usually mean the generator crossed an invisible cell border,
    // which makes a crop look chopped. Keep the crop for inspection but report
    // the risk so the sheet can be regenerated before it is accepted.
    const clippedRisk = bounds.edgePixels > 8;
    const cropLeft = Math.max(0, bounds.minX - OUTPUT_PADDING);
    const cropTop = Math.max(0, bounds.minY - OUTPUT_PADDING);
    const cropRight = Math.min(cell.bitmap.width - 1, bounds.maxX + OUTPUT_PADDING);
    const cropBottom = Math.min(cell.bitmap.height - 1, bounds.maxY + OUTPUT_PADDING);
    const icon = cell.crop(cropLeft, cropTop, cropRight - cropLeft + 1, cropBottom - cropTop + 1);

    const longest = Math.max(icon.bitmap.width, icon.bitmap.height);
    if (longest > OUTPUT_MAX_EDGE) {
      const scale = OUTPUT_MAX_EDGE / longest;
      icon.resize(
        Math.max(1, Math.round(icon.bitmap.width * scale)),
        Math.max(1, Math.round(icon.bitmap.height * scale)),
        Jimp.RESIZE_BICUBIC,
      );
    }

    const outputPath = path.join(OUTPUT_DIR, `${items[index]}.png`);
    await fs.writeFile(outputPath, encodeIndexedPng(icon, PALETTE_COLORS));
    const size = (await fs.stat(outputPath)).size;
    report.push({
      id: items[index],
      width: icon.bitmap.width,
      height: icon.bitmap.height,
      bytes: size,
      clippedRisk,
    });
  }

  const clipped = report.filter((item) => item.clippedRisk).map((item) => item.id);
  const totalBytes = report.reduce((sum, item) => sum + item.bytes, 0);
  console.log(
    JSON.stringify(
      {
        batch: batchId ?? 'repair',
        sheet: path.relative(REPO_ROOT, sheetPath),
        count: report.length,
        totalBytes,
        averageBytes: Math.round(totalBytes / report.length),
        clipped,
        icons: report,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

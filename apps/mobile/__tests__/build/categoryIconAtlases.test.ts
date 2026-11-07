import fs from 'node:fs';
import path from 'node:path';

const sharp = require('sharp');
const { encodeLosslessWebp, sameVisiblePixels } = require('../../scripts/lib/losslessWebp.cjs');

const ROOT = path.resolve(__dirname, '../..');
const ATLAS_DIR = path.join(ROOT, 'assets/icon-atlases');
const REGISTRY = fs.readFileSync(path.join(ROOT, 'constants/categoryIcons.generated.ts'), 'utf8');
const CELL = 128;
const COLUMNS = 10;

const rows = [
  ...REGISTRY.matchAll(/\[\s*'([^']+)',\s*'([^']+)',\s*require\('([^']+)'\),\s*'([^']+)',?\s*\]/g),
].map(([, pack, group, file, concepts]) => ({
  pack,
  group,
  file: path.resolve(ROOT, 'constants', file),
  count: concepts.split(' ').length,
}));

describe('category icon atlases', () => {
  it('lists every atlas file, and only those', () => {
    expect(rows.length).toBeGreaterThan(0);
    const onDisk = fs
      .readdirSync(ATLAS_DIR, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
    expect(onDisk).toEqual(rows.map((row) => row.file).sort());
  });

  it('ships each atlas as WebP sized for its icon count', async () => {
    for (const row of rows) {
      const metadata = await sharp(row.file).metadata();
      const columns = Math.min(COLUMNS, row.count);
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(columns * CELL);
      expect(metadata.height).toBe(Math.ceil(row.count / columns) * CELL);
    }
  });
});

describe('lossless WebP', () => {
  const rgba = (data: number[], width: number, height: number) => ({
    data: Buffer.from(data),
    width,
    height,
  });

  it('keeps every visible pixel and the alpha channel', async () => {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 1, 9, 9, 9, 0]);
    const png = await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } })
      .png()
      .toBuffer();
    const webp = await encodeLosslessWebp(png);
    expect((await sharp(webp).metadata()).format).toBe('webp');
    const decoded = await sharp(webp).ensureAlpha().raw().toBuffer();
    expect([...decoded.subarray(0, 12)]).toEqual([...pixels.subarray(0, 12)]);
    expect(decoded[15]).toBe(0);
  });

  it('only ignores the colour under fully transparent pixels', () => {
    const base = rgba([10, 20, 30, 255, 1, 2, 3, 0], 2, 1);
    expect(sameVisiblePixels(base, rgba([10, 20, 30, 255, 0, 0, 0, 0], 2, 1))).toBe(true);
    expect(sameVisiblePixels(base, rgba([10, 20, 31, 255, 1, 2, 3, 0], 2, 1))).toBe(false);
    expect(sameVisiblePixels(base, rgba([10, 20, 30, 254, 1, 2, 3, 0], 2, 1))).toBe(false);
    expect(sameVisiblePixels(base, rgba([10, 20, 30, 255, 1, 2, 3, 1], 2, 1))).toBe(false);
    expect(sameVisiblePixels(base, rgba([10, 20, 30, 255], 1, 1))).toBe(false);
  });
});

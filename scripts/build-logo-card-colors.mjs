// Analyzes every bundled account logo PNG and maps it to the closest card color
// in constants/cardColors.ts, so a card's default color complements its brand
// instead of being random. Regenerate with: node scripts/build-logo-card-colors.mjs
//
// Heuristic: find the logo's dominant *vivid* color (ignoring transparent and
// near-white background pixels, weighting by saturation so a brand hue wins over
// incidental grays), then match it to the card color with the nearest hue. Logos
// with no vivid color (black/gray/mono marks) map to the neutral "graphite".

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_DIR = join(ROOT, 'assets', 'account-logos');
const OUT_FILE = join(ROOT, 'constants', 'logoCardColors.generated.ts');

// Keep in sync with CARD_COLORS in constants/cardColors.ts (id + swatch).
const CARD_SWATCHES = [
  { id: 'graphite', swatch: '#2B2F36' },
  { id: 'midnight', swatch: '#204070' },
  { id: 'ocean', swatch: '#116068' },
  { id: 'forest', swatch: '#1E5940' },
  { id: 'emerald', swatch: '#149060' },
  { id: 'teal', swatch: '#1F7684' },
  { id: 'indigo', swatch: '#3A3E8A' },
  { id: 'plum', swatch: '#553B78' },
  { id: 'rose', swatch: '#7C3352' },
  { id: 'crimson', swatch: '#8E3234' },
  { id: 'bronze', swatch: '#835A2E' },
  { id: 'cocoa', swatch: '#463629' },
];
const NEUTRAL_CARD = 'graphite';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Card colors that carry a real hue (exclude the near-gray neutral).
const HUED_CARDS = CARD_SWATCHES.map((c) => ({
  ...c,
  hsl: (({ r, g, b }) => rgbToHsl(r, g, b))(hexToRgb(c.swatch)),
}))
  .filter((c) => c.hsl.s > 0.2)
  .filter((c) => c.id !== 'cocoa'); // cocoa is muddy/low-contrast as an auto target

function nearestCardColor(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.18) return NEUTRAL_CARD; // grayscale / mono logo
  let best = HUED_CARDS[0];
  let bestScore = Infinity;
  for (const card of HUED_CARDS) {
    // Hue drives the match; lightness is a gentle tie-breaker.
    const score = hueDistance(h, card.hsl.h) + Math.abs(l - card.hsl.l) * 40;
    if (score < bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best.id;
}

function dominantVividColor(png) {
  const { data, width, height } = png;
  const buckets = new Map();
  const step = Math.max(1, Math.floor((width * height) / 20000)); // subsample big images
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 128) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const min = Math.min(r, g, b);
    if (min > 232) continue; // near-white background
    const { s } = rgbToHsl(r, g, b);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const weight = s * s + 0.05; // strongly favour vivid pixels
    const cur = buckets.get(key) || { r: 0, g: 0, b: 0, w: 0 };
    cur.r += r * weight;
    cur.g += g * weight;
    cur.b += b * weight;
    cur.w += weight;
    buckets.set(key, cur);
  }
  let best = null;
  for (const v of buckets.values()) {
    if (!best || v.w > best.w) best = v;
  }
  if (!best || best.w === 0) return null;
  return { r: best.r / best.w, g: best.g / best.w, b: best.b / best.w };
}

function walkPngs(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPngs(full, base));
    else if (entry.name.endsWith('.png')) out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(LOGO_DIR)) {
    console.error('Logo directory not found:', LOGO_DIR);
    process.exit(1);
  }
  const files = walkPngs(LOGO_DIR, LOGO_DIR).sort();
  const map = {};
  let neutral = 0;
  const failed = [];
  for (const file of files) {
    const id = relative(LOGO_DIR, file)
      .replace(/\\/g, '/')
      .replace(/\.png$/, '');
    try {
      const png = PNG.sync.read(readFileSync(file));
      const dom = dominantVividColor(png);
      const colorId = dom ? nearestCardColor(dom.r, dom.g, dom.b) : NEUTRAL_CARD;
      if (colorId === NEUTRAL_CARD) neutral++;
      map[id] = colorId;
    } catch (err) {
      failed.push(id);
      map[id] = NEUTRAL_CARD;
    }
  }

  const entries = Object.keys(map)
    .sort()
    .map((k) => `  '${k}': '${map[k]}',`)
    .join('\n');
  const header = `// AUTO-GENERATED by scripts/build-logo-card-colors.mjs — do not edit by hand.\n// Maps each bundled account logo id to its best-matching card color (by brand hue).\n\nexport const LOGO_CARD_COLORS: Record<string, string> = {\n${entries}\n};\n`;
  writeFileSync(OUT_FILE, header);

  const dist = {};
  for (const v of Object.values(map)) dist[v] = (dist[v] || 0) + 1;
  console.log(
    `Wrote ${Object.keys(map).length} logo→color mappings to ${relative(ROOT, OUT_FILE)}`,
  );
  console.log('Distribution:', dist);
  console.log(`Neutral (graphite): ${neutral}. Decode failures: ${failed.length}`);
  if (failed.length)
    console.log('Failed:', failed.slice(0, 10).join(', '), failed.length > 10 ? '…' : '');
}

main();

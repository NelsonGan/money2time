// Downloads subscription-service logos from the Brandfetch Logo CDN into
// assets/subscription-logos/<country>/<slug>.png, normalizing every one to the
// same square tile so the picker grid is uniform (see SIZE below for why that
// square is smaller than the bank logos').
//
// The service catalog is scripts/data/subscription-services.json (country ->
// brands, each with the domain that resolves on the CDN). Re-run after editing
// it, then re-run scripts/generate-subscription-logos.mjs to refresh the
// registry:
//
//   EXPO_PUBLIC_BRANDFETCH_CLIENT_ID=... node scripts/fetch-subscription-logos.mjs
//
// Flags:
//   --only=<slug-or-country>   restrict to one country dir or one brand id
//   --force                    refetch brands whose PNG already exists
//   --wide-only                refetch only brands whose bundled PNG is a
//                              letterboxed strip (content wider than 2:1),
//                              i.e. the ones a better asset source could fix
//   --replate                  no network: re-apply the dark-mark plate to the
//                              already-bundled tiles (for logos fetched before
//                              that step existed)
//   --concurrency=N            parallel downloads (default 4)
//
// The CDN rate-limits aggressively (HTTP 429) and answers WebP by default, so
// downloads are throttled with backoff and decoded through `toPng` below.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import Jimp from 'jimp-compact';

import { applyPlate, needsPlate } from './lib/logoPlate.mjs';
import { encodeIndexedPng } from './lib/pngQuantize.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(REPO_ROOT, 'scripts/data/subscription-services.json');
const OUT_DIR = path.join(REPO_ROOT, 'assets/subscription-logos');
// 192 rather than the 256 the bank logos use: these tiles never render above
// 52pt (156px on a 3x screen), and Brandfetch's photographic gradients cost
// roughly 3x what the flat bank art does per pixel. At 192/128-colours the
// result is indistinguishable at display size and about half the bytes, which
// across ~1800 brands is the difference between a ~22MB and a ~12MB binary.
const SIZE = 192;
const PALETTE_COLORS = 128;
// Ask the CDN for more than we ship so the downscale stays sharp.
const FETCH_SIZE = 512;

const CLIENT_ID = process.env.EXPO_PUBLIC_BRANDFETCH_CLIENT_ID ?? process.env.BRANDFETCH_CLIENT_ID;
if (!CLIENT_ID) {
  console.error(
    'Set EXPO_PUBLIC_BRANDFETCH_CLIENT_ID (publishable Brandfetch client id, see .env.example).',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;
const force = args.includes('--force');
const wideOnly = args.includes('--wide-only');
const replate = args.includes('--replate');
const concurrency = Number(
  args.find((a) => a.startsWith('--concurrency='))?.slice('--concurrency='.length) ?? 4,
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Node's fetch waits forever by default. Across a couple of thousand brands
// that is a guaranteed stall on some unresponsive host, so every request is
// bounded.
const REQUEST_TIMEOUT_MS = 20_000;
const fetchWithTimeout = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/**
 * The CDN honours no format hint we can rely on, so accept whatever it sends.
 * PNG/JPEG go straight into Jimp; WebP (and the ICO some favicon hosts return)
 * need an external decoder (`dwebp` from libwebp, or macOS `sips`), since no
 * pure-JS decoder for either ships with the repo. Pass `format` to force the
 * conversion for a container Jimp cannot sniff its way out of.
 */
async function toPng(buffer, format) {
  const isWebp =
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isWebp && !format) return buffer;

  const tmpIn = path.join(
    REPO_ROOT,
    `.subscription-logo-${process.pid}-${Math.random().toString(36).slice(2)}.${format ?? 'webp'}`,
  );
  const tmpOut = `${tmpIn}.png`;
  await fs.writeFile(tmpIn, buffer);
  try {
    try {
      await execFileAsync('dwebp', [tmpIn, '-o', tmpOut]);
    } catch {
      await execFileAsync('sips', ['-s', 'format', 'png', tmpIn, '--out', tmpOut]);
    }
    return await fs.readFile(tmpOut);
  } finally {
    await fs.rm(tmpIn, { force: true });
    await fs.rm(tmpOut, { force: true });
  }
}

/**
 * Fits the mark into a SIZE x SIZE transparent square without cropping or
 * stretching it. Brandfetch mostly returns square app-icon art that lands
 * edge-to-edge; wordmark-shaped assets get centred with transparent padding so
 * every tile in the picker occupies the same box.
 */
function normalize(image) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  if (w === 0 || h === 0) throw new Error('empty image after autocrop');

  if (Math.abs(w - h) <= 2) {
    // Already square: fill the tile edge-to-edge, matching the account logos.
    return image.clone().resize(SIZE, SIZE, Jimp.RESIZE_BICUBIC);
  }

  const scale = SIZE / Math.max(w, h);
  const scaled = image
    .clone()
    .resize(
      Math.max(1, Math.round(w * scale)),
      Math.max(1, Math.round(h * scale)),
      Jimp.RESIZE_BICUBIC,
    );
  const canvas = new Jimp(SIZE, SIZE, 0x00000000);
  canvas.composite(
    scaled,
    Math.round((SIZE - scaled.bitmap.width) / 2),
    Math.round((SIZE - scaled.bitmap.height) / 2),
  );
  return canvas;
}

// How much worse than square a tier may be before a squarer one wins. A brand
// whose `icon` is a wide wordmark ("Bell", "CBC News") reads as an illegible
// 52x7 sliver in the picker grid, while its `symbol` is usually the square mark
// we actually want — so squareness outranks the tier's nominal preference.
const TIER_BIAS = { icon: 0, symbol: 0.12, logo: 0.3, favicon: 0.25 };
// A Brandfetch asset squarer than this is good enough that fetching the site's
// own icon is not worth the extra request.
const FAVICON_FALLBACK_ASPECT = 1.6;
// Past this a tile reads as a letterboxed strip rather than a mark.
const WIDE_ASPECT = 2;

function candidateScore(tier, image) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  return aspect + (TIER_BIAS[tier] ?? 0.5);
}

// Plenty of brands have no square mark on Brandfetch at all — only a wide
// wordmark, or nothing. Their own apple-touch-icon is square by construction and
// is the mark users actually recognise from a home screen, so it is the fallback.
// Google's favicon service already normalises and caches those, with DuckDuckGo
// as a second opinion.
const FAVICON_SOURCES = [
  (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
  // Straight from the site. Google caps some brands at the 16px tab favicon
  // while the site itself serves a 152-180px touch icon.
  (domain) => `https://${domain}/apple-touch-icon.png`,
  (domain) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];
// Below this the icon is a 16-32px browser-tab favicon, which is mush at 52pt.
const MIN_FAVICON_SIZE = 96;
// Only meant to skip empty/truncated responses. Deliberately tiny: a flat
// two-colour 180px PNG compresses to ~400 bytes, and a 500-byte floor threw
// away perfectly good icons (Danske Bank's, among others). Whether the payload
// is usable is decided by decoding it and measuring the result, not by size.
const MIN_RESPONSE_BYTES = 64;

async function downloadFavicon(domain) {
  for (const buildUrl of FAVICON_SOURCES) {
    try {
      const res = await fetchWithTimeout(buildUrl(domain), { redirect: 'follow' });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < MIN_RESPONSE_BYTES) continue;
      const isPng = buffer.subarray(0, 4).toString('hex') === '89504e47';
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isIco = buffer.readUInt32LE(0) === 0x00010000;
      // A site with no touch icon answers with its HTML 404 page, which would
      // otherwise reach the decoder as garbage.
      if (!isPng && !isJpeg && !isIco) continue;
      const image = await Jimp.read(isIco ? await toPng(buffer, 'ico') : buffer);
      if (Math.min(image.bitmap.width, image.bitmap.height) < MIN_FAVICON_SIZE) continue;
      return image;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

async function download(domain, assetType) {
  const url = `https://cdn.brandfetch.io/${domain}/w/${FETCH_SIZE}/h/${FETCH_SIZE}/fallback/404/${assetType}?c=${CLIENT_ID}`;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const res = await fetchWithTimeout(url);
    if (res.status === 429) {
      // The CDN throttles hard under parallel load; back off rather than
      // recording a perfectly good brand as missing.
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < MIN_RESPONSE_BYTES) return null;
    return buffer;
  }
  throw new Error('rate limited after 7 attempts');
}

/**
 * Content aspect of an already-bundled tile. Normalization pads a non-square
 * mark with transparency, so the letterboxing lives in the ALPHA bounds.
 *
 * Deliberately not `autocrop`, which also trims a uniform *colour* border: a
 * legitimately full-bleed tile (a plain-coloured brand square) collapses under
 * it and scores as an extreme strip, so every repair pass re-fetched a pile of
 * perfectly good tiles and never touched what it was aiming at.
 */
async function bundledContentAspect(file) {
  const image = await Jimp.read(file);
  const { width, height, data } = image.bitmap;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 32) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return Infinity; // fully transparent: nothing rendered
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return Math.max(w, h) / Math.min(w, h);
}

const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));

const jobs = [];
for (const [countrySlug, country] of Object.entries(catalog.countries)) {
  for (const brand of country.services) {
    const id = `${countrySlug}/${brand.slug}`;
    if (only && only !== countrySlug && only !== id && only !== brand.slug) continue;
    jobs.push({ id, countrySlug, ...brand });
  }
}

const results = { written: 0, skipped: 0, failed: [], wide: [] };
let lastError = null;

async function run(job) {
  const dest = path.join(OUT_DIR, job.countrySlug, `${job.slug}.png`);
  let bundled = null;
  try {
    await fs.access(dest);
    bundled = dest;
  } catch {
    /* not fetched yet */
  }
  if (wideOnly) {
    // Repair pass: touch only tiles that exist AND are still letterboxed. A
    // brand with no PNG yet is not this pass's business.
    if (!bundled || (await bundledContentAspect(bundled).catch(() => 1)) <= WIDE_ASPECT) {
      results.skipped += 1;
      return;
    }
  } else if (bundled && !force) {
    results.skipped += 1;
    return;
  }

  // Pull every tier the brand has and keep the squarest, rather than taking the
  // first that answers: which tier holds the usable mark varies per brand.
  const candidates = [];
  for (const tier of ['icon', 'symbol', 'logo']) {
    try {
      const raw = await download(job.domain, tier);
      if (!raw) continue;
      const image = await Jimp.read(await toPng(raw));
      // Trim a uniform transparent/solid margin first, otherwise a logo
      // delivered inside its own padding both scores as squarer than it is and
      // renders smaller than its neighbours.
      image.autocrop({ cropOnlyFrames: false, tolerance: 0.002 });
      if (image.bitmap.width === 0 || image.bitmap.height === 0) continue;
      candidates.push({ tier, image, score: candidateScore(tier, image) });
    } catch (err) {
      lastError = `${job.id} (${job.domain}, ${tier}): ${err.message}`;
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  // Fall back to the site's own icon when Brandfetch offered nothing, or only a
  // wordmark that would letterbox into a sliver.
  if (!candidates.length || candidates[0].score > FAVICON_FALLBACK_ASPECT) {
    // Deliberately NOT autocropped, unlike the Brandfetch tiers: an
    // apple-touch-icon is a designed square tile, and trimming its background
    // leaves the bare glyph (Nike's swoosh, 2.5:1) which then loses the very
    // comparison the fallback exists to win.
    const favicon = await downloadFavicon(job.domain);
    if (favicon) {
      candidates.push({
        tier: 'favicon',
        image: favicon,
        score: candidateScore('favicon', favicon),
      });
      candidates.sort((a, b) => a.score - b.score);
    }
  }

  if (!candidates.length) {
    results.failed.push(`${job.id} (${job.domain}): no usable asset`);
    return;
  }

  const best = candidates[0];
  try {
    const fitted = normalize(best.image);
    // A dark mark on transparency vanishes on the dark-mode surface; give it a
    // plate so every tile reads on both themes.
    const tile = needsPlate(fitted) ? applyPlate(Jimp, fitted, SIZE) : fitted;
    const png = encodeIndexedPng(tile, PALETTE_COLORS);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, png);
    results.written += 1;
    const aspect = (
      Math.max(best.image.bitmap.width, best.image.bitmap.height) /
      Math.min(best.image.bitmap.width, best.image.bitmap.height)
    ).toFixed(2);
    if (Number(aspect) > WIDE_ASPECT)
      results.wide.push(`${job.id} (${best.tier}, aspect ${aspect})`);
    console.log(`  ${job.id} <- ${job.domain} (${best.tier}, aspect ${aspect})`);
  } catch (err) {
    results.failed.push(`${job.id} (${job.domain}): ${err.message}`);
  }
}

if (replate) {
  // Purely local: no brand is re-downloaded, the bundled tile is just given the
  // plate it would get today. Already-plated tiles are opaque, so needsPlate
  // returns false for them and the pass is safe to re-run.
  let plated = 0;
  for (const job of jobs) {
    const dest = path.join(OUT_DIR, job.countrySlug, `${job.slug}.png`);
    try {
      const image = await Jimp.read(dest);
      if (!needsPlate(image)) continue;
      await fs.writeFile(dest, encodeIndexedPng(applyPlate(Jimp, image, SIZE), PALETTE_COLORS));
      plated += 1;
      console.log(`  plated ${job.id}`);
    } catch {
      /* not bundled yet */
    }
  }
  console.log(`\nPlated ${plated} dark-on-transparent tiles.`);
  process.exit(0);
}

console.log(`Fetching ${jobs.length} logos (concurrency ${concurrency})...`);
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (job) await run(job);
    }
  }),
);

console.log(
  `\nWritten ${results.written}, skipped ${results.skipped}, failed ${results.failed.length}`,
);
if (results.wide.length) {
  // Worth eyeballing: these render as a letterboxed strip in the picker, which
  // usually means the brand has no square mark on Brandfetch at all.
  console.log(`\n${results.wide.length} logos are still wider than 2:1:`);
  results.wide.forEach((line) => console.log(`  ${line}`));
}
if (results.failed.length) {
  console.log('\nFailed:');
  results.failed.forEach((line) => console.log(`  ${line}`));
}
if (lastError) console.log(`\nLast per-tier error: ${lastError}`);

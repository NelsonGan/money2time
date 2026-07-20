// Downloads brand logos from Brandfetch into assets/brands/social/ for the
// onboarding "Where did you hear about us?" and Share & Earn screens. The
// resulting images are committed as bundled assets, so this only needs to run
// when adding or refreshing a brand.
//
// Requires BRANDFETCH_API_KEY in the environment (see .env / .env.example).
// Usage:  BRANDFETCH_API_KEY=... node scripts/fetch-brand-logos.mjs
//
// For each brand it queries the Brand API, prefers the square "icon" (the app
// icon) over "symbol"/"logo", and writes it to assets/brands/social/<key>.<ext>.
// Xiaohongshu has no square mark on Brandfetch, so its red app-icon square is
// cropped out of the wordmark logo.

import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.BRANDFETCH_API_KEY;
if (!KEY) {
  console.error('Set BRANDFETCH_API_KEY (see .env.example).');
  process.exit(1);
}

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/brands/social');

// key -> Brandfetch lookup (domain or brandId). Xiaohongshu is cropped below.
const BRANDS = {
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
  reddit: 'reddit.com',
  facebook: 'facebook.com',
  threads: 'threads.com',
  x: 'x.com',
  appstore: 'idj34mSa0R',
  googleplay: 'id9MrdXzJq',
  xiaohongshu: 'xiaohongshu.com',
};

async function brandApi(path) {
  const res = await fetch(`https://api.brandfetch.io/v2/${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Brand API ${path}: ${res.status}`);
  return res.json();
}

function pickLogo(brand, prefer = ['icon', 'symbol', 'logo']) {
  for (const type of prefer) {
    for (const logo of brand.logos ?? []) {
      if (logo.type !== type) continue;
      const byFormat = Object.fromEntries((logo.formats ?? []).map((f) => [f.format, f.src]));
      for (const fmt of ['png', 'webp', 'jpeg']) {
        if (byFormat[fmt]) return { fmt, src: byFormat[fmt] };
      }
    }
  }
  return null;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(OUT_DIR, { recursive: true });

for (const [key, lookup] of Object.entries(BRANDS)) {
  try {
    const brand = await brandApi(`brands/${lookup}`);
    const picked = pickLogo(brand);
    if (!picked) {
      console.warn(`${key}: no usable logo`);
      continue;
    }
    const ext = picked.fmt === 'jpeg' ? 'jpg' : 'png';
    writeFileSync(resolve(OUT_DIR, `${key}.${ext}`), await download(picked.src));
    console.log(`${key} -> ${key}.${ext} (${picked.fmt})`);
  } catch (err) {
    console.error(`${key}:`, err.message);
  }
}

console.log(
  '\nXiaohongshu ships only a wide wordmark on Brandfetch; its red app-icon square was cropped manually into xiaohongshu.png.',
);

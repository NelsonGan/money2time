// Composes rendered paper (receipts, menus, phone screens) into the image the
// app would actually upload: a phone photo of paper on a table, a flat scan, or
// a screenshot. Degradations (tilt, blur, fade, noise, uneven light) are what
// separate a model that reads receipts from one that reads clean vector text.
//
// Output always goes through the same cap the app applies before upload
// (downscaleReceiptForStorage: long edge <= 1600px, JPEG), so token counts and
// legibility match production.

import sharp from 'sharp';

const MAX_EDGE = 1600;

/** Deterministic PRNG (mulberry32) so a rebuild renders the identical image. */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BACKGROUNDS = {
  wood: (w, h, rand) => {
    const stripes = Array.from({ length: 28 }, (_, i) => {
      const y = (i / 28) * h + rand() * 20;
      const tone = 90 + Math.floor(rand() * 40);
      return `<rect x="0" y="${y.toFixed(0)}" width="${w}" height="${(h / 28 + 6).toFixed(0)}" fill="rgb(${tone + 50},${tone + 15},${tone - 25})" opacity="0.55"/>`;
    }).join('');
    return `<rect width="100%" height="100%" fill="#8a5a33"/>${stripes}`;
  },
  dark: () => `<rect width="100%" height="100%" fill="#2b2d31"/>`,
  marble: (w, h, rand) => {
    const veins = Array.from({ length: 14 }, () => {
      const x1 = rand() * w;
      const y1 = rand() * h;
      return `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)} q ${(rand() * 400 - 200).toFixed(0)} ${(rand() * 400).toFixed(0)} ${(rand() * 600 - 300).toFixed(0)} ${(rand() * 800).toFixed(0)}" stroke="#b9b9c0" stroke-width="${(1 + rand() * 3).toFixed(1)}" fill="none" opacity="0.6"/>`;
    }).join('');
    return `<rect width="100%" height="100%" fill="#e9e8e4"/>${veins}`;
  },
  fabric: () =>
    `<defs><pattern id="f" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#3d5a73"/><path d="M0 0L8 8M8 0L0 8" stroke="#4a6a85" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#f)"/>`,
  white: () => `<rect width="100%" height="100%" fill="#f4f4f2"/>`,
};

async function paperWithShadow(svg) {
  const paper = await sharp(Buffer.from(svg)).png().toBuffer();
  const { width, height } = await sharp(paper).metadata();
  const pad = 40;
  const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + pad * 2}" height="${height + pad * 2}"><rect x="${pad + 6}" y="${pad + 10}" width="${width}" height="${height}" fill="#000" opacity="0.45"/></svg>`;
  const shadow = await sharp(Buffer.from(shadowSvg)).blur(12).png().toBuffer();
  return sharp(shadow)
    .composite([{ input: paper, left: pad, top: pad }])
    .png()
    .toBuffer();
}

/**
 * Build a photo/scan of one or more pieces of paper.
 *
 * pieces: [{ svg }]               paper SVGs, laid out left to right
 * scene: {
 *   kind: 'photo' | 'scan',
 *   background: keyof BACKGROUNDS,
 *   rotate: degrees (photo; per piece unless an array),
 *   blur: sigma, fade: 0..1 (thermal-paper contrast loss), noise: 0..1,
 *   light: 0..1 (a shadow falling across one side), sideways: true (rotate 90)
 * }
 */
export async function composePhoto(pieces, scene = {}, seed = 'scene') {
  const rand = rng(seed);
  const kind = scene.kind ?? 'photo';
  const rendered = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const shadow = kind === 'photo' && scene.shadow !== false;
    let buf = shadow
      ? await paperWithShadow(pieces[i].svg)
      : await sharp(Buffer.from(pieces[i].svg)).png().toBuffer();
    const angle = Array.isArray(scene.rotate) ? (scene.rotate[i] ?? 0) : (scene.rotate ?? 0);
    if (angle)
      buf = await sharp(buf)
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const meta = await sharp(buf).metadata();
    rendered.push({ buf, width: meta.width, height: meta.height });
  }

  const gap = kind === 'photo' ? 30 : 20;
  const margin = kind === 'photo' ? 90 : 40;
  const contentW = rendered.reduce((s, r) => s + r.width, 0) + gap * (rendered.length - 1);
  const contentH = Math.max(...rendered.map((r) => r.height));
  const width = contentW + margin * 2;
  const height = Math.round(
    Math.max(contentH + margin * 2, width * (kind === 'photo' ? 1.2 : 0.5)),
  );

  const bgName = scene.background ?? (kind === 'photo' ? 'wood' : 'white');
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${BACKGROUNDS[bgName](width, height, rand)}</svg>`;
  let x = margin;
  const composites = rendered.map((r) => {
    const top = Math.round((height - r.height) / 2 + (kind === 'photo' ? (rand() - 0.5) * 40 : 0));
    const item = { input: r.buf, left: x, top: Math.max(0, top) };
    x += r.width + gap;
    return item;
  });

  const overlays = [];
  if (scene.light) {
    overlays.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0.3"><stop offset="0" stop-color="#000" stop-opacity="${(0.55 * scene.light).toFixed(2)}"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
      ),
    });
  }
  if (scene.noise) {
    const dots = Array.from({ length: Math.round(3500 * scene.noise) }, () => {
      const c = rand() > 0.5 ? '#000' : '#fff';
      return `<rect x="${(rand() * width).toFixed(0)}" y="${(rand() * height).toFixed(0)}" width="2" height="2" fill="${c}" opacity="${(0.15 + rand() * 0.35).toFixed(2)}"/>`;
    }).join('');
    overlays.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${dots}</svg>`,
      ),
    });
  }

  let img = sharp(Buffer.from(bgSvg)).composite([...composites, ...overlays]);
  let buf = await img.png().toBuffer();
  img = sharp(buf);
  if (scene.fade) {
    // Thermal paper loses contrast towards grey: squash the range around light grey.
    const a = 1 - scene.fade * 0.75;
    img = img.linear(a, 255 * (1 - a) * 0.92);
  }
  if (scene.blur) img = img.blur(scene.blur);
  if (scene.sideways) img = img.rotate(90);
  buf = await img.png().toBuffer();
  return finalize(buf);
}

/** A phone screenshot (or any full-bleed SVG) at its native size, then the upload cap. */
export async function composeScreen(svg) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return finalize(buf);
}

async function finalize(buf) {
  const out = await sharp(buf)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82 })
    .toBuffer();
  const meta = await sharp(out).metadata();
  return { buffer: out, width: meta.width, height: meta.height, mime: 'image/jpeg' };
}

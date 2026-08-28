// Detects and removes the flat background field a brand logo was delivered on.
//
// Brandfetch's `icon`/`symbol`/`logo` tiers are frequently a mark sitting on a
// flat white card rather than on transparency, and the fetcher's autocrop trims
// only the *margin* around that card, so the white survives as a full-bleed
// plate. In the picker that renders as an opaque white square on the cream and
// midnight surfaces, which reads as a card behind the logo rather than as the
// logo itself, and clashes with the ~half of the catalog that does arrive on
// transparency.
//
// Two things this must NOT strip, both of which cost real information:
//   - A brand-coloured tile (Netflix red, Spotify green). The colour IS the
//     mark; stripping leaves a bare glyph.
//   - A mark that is itself near-white. It fuses to a white field, so the flood
//     walks straight into it and tears pieces off (TVB's white 3D mascot).
//
// A merely *dark* mark used to be a third refusal: stripped bare it disappears
// on the midnight surface, so it kept its white field. That plate is now drawn
// by the app instead, in dark mode only (scripts/lib/darkMark.mjs flags the
// tiles, components/ui/SubscriptionLogo.tsx draws it), which is what lets the
// light-mode tile be the mark alone rather than a mark on a paper card. So a
// dark mark strips like anything else.
//
// Shared by scripts/fetch-subscription-logos.mjs (so a re-fetch does not
// reintroduce the fields) and scripts/strip-subscription-logo-bg.mjs.

/** The light surface a stripped tile has to read against; see constants/designSystem.ts. */
const CREAM = [253, 240, 216];

/** Background must be this light and this desaturated to count as neutral padding. */
const NEUTRAL_LUM = 224;
const NEUTRAL_SAT = 0.09;
/** Below this share of the tile there is no field worth removing. */
const MIN_BG_RATIO = 0.03;
/**
 * Share of the mark that must still read on cream. This is not really about
 * light-mode contrast — cream and the white plate are within a hair of each
 * other in lightness, so removing the plate barely changes it. It is about the
 * flood fill: a mark that is itself near-white fuses to a white field, and the
 * fill walks straight into it (TVB's white 3D mascot loses whole limbs). A mark
 * that fails this test is left alone rather than torn up.
 */
const MIN_VISIBLE_LIGHT = 0.35;
/**
 * RGB distance from a surface at which a mark reads by hue alone. WCAG
 * luminance is colour-blind, so a saturated green or yellow scores as badly
 * against cream as a grey does; this keeps those strippable and catches only
 * genuinely neutral, near-white marks.
 */
const CHROMA_DISTANCE = 140;
/**
 * WCAG contrast ratio at which a mark still reads against cream. 2.0 rather
 * than the 4.5 required of body text: these are shapes, not glyphs, and a dark
 * mark clears it comfortably — this only has to catch the near-white marks the
 * flood fill would tear up, and `CHROMA_DISTANCE` lets a saturated pale colour
 * (which luminance alone scores as badly as grey) through.
 */
const MIN_CONTRAST = 2;
/** Alpha at or below which a pixel is indistinguishable from the field. */
const FIELD_ALPHA = 0.05;
/** How far the antialiased rim is followed out of the field, in pixels. */
const RIM_DEPTH = 3;
/** Past this the pixel is mark, not rim, and is left fully opaque. */
const RIM_MAX_ALPHA = 0.9;
/** Edge patch sampled to seed the field colour. */
const CORNER = 8;
/**
 * How far in from the corner that patch sits, as a share of the tile. Plenty of
 * source tiles are a white card with rounded corners, so a patch flush against
 * the corner lands in the transparent cut and reports "no field" for exactly
 * the plates worth removing.
 */
const CORNER_INSET = 0.1;
/** Share of the patch that must be opaque for it to describe a field at all. */
const CORNER_OPACITY = 0.6;
/** How close two patches must be to count as reading the same flat field. */
const CORNER_TOLERANCE = 14;

const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/**
 * Plain perceived brightness, used only to ask "is this field a light neutral".
 * Contrast questions go through the WCAG pair below instead, which is a
 * different (gamma-correct) formula on purpose.
 */
const luminance = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/** sRGB -> linear, per WCAG, memoised over the 256 possible channel values. */
const LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const relativeLuminance = ([r, g, b]) =>
  0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
const CREAM_LUMA = relativeLuminance(CREAM);
const contrastWith = (surfaceLuma, pixel) => {
  const l = relativeLuminance(pixel);
  return (Math.max(l, surfaceLuma) + 0.05) / (Math.min(l, surfaceLuma) + 0.05);
};
const saturation = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

/**
 * How opaque a pixel would have to be if it were mark colour composited over
 * `field`. Solving `P = a*C + (1-a)*F` for the smallest `a` that keeps C in
 * range gives this per-channel maximum, which is 0 on the field itself, 1 on a
 * fully opaque mark pixel, and the true coverage across an antialiased rim.
 */
function alphaOver(pixel, field) {
  let best = 0;
  for (let c = 0; c < 3; c += 1) {
    const range = Math.max(field[c], 255 - field[c]) || 1;
    const alpha = Math.abs(pixel[c] - field[c]) / range;
    if (alpha > best) best = alpha;
  }
  return best;
}

function patchColour(data, width, x0, y0) {
  const channels = [[], [], []];
  for (let y = y0; y < y0 + CORNER; y += 1) {
    for (let x = x0; x < x0 + CORNER; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      for (let c = 0; c < 3; c += 1) channels[c].push(data[i + c]);
    }
  }
  // Mostly transparent here: a transparent surround, not a field.
  if (channels[0].length < CORNER * CORNER * CORNER_OPACITY) return null;
  // Median rather than mean so a stray pixel of the mark clipping the corner
  // does not drag the estimate off the field colour.
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
}

/**
 * The box the artwork actually occupies. Normalization pads a non-square mark
 * with transparency, and a white card inside that padding is invisible to a
 * probe aimed at the tile's own corners — so every measurement below is taken
 * against this box rather than the full tile.
 */
function contentBox(bitmap) {
  const { width, height, data } = bitmap;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0
    ? null
    : { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The flat field colour the content box's border patches agree on.
 *
 * Eight probes rather than four corners: a wide masthead scaled to fill the
 * tile puts the mark itself under the corner patches, and sampling only there
 * reports "no field" for exactly the white cards worth removing. The mid-edge
 * probes sit where such a mark rarely reaches, and the agreement bar scales
 * with how many probes came back so a mark covering half the border still
 * cannot outvote the field.
 */
function detectField(bitmap, box) {
  const { width, data } = bitmap;
  const inset = Math.round(Math.min(box.width, box.height) * CORNER_INSET);
  const left = box.minX + inset;
  const top = box.minY + inset;
  const right = box.maxX - inset - CORNER + 1;
  const bottom = box.maxY - inset - CORNER + 1;
  if (right < left || bottom < top) return null;
  const midX = Math.round((left + right) / 2);
  const midY = Math.round((top + bottom) / 2);
  const patches = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
    [midX, top],
    [midX, bottom],
    [left, midY],
    [right, midY],
  ]
    .map(([x, y]) => patchColour(data, width, x, y))
    .filter(Boolean);
  if (patches.length < 3) return null;

  let field = null;
  let agreement = 0;
  for (const candidate of patches) {
    const near = patches.filter((other) => distance(candidate, other) <= CORNER_TOLERANCE);
    if (near.length > agreement) {
      agreement = near.length;
      field = [0, 1, 2].map((c) =>
        Math.round(near.reduce((sum, p) => sum + p[c], 0) / near.length),
      );
    }
  }
  // A clear majority of whatever came back, and never fewer than three probes.
  return agreement >= Math.max(3, Math.ceil(patches.length * 0.6)) ? field : null;
}

/** Every pixel reachable from the content box's border through the field colour. */
function floodField(bitmap, field, box) {
  const { width, height, data } = bitmap;
  const inField = new Uint8Array(width * height);
  const stack = [];
  const visit = (x, y) => {
    if (x < box.minX || y < box.minY || x > box.maxX || y > box.maxY) return;
    const i = y * width + x;
    if (inField[i]) return;
    const o = i * 4;
    const transparent = data[o + 3] < 16;
    if (!transparent && alphaOver([data[o], data[o + 1], data[o + 2]], field) > FIELD_ALPHA) return;
    inField[i] = 1;
    stack.push(i);
  };
  for (let x = box.minX; x <= box.maxX; x += 1) {
    visit(x, box.minY);
    visit(x, box.maxY);
  }
  for (let y = box.minY; y <= box.maxY; y += 1) {
    visit(box.minX, y);
    visit(box.maxX, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  return inField;
}

/**
 * Classifies a tile: `{ verdict, field, ... }` where verdict is one of
 * `strip` | `no-field` | `brand-tile` | `pale-mark` | `blank`.
 */
export function inspectBackground(image) {
  const { width, height, data } = image.bitmap;
  const total = width * height;
  const box = contentBox(image.bitmap);
  if (!box) return { verdict: 'blank', field: null };
  const field = detectField(image.bitmap, box);
  if (!field) return { verdict: 'no-field', field: null };

  const inField = floodField(image.bitmap, field, box);
  const boxArea = box.width * box.height;
  let fieldOpaque = 0;
  let mark = 0;
  let visibleOnLight = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (inField[i]) {
      if (data[o + 3] >= 16) fieldOpaque += 1;
      continue;
    }
    if (data[o + 3] < 16) continue;
    const pixel = [data[o], data[o + 1], data[o + 2]];
    mark += 1;
    if (
      contrastWith(CREAM_LUMA, pixel) >= MIN_CONTRAST ||
      distance(pixel, CREAM) >= CHROMA_DISTANCE
    )
      visibleOnLight += 1;
  }

  const stats = {
    field,
    inField,
    box,
    fieldRatio: fieldOpaque / boxArea,
    markRatio: mark / total,
    visibleOnLight: mark ? visibleOnLight / mark : 0,
  };
  if (stats.fieldRatio < MIN_BG_RATIO) return { verdict: 'no-field', ...stats };
  if (luminance(field) < NEUTRAL_LUM || saturation(field) > NEUTRAL_SAT)
    return { verdict: 'brand-tile', ...stats };
  if (stats.markRatio < 0.004) return { verdict: 'blank', ...stats };
  if (stats.visibleOnLight < MIN_VISIBLE_LIGHT) return { verdict: 'pale-mark', ...stats };
  return { verdict: 'strip', ...stats };
}

/**
 * Clears the field to transparency in place and un-mattes the antialiased rim
 * against it, so the mark keeps a clean edge instead of the pale halo a hard
 * threshold would leave. Only the few pixels adjacent to the field are touched;
 * a large pale region inside the mark is left alone.
 */
export function stripBackground(image, inspection) {
  const { width, height, data } = image.bitmap;
  const { field, inField } = inspection;
  const total = width * height;

  // Walk out of the field one ring at a time, so a pale area that merely
  // resembles the field cannot be eaten from across the tile.
  const rimAlpha = new Float32Array(total).fill(-1);
  let frontier = [];
  for (let i = 0; i < total; i += 1) if (inField[i]) frontier.push(i);
  const seen = new Uint8Array(inField);
  for (let depth = 0; depth < RIM_DEPTH && frontier.length; depth += 1) {
    const next = [];
    for (const i of frontier) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (seen[j]) continue;
        const o = j * 4;
        if (data[o + 3] < 16) continue;
        const alpha = alphaOver([data[o], data[o + 1], data[o + 2]], field);
        if (alpha >= RIM_MAX_ALPHA) continue;
        seen[j] = 1;
        rimAlpha[j] = alpha;
        next.push(j);
      }
    }
    frontier = next;
  }

  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (inField[i]) {
      data[o + 3] = 0;
      continue;
    }
    const alpha = rimAlpha[i];
    if (alpha < 0) continue;
    if (alpha <= 0.004) {
      data[o + 3] = 0;
      continue;
    }
    // Undo the matte: recover the mark's own colour at this coverage.
    for (let c = 0; c < 3; c += 1) {
      const value = (data[o + c] - (1 - alpha) * field[c]) / alpha;
      data[o + c] = Math.max(0, Math.min(255, Math.round(value)));
    }
    data[o + 3] = Math.round(alpha * data[o + 3]);
  }
  return image;
}

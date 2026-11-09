import { jpegMedia, media } from "@/lib/media";
import { tutorialImagePath } from "@/lib/tutorials";

/**
 * The pieces every social-card image is built from: the palette, the fonts,
 * the asset loader, and the two lockups that appear on all of them.
 *
 * The renderer behind `next/og` is satori, which is not a browser: it has no
 * cascade, no `em` units and no font fallback of its own, so everything here
 * is absolute pixels and every colour is a literal. The values are the same
 * ones `globals.css` defines as custom properties — kept in sync by hand,
 * because a stylesheet cannot reach this renderer.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** From the `rosewood` light theme in `globals.css`. */
export const OG_COLORS = {
  background: "#FCFAF5",
  card: "#FFFFFF",
  border: "#E4DFD1",
  foreground: "#1A2E2A",
  foregroundSoft: "#6B7A77",
  foregroundMuted: "#94A39F",
  primary: "#B1525F",
  primarySoft: "#F8E7EA",
  /** The three colours of the wordmark, in the order it sets them. */
  wordmarkMoney: "#F37D57",
  wordmarkTwo: "#F6B750",
  wordmarkTime: "#B1525F",
  /** The hardware shell in `components/home/device-frame.tsx`. */
  bezel: "#14100F",
} as const;

/* ------------------------------------------------------------------ fonts -- */

/*
 * Each URL is written out in full, in this shape, because vinext recognises
 * `fetch(new URL("<literal>", import.meta.url)).then((res) => res.arrayBuffer())`
 * and inlines the file into the Worker at build time. A Worker has no
 * filesystem to read it from later.
 */
const FONT_FILES = [
  {
    load: () =>
      fetch(new URL("../../assets/fonts/DMSans-Regular.ttf", import.meta.url)).then((res) => res.arrayBuffer()),
    weight: 400,
  },
  {
    load: () =>
      fetch(new URL("../../assets/fonts/DMSans-Bold.ttf", import.meta.url)).then((res) => res.arrayBuffer()),
    weight: 700,
  },
  {
    load: () =>
      fetch(new URL("../../assets/fonts/DMSans-ExtraBold.ttf", import.meta.url)).then((res) => res.arrayBuffer()),
    weight: 800,
  },
] as const;

type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700 | 800;
  style: "normal";
};

const OG_FALLBACK_FAMILY = "Noto Fallback";

/** Set once on the backdrop; satori inherits it down the tree. */
const OG_FONT_FAMILY = `DM Sans, ${OG_FALLBACK_FAMILY}`;

/**
 * Every code point one of the font files can draw. satori has no fallback of
 * its own, so a character nothing covers comes out as an empty box, and the
 * only way to know in advance is to read the font's own character map.
 */
function codePoints(font: Buffer) {
  const covered = new Set<number>();
  const tables = font.readUInt16BE(4);

  let cmap: number | undefined;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (font.toString("ascii", record, record + 4) === "cmap") {
      cmap = font.readUInt32BE(record + 8);
    }
  }

  if (cmap === undefined) {
    return covered;
  }

  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const table = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
    const format = font.readUInt16BE(table);

    if (format === 4) {
      const segments = font.readUInt16BE(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + segments * 2 + 2;

      for (let segment = 0; segment < segments; segment++) {
        const end = font.readUInt16BE(ends + segment * 2);
        const start = font.readUInt16BE(starts + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code++) {
          covered.add(code);
        }
      }
    } else if (format === 12) {
      const groups = font.readUInt32BE(table + 12);
      for (let group = 0; group < groups; group++) {
        const at = table + 16 + group * 12;
        const start = font.readUInt32BE(at);
        const end = font.readUInt32BE(at + 4);
        for (let code = start; code <= end; code++) {
          covered.add(code);
        }
      }
    }
  }

  return covered;
}

let dmSans: Promise<{ covered: Set<number>; faces: OgFont[] }> | undefined;

/**
 * DM Sans, the same family the site loads, as static instances rather than
 * the variable font — satori only reads static weights. The files are
 * committed rather than fetched so a build never depends on Google Fonts
 * being reachable.
 */
function dmSansFaces() {
  dmSans ??= (async () => {
    const faces = await Promise.all(
      FONT_FILES.map(async ({ load, weight }) => ({
        name: "DM Sans",
        data: Buffer.from(await load()),
        weight,
        style: "normal" as const,
      })),
    );

    // All three weights are instances of one variable font, so reading the
    // coverage off any of them describes the family.
    return { covered: codePoints(faces[0].data), faces };
  })();

  return dmSans;
}

/**
 * The Noto family that draws the script a locale is written in. DM Sans only
 * carries Latin, so everything else — and the handful of currency symbols it
 * skips, such as the peso sign — comes from Noto.
 */
const NOTO_FAMILY: Record<string, string> = {
  hi: "Noto+Sans+Devanagari",
  ja: "Noto+Sans+JP",
  ko: "Noto+Sans+KR",
  th: "Noto+Sans+Thai",
  zh: "Noto+Sans+SC",
};

const subsets = new Map<string, Promise<OgFont[]>>();

/**
 * A Noto subset carrying exactly the characters `text` needs, at the two
 * weights the cards set type in.
 *
 * `next/og` already fetches a fallback like this when it meets a glyph it
 * cannot draw, but only ever at weight 400, which leaves a headline in
 * Japanese or Russian set lighter than the same headline in English. Asking
 * for the weights up front is what keeps the two looking like one design.
 */
async function notoSubset(family: string, text: string): Promise<OgFont[]> {
  const url =
    `https://fonts.googleapis.com/css2?family=${family}:wght@400;700` +
    `&text=${encodeURIComponent(text)}`;

  const css = await fetch(url, {
    headers: {
      // An agent old enough that Google answers with TTF rather than WOFF2,
      // which satori cannot read. The same trick `next/og` itself uses.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
    },
  }).then((response) => {
    if (!response.ok) throw new Error(`Google Fonts CSS: ${response.status}`);
    return response.text();
  });

  const sources = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\((.+?)\)/g)];

  const faces = await Promise.all(
    sources.map(async ([, weight, source]) => {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Google Fonts file: ${response.status}`);
      return { data: Buffer.from(await response.arrayBuffer()), weight: Number(weight) };
    }),
  );

  const regular = faces.find((face) => face.weight === 400) ?? faces[0];
  const bold = faces.find((face) => face.weight === 700) ?? regular;

  if (!regular) {
    return [];
  }

  // Its own family, listed after DM Sans in `OG_FONT_FAMILY`, so satori
  // reaches for it per character rather than for whole runs of text.
  return [
    { name: OG_FALLBACK_FAMILY, data: regular.data, weight: 400, style: "normal" },
    { name: OG_FALLBACK_FAMILY, data: bold.data, weight: 700, style: "normal" },
    { name: OG_FALLBACK_FAMILY, data: bold.data, weight: 800, style: "normal" },
  ];
}

/**
 * The fonts an image needs to draw `text`. Pass every string that ends up on
 * the card: what is missing from DM Sans decides whether a Noto subset is
 * fetched at all, so the Latin locales never touch the network.
 *
 * A failed fetch does not fail the card: `next/og` still falls back on its own
 * for anything left undrawable, which is the behaviour this replaces. Nor is
 * it remembered, so the next card asks Google again.
 */
export async function ogFonts(text = "", locale = "en") {
  const { covered, faces } = await dmSansFaces();

  const missing = [...new Set(text)]
    .filter((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && code > 0x7f && !covered.has(code);
    })
    .join("");

  if (!missing) {
    return faces;
  }

  const family = NOTO_FAMILY[locale.split("-")[0]] ?? "Noto+Sans";
  const key = `${family}:${missing}`;

  let subset = subsets.get(key);
  if (!subset) {
    subset = notoSubset(family, missing).catch((error) => {
      console.error("Failed to load the OG image fallback font.", error);
      subsets.delete(key);
      return [];
    });
    subsets.set(key, subset);
  }

  return [...faces, ...(await subset)];
}

/* ----------------------------------------------------------------- assets -- */

const assets = new Map<string, Promise<string>>();

/**
 * A picture inlined as a data URI, so satori has the bytes in hand rather than
 * a URL to resolve. They are read from the media bucket (`src/lib/media.ts`),
 * where the pages show them from too, once per Worker isolate.
 */
function inline(key: string, load: () => Promise<Response>) {
  let asset = assets.get(key);

  if (!asset) {
    asset = load().then(async (response) => {
      if (!response.ok) {
        throw new Error(`OG image asset ${key}: ${response.status}`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type")?.split(";")[0] || "image/png";
      return `data:${type};base64,${data.toString("base64")}`;
    });
    // A failed fetch is not remembered, so the next card tries again.
    asset.catch(() => assets.delete(key));
    assets.set(key, asset);
  }

  return asset;
}

export function appIconAsset() {
  return inline("icon", () => fetch(media("/icon.png")));
}

export function clayIconAsset(name: string) {
  return inline(`clay-icons/${name}`, () => fetch(media(`/clay-icons/${name}.png`)));
}

export function categoryIconAsset(name: string) {
  return inline(`category-icons/${name}`, () => fetch(media(`/category-icons/${name}.png`)));
}

/**
 * One step's capture, by the `image` name the tutorial catalog carries. The
 * captures are WebP, which satori cannot read, so this asks for a JPEG copy.
 * In the deployed Worker that is `cf.image` on the plain URL: a Worker's own
 * request for a `/cdn-cgi/image/` URL gets a 404. Off Cloudflare (a local
 * build) `cf` is ignored and the WebP comes back, so it falls back to the
 * `/cdn-cgi/image/` URL, which works from there.
 */
export function tutorialShotAsset(name: string) {
  const path = tutorialImagePath(name);
  return inline(`tutorials/${name}`, async () => {
    const response = await fetch(media(path), {
      cf: { image: { format: "jpeg", quality: 90 } },
    });
    if (!response.ok || response.headers.get("content-type") !== "image/webp") {
      return response;
    }
    return fetch(jpegMedia(path));
  });
}

/* ---------------------------------------------------------------- lockups -- */

/**
 * The page background: the flat off-white the site uses, with two soft blooms
 * in the brand colours so a 1200x630 field of one colour does not read as a
 * blank slide.
 */
export function OgBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: OG_COLORS.background,
        backgroundImage: [
          `radial-gradient(760px 520px at 88% -12%, ${OG_COLORS.primarySoft} 0%, rgba(248,231,234,0) 62%)`,
          "radial-gradient(620px 440px at -6% 108%, rgba(246,183,80,0.20) 0%, rgba(246,183,80,0) 60%)",
        ].join(","),
        color: OG_COLORS.foreground,
        display: "flex",
        flexDirection: "column",
        fontFamily: OG_FONT_FAMILY,
        height: "100%",
        padding: "56px 64px",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The header lockup, matching `components/brand.tsx`: the app icon, then the
 * wordmark with its subscript "2". `size` is the cap height of the word, and
 * everything else is derived from it the way the `em` units on the web one
 * are.
 */
export async function OgWordmark({ size = 34 }: { size?: number }) {
  const icon = await appIconAsset();

  return (
    <div style={{ alignItems: "center", display: "flex", gap: size * 0.42 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt=""
        width={size * 1.5}
        height={size * 1.5}
        style={{ borderRadius: size * 0.42 }}
      />
      <div
        style={{
          alignItems: "baseline",
          display: "flex",
          fontSize: size,
          fontWeight: 800,
          letterSpacing: -size * 0.04,
        }}
      >
        <span style={{ color: OG_COLORS.wordmarkMoney }}>Money</span>
        <span
          style={{
            color: OG_COLORS.wordmarkTwo,
            fontSize: size * 0.5,
            transform: `translateY(${-size * 0.44}px)`,
          }}
        >
          2
        </span>
        <span style={{ color: OG_COLORS.wordmarkTime }}>Time</span>
      </div>
    </div>
  );
}

/** The small uppercase label above a heading, from the `.eyebrow` class. */
export function OgEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: OG_COLORS.primary,
        display: "flex",
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: 2.8,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A phone, cropped by the bottom of the card the way the hero crops its
 * carousel. `height` is the height of the visible part, not of the phone.
 *
 * The proportions are `components/home/device-frame.tsx`: a bezel about a
 * thirtieth of the width, and a screen radius concentric with the shell's
 * rather than an independent guess.
 */
export function OgPhone({
  height,
  screenshot,
  width,
}: {
  height: number;
  screenshot: string;
  width: number;
}) {
  const bezel = Math.round(width * 0.032);
  const radius = width * 0.145;
  const screen = width - bezel * 2;

  return (
    <div
      style={{
        backgroundColor: OG_COLORS.bezel,
        borderRadius: radius,
        boxShadow: "0 30px 70px rgba(26,46,42,0.28)",
        display: "flex",
        height,
        overflow: "hidden",
        padding: bezel,
        width,
      }}
    >
      {/*
        The radius sits on the capture itself. satori clips an image to its own
        corners but not to an ancestor's, so rounding the frame alone leaves a
        square screen inside a rounded shell.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshot}
        alt=""
        width={screen}
        style={{ borderRadius: radius - bezel, width: screen }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- type -- */

/**
 * Picks a display size that keeps a headline inside `lines` rows of `width`
 * pixels. The 32 locales say the same thing in wildly different lengths, and
 * satori has no way to shrink text to fit, so the size is chosen up front
 * from how much text there is.
 *
 * The width of a character is estimated at a share of the font size — 0.52
 * for the Latin scripts DM Sans draws, and 1.05 for the ideographic ones,
 * which are square and set without spaces.
 */
export function fitHeadline({
  lines,
  max,
  min,
  text,
  width,
}: {
  lines: number;
  max: number;
  min: number;
  text: string;
  width: number;
}) {
  const wide = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) ?? [])
    .length;
  const cost = text.length - wide + wide * 2.02;
  const size = (width * lines) / (cost * 0.52);

  return Math.round(Math.max(min, Math.min(max, size)));
}

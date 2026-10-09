// Generates the bundled emoji catalog that backs the Emoji tab of the shared
// icon picker. Emits constants/emojiCatalog.generated.ts.
//
// Re-run only when deliberately moving to a newer Emoji version:
//   node scripts/generate-emoji-catalog.mjs
//
// Pinned to Emoji 15.0 on purpose. Glyphs from 16.0 and later render as tofu
// boxes on iOS 17 and Android 14, which are still well within the supported
// range; a slightly smaller set where every glyph actually draws beats a
// larger one peppered with blank squares. Bump EMOJI_VERSION once the floor
// moves.
//
// Two sources, both fetched at generate time so nothing is added to the app's
// runtime dependencies:
//   - emoji-test.txt  glyphs, group/subgroup headers, qualification status,
//                     and the CLDR short name
//   - CLDR annotations  the keyword list that makes search useful ("burger"
//                     finding the hamburger). Pass --no-keywords to skip.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATED_FILE = path.join(REPO_ROOT, 'constants/emojiCatalog.generated.ts');

const EMOJI_VERSION = '15.0';
const CLDR_RELEASE = 'release-44';
const EMOJI_TEST_URL = `https://unicode.org/Public/emoji/${EMOJI_VERSION}/emoji-test.txt`;
const CLDR_ANNOTATIONS_URL = `https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_RELEASE}/common/annotations/en.xml`;

/**
 * emoji-test.txt group name → our section id. `Component` (skin-tone and hair
 * modifiers) is deliberately absent: those are not standalone emoji.
 */
const GROUP_IDS = {
  'Smileys & Emotion': 'smileys',
  'People & Body': 'people',
  'Animals & Nature': 'animals',
  'Food & Drink': 'food',
  'Travel & Places': 'travel',
  Activities: 'activities',
  Objects: 'objects',
  Symbols: 'symbols',
  Flags: 'flags',
};

const GROUP_ORDER = [
  'smileys',
  'people',
  'animals',
  'food',
  'travel',
  'activities',
  'objects',
  'symbols',
  'flags',
];

const SKIN_TONE_RANGE = [0x1f3fb, 0x1f3ff];
/** Tag characters, used only by subdivision flags (England, Scotland, Wales). */
const TAG_RANGE = [0xe0020, 0xe007f];

function codePoints(text) {
  return Array.from(text).map((char) => char.codePointAt(0));
}

function inRange(codePoint, [low, high]) {
  return codePoint >= low && codePoint <= high;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.text();
}

function parseEmojiTest(text) {
  const out = [];
  let group = null;
  for (const line of text.split('\n')) {
    const groupMatch = line.match(/^# group: (.+)$/);
    if (groupMatch) {
      group = GROUP_IDS[groupMatch[1].trim()] ?? null;
      continue;
    }
    if (line.startsWith('#') || !line.trim()) continue;

    // 1F600 ; fully-qualified # 😀 E1.0 grinning face
    const match = line.match(/^([0-9A-F ]+);\s*([a-z-]+)\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/);
    if (!match) continue;
    const [, , status, glyph, name] = match;
    // Minimally- and un-qualified rows are duplicates of a fully-qualified one.
    if (status !== 'fully-qualified') continue;
    if (!group) continue;

    const points = codePoints(glyph);
    // Skin-tone variants would multiply the catalog ~6x for no picker value.
    if (points.some((cp) => inRange(cp, SKIN_TONE_RANGE))) continue;
    // Subdivision flags (tag sequences) are poorly supported; country flags,
    // which use regional indicators, are kept.
    if (points.some((cp) => inRange(cp, TAG_RANGE))) continue;

    out.push({ e: glyph, n: name.trim().toLowerCase(), g: GROUP_ORDER.indexOf(group) });
  }
  return out;
}

/** `<annotation cp="🍔">burger | fast food | …</annotation>` → keyword string. */
function parseAnnotations(xml) {
  const keywords = new Map();
  const pattern = /<annotation cp="([^"]+)"(?![^>]*type="tts")>([^<]*)<\/annotation>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const [, cp, body] = match;
    const terms = body
      .split('|')
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);
    if (terms.length) keywords.set(cp, terms.join(' '));
  }
  return keywords;
}

async function main() {
  const withKeywords = !process.argv.includes('--no-keywords');

  const emojiTest = await fetchText(EMOJI_TEST_URL);
  const entries = parseEmojiTest(emojiTest);
  if (entries.length === 0) throw new Error('Parsed zero emoji — the source format likely changed');

  let keywords = new Map();
  if (withKeywords) {
    keywords = parseAnnotations(await fetchText(CLDR_ANNOTATIONS_URL));
  }

  const seen = new Set();
  const rows = [];
  for (const entry of entries) {
    if (seen.has(entry.e)) continue;
    seen.add(entry.e);
    // Drop keywords that merely repeat the name so the payload stays small.
    const raw = keywords.get(entry.e) ?? '';
    const nameTerms = new Set(entry.n.split(/\s+/));
    const extra = raw
      .split(/\s+/)
      .filter((term) => term && !nameTerms.has(term))
      .join(' ');
    rows.push({ ...entry, k: extra });
  }

  const body = rows
    .map(
      (row) =>
        `  { e: ${JSON.stringify(row.e)}, n: ${JSON.stringify(row.n)}, g: ${row.g}` +
        (row.k ? `, k: ${JSON.stringify(row.k)} }` : ' }'),
    )
    .join(',\n');

  const out = `// AUTO-GENERATED by scripts/generate-emoji-catalog.mjs — do not edit by hand.
// Source: Unicode emoji-test.txt ${EMOJI_VERSION} + CLDR ${CLDR_RELEASE} en annotations.
// Fully-qualified base emoji only: no skin-tone variants, no subdivision flags.

export interface EmojiMeta {
  /** The glyph. Stored on the row as \`emoji:<e>\`. */
  e: string;
  /** CLDR short name, lowercase. */
  n: string;
  /** Index into EMOJI_GROUPS. */
  g: number;
  /** Extra lowercase search terms not already in the name. Absent when none. */
  k?: string;
}

/** Section ids. Display labels are i18n keys (\`category_icon.group_<id>\`). */
export const EMOJI_GROUPS: readonly string[] = ${JSON.stringify(GROUP_ORDER)};

export const EMOJI_CATALOG: readonly EmojiMeta[] = [
${body},
];
`;

  await fs.writeFile(GENERATED_FILE, out, 'utf8');
  const byGroup = GROUP_ORDER.map(
    (group, index) => `${group}=${rows.filter((row) => row.g === index).length}`,
  ).join(' ');
  console.log(
    `Generated ${rows.length} emoji → ${path.relative(REPO_ROOT, GENERATED_FILE)}\n  ${byGroup}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

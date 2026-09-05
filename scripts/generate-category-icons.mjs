// Generates the bundled icon-pack registry from the PNGs under
// assets/icon-packs/. Emits constants/categoryIcons.generated.ts.
//
// Layout is the source of truth:
//
//   assets/icon-packs/<pack>/<Group>/<icon>.png
//
// The pack folder becomes a pack id, the group folder becomes a section, and
// the filename becomes the icon id stored on the row. Adding a pack or a
// section is therefore a matter of adding folders and re-running this script.
//
// Ids are pack-qualified (`clay/meal`) EXCEPT in the default pack, where they
// stay bare (`meal`). Every row written before packs existed stores a bare id,
// so keeping default bare means no data migration, while qualifying the rest
// lets two packs both ship a `meal` without colliding.
//
// The trailing segment is the icon's "concept". Display name, search keywords
// and the widget stand-in emoji are all keyed by concept, not by id, so a new
// pack that reuses existing concepts needs no metadata at all.
//
// Display names, search keywords and section order live in the hand-maintained
// constants/categoryIconGroups.ts: a filename cannot describe artwork, and the
// section order is editorial rather than alphabetical.
//
// Re-run after the icon set changes:
//   node scripts/generate-category-icons.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import prettier from 'prettier';

const { PNG } = pngjs;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(REPO_ROOT, 'assets/icon-packs');
const ATLAS_DIR = path.join(REPO_ROOT, 'assets/icon-atlases');
const GENERATED_FILE = path.join(REPO_ROOT, 'constants/categoryIcons.generated.ts');
const DEFAULT_PACK = 'default';
const ICON_SIZE = 128;
const ATLAS_COLUMNS = 10;

/** `Food and drink` → `food-and-drink`. */
function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `grocery-basket` → `Grocery Basket`. */
function titleCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function tsString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

async function readDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const packNames = await readDirs(PACKS_DIR);
  if (packNames.length === 0) throw new Error(`No icon packs found under ${PACKS_DIR}`);

  const packs = [];
  const icons = [];
  const atlases = [];
  const seenIds = new Map();

  // Atlases are derived assets. Rebuilding the directory prevents renamed or
  // removed groups from leaving stale PNGs in native and OTA bundles.
  await fs.rm(ATLAS_DIR, { recursive: true, force: true });

  for (const packName of packNames) {
    const packId = slugify(packName);
    const packDir = path.join(PACKS_DIR, packName);
    const groupNames = await readDirs(packDir);
    let count = 0;

    for (const groupName of groupNames) {
      const groupId = slugify(groupName);
      const groupDir = path.join(packDir, groupName);
      const files = (await fs.readdir(groupDir))
        .filter((file) => file.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.localeCompare(b));

      if (files.length === 0) continue;

      const atlasId = `${packId}/${groupId}`;
      const columns = Math.min(ATLAS_COLUMNS, files.length);
      const rows = Math.ceil(files.length / columns);
      const atlasWidth = columns * ICON_SIZE;
      const atlasHeight = rows * ICON_SIZE;
      const atlas = new PNG({ width: atlasWidth, height: atlasHeight });

      for (const [index, file] of files.entries()) {
        const concept = file.slice(0, file.length - '.png'.length);
        const id = packId === DEFAULT_PACK ? concept : `${packId}/${concept}`;
        const previous = seenIds.get(id);
        if (previous) {
          throw new Error(
            `Duplicate icon id "${id}": ${previous} and ${packName}/${groupName}. ` +
              `Within one pack, every icon filename must be unique.`,
          );
        }
        seenIds.set(id, `${packName}/${groupName}`);

        const iconPng = PNG.sync.read(await fs.readFile(path.join(groupDir, file)));
        if (iconPng.width !== ICON_SIZE || iconPng.height !== ICON_SIZE) {
          throw new Error(
            `${packName}/${groupName}/${file} is ${iconPng.width}x${iconPng.height}; ` +
              `category icons must be ${ICON_SIZE}x${ICON_SIZE}.`,
          );
        }

        const column = index % columns;
        const row = Math.floor(index / columns);
        PNG.bitblt(iconPng, atlas, 0, 0, ICON_SIZE, ICON_SIZE, column * ICON_SIZE, row * ICON_SIZE);
        icons.push({
          id,
          concept,
          pack: packId,
          group: groupId,
          fallbackName: titleCase(concept),
          atlasId,
          column,
          row,
        });
        count += 1;
      }

      const atlasDir = path.join(ATLAS_DIR, packName);
      const atlasFile = `${groupId}.png`;
      await fs.mkdir(atlasDir, { recursive: true });
      await fs.writeFile(path.join(atlasDir, atlasFile), PNG.sync.write(atlas));
      atlases.push({
        id: atlasId,
        require: `../assets/icon-atlases/${packName}/${atlasFile}`,
        width: atlasWidth,
        height: atlasHeight,
      });
    }

    packs.push({ id: packId, name: packName, count });
  }

  // Single-quoted so the emitted file is already Prettier-clean; no pack or
  // group folder name contains a quote.
  const atlasLines = atlases
    .map(
      (atlas) =>
        `  '${atlas.id}': { source: require('${atlas.require}'), width: ${atlas.width}, height: ${atlas.height} },`,
    )
    .join('\n');

  const sourceLines = icons
    .map(
      (icon) =>
        `  '${icon.id}': { atlas: CATEGORY_ICON_ATLASES['${icon.atlasId}'], column: ${icon.column}, row: ${icon.row} },`,
    )
    .join('\n');

  const metaLines = icons
    .map(
      (icon) =>
        `  { id: '${icon.id}', concept: '${icon.concept}', pack: '${icon.pack}', ` +
        `group: '${icon.group}', fallbackName: ${tsString(icon.fallbackName)} },`,
    )
    .join('\n');

  const packLines = packs
    .map((pack) => `  { id: '${pack.id}', name: ${tsString(pack.name)} },`)
    .join('\n');

  const out = `// AUTO-GENERATED by scripts/generate-category-icons.mjs — do not edit by hand.
// Source layout: assets/icon-packs/<pack>/<Group>/<icon>.png
import type { ImageSourcePropType } from 'react-native';

export interface GeneratedIconPack {
  /** Slug of the pack folder. */
  id: string;
  /** Pack folder name, used as the fallback label. */
  name: string;
}

export interface GeneratedCategoryIcon {
  /** Stable id stored on categories.icon / accounts.goal_emoji /
   *  budget_templates.emoji. Bare filename in the default pack, \`pack/name\`
   *  elsewhere. */
  id: string;
  /** Trailing segment of the id. Metadata and the widget stand-in emoji are
   *  keyed by this, so packs sharing a concept share its wording. */
  concept: string;
  /** Slug of the pack folder this icon came from. */
  pack: string;
  /** Slug of the group folder, i.e. its section in the picker. */
  group: string;
  /** Title-cased id, used when categoryIconGroups.ts sets no explicit name. */
  fallbackName: string;
}

export interface GeneratedCategoryIconAtlas {
  /** Static React Native image source for this section atlas. */
  source: ImageSourcePropType;
  /** Natural atlas dimensions in pixels. */
  width: number;
  height: number;
}

export interface GeneratedCategoryIconSource {
  atlas: GeneratedCategoryIconAtlas;
  /** Zero-based 128px cell coordinates within the atlas. */
  column: number;
  row: number;
}

export const ICON_PACKS: GeneratedIconPack[] = [
${packLines}
];

export const CATEGORY_ICON_CELL_SIZE = ${ICON_SIZE};

const CATEGORY_ICON_ATLASES: Record<string, GeneratedCategoryIconAtlas> = {
${atlasLines}
};

export const CATEGORY_ICON_SOURCES: Record<string, GeneratedCategoryIconSource> = {
${sourceLines}
};

export const GENERATED_CATEGORY_ICONS: GeneratedCategoryIcon[] = [
${metaLines}
];
`;

  await fs.mkdir(path.dirname(GENERATED_FILE), { recursive: true });
  const prettierConfig = (await prettier.resolveConfig(GENERATED_FILE)) ?? {};
  await fs.writeFile(
    GENERATED_FILE,
    await prettier.format(out, { ...prettierConfig, filepath: GENERATED_FILE }),
    'utf8',
  );

  const summary = packs.map((pack) => `${pack.name}=${pack.count}`).join(' ');
  console.log(
    `Generated ${icons.length} icons across ${packs.length} pack(s) → ` +
      `${path.relative(REPO_ROOT, GENERATED_FILE)}\n  ${summary}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

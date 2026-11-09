/**
 * Copies the artwork the Web Dashboard (app.money2time.com) needs from the
 * app (apps/mobile), shrunk for the web.
 *
 *   media/mascots/<pose>.png                 <- assets/mascots (byte copy)
 *   public/dashboard-assets/accounts/<id>.webp       <- assets/account-logos/<id>.png
 *   public/dashboard-assets/subscriptions/<id>.webp  <- assets/subscription-logos/<id>.png
 *   public/dashboard-assets/items/<id>.webp          <- assets/items/<id>.png
 *   public/dashboard-assets/categories/<id>.webp     <- assets/icon-packs/default/<group>/<id>.png
 *   src/lib/backup/category-icon-groups.generated.ts
 *                                             <- the default pack's group folders, in the
 *                                                app's picker order, with its names and
 *                                                search words (constants/categoryIconGroups.ts)
 *                                                and the name-to-icon suggestions
 *                                                (utils/categoryIconMatcher.ts)
 *   src/lib/backup/emoji-catalog.generated.ts <- constants/emojiCatalog.generated.ts, less the
 *                                                emoji the phone refuses from the web
 *   src/components/dashboard/edit/item-icons.generated.ts
 *                                             <- the item-icon library by section, with names
 *                                                (constants/itemIcons.generated.ts)
 *   src/lib/backup/logo-names.generated.ts    <- the names and countries of the account and
 *                                                subscription logos (constants/*Logos.generated.ts)
 *   public/dashboard-assets/card-designs/<genre>/<name>.webp
 *                                             <- assets/card-designs/<genre>/<name>.webp
 *   src/lib/backup/card-designs.generated.ts  <- the built-in card designs, their genres in the
 *                                                app's order, text tone and band strength
 *                                                (constants/cardDesigns*.ts)
 *
 * A backup refers to these by id (`logo_id: "malaysia/maybank"`,
 * `icon_id: "smartphone"`), so every id the app can write needs a file here.
 * Logos render at 32px and item icons at 40px, so 64px and 80px WebP stay sharp on
 * retina at a fraction of the source size. It also writes
 * src/lib/backup/assets.generated.ts so the dashboard knows which ids exist
 * and falls back to a lettermark for the rest.
 *
 * Usage: node scripts/sync-dashboard-assets.mjs [path/to/money2time/apps/mobile]
 * The dashboard art lands in public/dashboard-assets and ships with the site, so a
 * commit is all it takes. The mascots it copies go to media/mascots, which the
 * marketing pages share: publish those with node scripts/upload-media.mjs.
 * Uses `sharp`, which Next.js already installs for image optimisation.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import sharp from "sharp";

const APP = process.argv[2] ?? new URL("../../mobile/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;
const ASSETS = join(APP, "assets");

if (!existsSync(ASSETS)) {
  console.error(`App assets not found at ${ASSETS}`);
  process.exit(1);
}

const MASCOTS = ["laptop", "presenting", "searching", "sleeping", "thinking"];
for (const pose of MASCOTS) {
  copyFileSync(join(ASSETS, "mascots", `${pose}.png`), join(ROOT, "media/mascots", `${pose}.png`));
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith(".png") ? [full] : [];
  });
}

async function convert(sourceDir, targetDir, size, { flatten = false } = {}) {
  const outDir = join(ROOT, "public/dashboard-assets", targetDir);
  rmSync(outDir, { recursive: true, force: true });
  const ids = [];
  for (const file of walk(join(ASSETS, sourceDir)).sort()) {
    const path = relative(join(ASSETS, sourceDir), file).replace(/\.png$/, "");
    // Icon packs file each icon under a group folder, but the id is the name.
    const id = flatten ? path.split("/").pop() : path;
    const out = join(outDir, `${id}.webp`);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(file)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(out);
    ids.push(id);
  }
  return ids;
}

const accounts = await convert("account-logos", "accounts", 64);
const subscriptions = await convert("subscription-logos", "subscriptions", 64);
const items = await convert("items", "items", 80);
const categories = await convert("icon-packs/default", "categories", 64, { flatten: true });

const list = (ids) => ids.map((id) => `  "${id}",`).join("\n");
writeFileSync(
  join(ROOT, "src/lib/backup/assets.generated.ts"),
  `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.

/** Account logos the app ships, keyed like \`accounts.logo_id\`. */
export const ACCOUNT_LOGOS: ReadonlySet<string> = new Set([
${list(accounts)}
]);

/** Subscription logos, keyed like \`recurring_rules.logo_id\`. */
export const SUBSCRIPTION_LOGOS: ReadonlySet<string> = new Set([
${list(subscriptions)}
]);

/** Item artwork, keyed like \`items.icon_id\`. */
export const ITEM_ICONS: ReadonlySet<string> = new Set([
${list(items)}
]);

/** The default category icon pack, keyed like \`categories.icon\`. */
export const CATEGORY_ICON_IDS: ReadonlySet<string> = new Set([
${list(categories.sort())}
]);
`,
);

writeFileSync(join(ROOT, "src/lib/backup/category-icon-groups.generated.ts"), categoryIconGroups(APP));
writeFileSync(join(ROOT, "src/lib/backup/emoji-catalog.generated.ts"), emojiCatalog(APP));
writeFileSync(join(ROOT, "src/lib/backup/logo-names.generated.ts"), logoNames(APP));
writeFileSync(join(ROOT, "src/components/dashboard/edit/item-icons.generated.ts"), itemIconGroups(APP, new Set(items)));
writeFileSync(join(ROOT, "src/lib/backup/card-designs.generated.ts"), await cardDesigns(APP));

console.log(
  `mascots: ${MASCOTS.length}, accounts: ${accounts.length}, subscriptions: ${subscriptions.length}, items: ${items.length}, categories: ${categories.length}`,
);

/** A pattern's match, or a stop naming what the app's source no longer has. */
function must(match, what) {
  if (!match) throw new Error(`sync-dashboard-assets: ${what} not found in the app's source`);
  return match;
}

/**
 * The icon picker's sections: each group folder of the default pack, in the
 * app's CATEGORY_ICON_GROUP_ORDER (unlisted folders after, alphabetically),
 * its icons in file order as the app lists them, and the display names and
 * search words the app keeps in CATEGORY_ICON_METADATA.
 */
function categoryIconGroups(app) {
  const packDir = join(app, "assets/icon-packs/default");
  const source = readFileSync(join(app, "constants/categoryIconGroups.ts"), "utf8");
  // The app's files changing shape stops the sync rather than writing empty lists.
  const orderMatch = must(source.match(/CATEGORY_ICON_GROUP_ORDER = \[([\s\S]*?)\]/), "CATEGORY_ICON_GROUP_ORDER");
  const order = [...orderMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const metaMatch = must(source.match(/CATEGORY_ICON_METADATA[^=]*=\s*(\{[\s\S]*?\n\});/), "CATEGORY_ICON_METADATA");
  // A plain object literal of strings, from the app's own repository.
  const metadata = new Function(`return ${metaMatch[1]};`)();
  const slug = (folder) => folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const groups = readdirSync(packDir)
    .filter((folder) => statSync(join(packDir, folder)).isDirectory())
    .map((folder) => ({
      group: slug(folder),
      ids: readdirSync(join(packDir, folder))
        .filter((file) => file.endsWith(".png"))
        .sort()
        .map((file) => file.replace(/\.png$/, "")),
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.group);
      const ib = order.indexOf(b.group);
      if (ia === -1 && ib === -1) return a.group.localeCompare(b.group);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  // The app's suggestions while a new category is named: [icon, pattern], first match wins.
  const matcher = readFileSync(join(app, "utils/categoryIconMatcher.ts"), "utf8");
  const patternsMatch = must(matcher.match(/CATEGORY_ICON_PATTERNS[^=]*=\s*(\[[\s\S]*?\n\]);/), "CATEGORY_ICON_PATTERNS");
  const patterns = new Function(`return ${patternsMatch[1]};`)();
  const meta = {};
  for (const { ids } of groups) {
    for (const id of ids) {
      const entry = metadata[id];
      if (entry) meta[id] = { ...(entry.name ? { name: entry.name } : {}), ...(entry.keywords ? { keywords: entry.keywords } : {}) };
    }
  }
  return `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.

/** The default icon pack by section, in the app's picker order. Labels: \`category_icon.group_<group>\` with \`-\` as \`_\`. */
export const CATEGORY_ICON_GROUPS: { group: string; ids: string[] }[] = ${JSON.stringify(groups, null, 2)};

/** Display names where the id misleads, and search words, from the app's CATEGORY_ICON_METADATA. */
export const CATEGORY_ICON_META: Record<string, { name?: string; keywords?: string }> = ${JSON.stringify(meta, null, 2)};

/** The icon the app suggests for a new category's name (utils/categoryIconMatcher.ts): first match wins. */
export const CATEGORY_ICON_PATTERNS: [string, RegExp][] = [
${patterns.map(({ icon, pattern }) => `  [${JSON.stringify(icon)}, ${pattern.toString()}],`).join("\n")}
];
`;
}

/**
 * The logo pickers' names and countries, read from the app's generated logo
 * catalogs (one `{ id: '…', slug: '…', name: '…', … }` object per logo there), so the
 * web shows "Banco do Brasil" where an id says `brazil/banco-do-brasil`.
 */
function logoNames(app) {
  const read = (file, countryName) => {
    const source = readFileSync(join(app, "constants", file), "utf8");
    const names = {};
    for (const match of source.matchAll(/\{\s*id: '([^']+)',\s*slug: '[^']*',\s*name: '((?:[^'\\]|\\.)*)'/g)) {
      names[match[1]] = match[2].replace(/\\'/g, "'");
    }
    must(Object.keys(names).length, `logo names in constants/${file}`);
    const start = source.indexOf(`export const ${countryName}`);
    must(start !== -1, `${countryName} in constants/${file}`);
    const list = source.slice(start);
    const countries = [...list.slice(0, list.indexOf("];")).matchAll(/\{\s*slug: '([^']+)',\s*name: '((?:[^'\\]|\\.)*)'/g)].map((m) => ({
      slug: m[1],
      name: m[2].replace(/\\'/g, "'"),
    }));
    must(countries.length, `${countryName} entries in constants/${file}`);
    return { names, countries };
  };
  const accounts = read("accountLogos.generated.ts", "ACCOUNT_LOGO_COUNTRIES");
  const subscriptions = read("subscriptionLogos.generated.ts", "SUBSCRIPTION_LOGO_COUNTRIES");
  return `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.

/** Display names of the app's account logos, by \`logo_id\`. */
export const ACCOUNT_LOGO_NAMES: Readonly<Record<string, string>> = ${JSON.stringify(accounts.names, null, 2)};

/** Countries account logos are filed under, in the app's order. */
export const ACCOUNT_LOGO_COUNTRIES: readonly { slug: string; name: string }[] = ${JSON.stringify(accounts.countries, null, 2)};

/** Display names of the app's subscription logos, by \`logo_id\`. */
export const SUBSCRIPTION_LOGO_NAMES: Readonly<Record<string, string>> = ${JSON.stringify(subscriptions.names, null, 2)};

/** Countries subscription logos are filed under, in the app's order. */
export const SUBSCRIPTION_LOGO_COUNTRIES: readonly { slug: string; name: string }[] = ${JSON.stringify(subscriptions.countries, null, 2)};
`;
}

/**
 * The item icon picker's sections: the app's ITEM_ICON_GROUP_ORDER, each with
 * the icons the web has artwork for, as [id, name].
 */
function itemIconGroups(app, have) {
  const source = readFileSync(join(app, "constants/itemIcons.generated.ts"), "utf8");
  const order = [...must(source.match(/ITEM_ICON_GROUP_ORDER[^=]*=\s*\[([^\]]*)\]/), "ITEM_ICON_GROUP_ORDER")[1].matchAll(/'([a-z_-]+)'/g)].map((m) => m[1]);
  const icons = [...source.matchAll(/\{\s*id: '([^']+)',\s*name: '((?:[^'\\]|\\.)*)',\s*group: '([^']+)',?\s*\}/g)]
    .map((m) => ({ id: m[1], name: m[2].replace(/\\'/g, "'"), group: m[3] }))
    .filter((icon) => have.has(icon.id));
  must(icons.length, "item icons in constants/itemIcons.generated.ts");
  const groups = order
    .map((group) => ({ group, icons: icons.filter((icon) => icon.group === group).map((icon) => [icon.id, icon.name]) }))
    .filter((group) => group.icons.length);
  return `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.

/** The item-icon library by section, in the app's picker order: [id, name]. Labels: \`category_icon.group_<group>\`. */
export const ITEM_ICON_GROUPS: { group: string; icons: [string, string][] }[] = ${JSON.stringify(groups)};
`;
}

/**
 * The app's emoji picker catalog, keeping only what the phone accepts from the
 * web as `emoji:<glyph>`: no ASCII (keycaps carry digits), at most 16 UTF-16
 * units (long family sequences).
 */
function emojiCatalog(app) {
  const source = readFileSync(join(app, "constants/emojiCatalog.generated.ts"), "utf8");
  const groups = new Function(`return ${must(source.match(/EMOJI_GROUPS[^=]*=\s*(\[[\s\S]*?\]);/), "EMOJI_GROUPS")[1]};`)();
  const catalog = new Function(`return ${must(source.match(/EMOJI_CATALOG[^=]*=\s*(\[[\s\S]*?\n\]);/), "EMOJI_CATALOG")[1]};`)();
  const kept = catalog.filter((entry) => entry.e.length <= 16 && !/[\x00-\x7f]/.test(entry.e));
  must(kept.length, "emoji in EMOJI_CATALOG");
  return `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.
// From the app's constants/emojiCatalog.generated.ts (Unicode emoji-test + CLDR names),
// less the emoji the phone refuses from the web. Loaded only when the Emoji tab opens.

/** Section ids; labels are \`category_icon.group_<id>\`. */
export const EMOJI_GROUPS: readonly string[] = ${JSON.stringify(groups)};

/** e: glyph, n: name, g: index into EMOJI_GROUPS, k: extra search words. */
export const EMOJI_CATALOG: readonly { e: string; n: string; g: number; k?: string }[] = [
${kept.map((entry) => `  ${JSON.stringify(entry)},`).join("\n")}
];
`;
}

/**
 * The account editor's built-in card designs: each template's artwork at half
 * the app's 960x600 (a picker tile and the editor's thumbnail are far smaller),
 * and the list the app keeps in constants/cardDesigns.generated.ts, in its
 * CARD_DESIGN_GENRES order. Uploaded designs stay in the app.
 */
async function cardDesigns(app) {
  const sourceDir = join(app, "assets/card-designs");
  const outDir = join(ROOT, "public/dashboard-assets/card-designs");
  const genresSource = readFileSync(join(app, "constants/cardDesigns.ts"), "utf8");
  const genres = [...must(genresSource.match(/CARD_DESIGN_GENRES = \[([\s\S]*?)\]/), "CARD_DESIGN_GENRES")[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  const source = readFileSync(join(app, "constants/cardDesigns.generated.ts"), "utf8");
  const templates = [
    ...source.matchAll(/id: '([^']+)',\s*genre: '([^']+)',\s*source: require\('[^']+'\),\s*textTone: '(light|dark)',\s*scrim: ([\d.]+),/g),
  ].map((m) => ({ id: m[1], genre: m[2], textTone: m[3], scrim: Number(m[4]) }));
  // Read before the old artwork goes, so a changed source file leaves it in place.
  if (!templates.length) throw new Error("sync-dashboard-assets: no card designs read from constants/cardDesigns.generated.ts");
  rmSync(outDir, { recursive: true, force: true });
  const kept = [];
  for (const template of templates) {
    const file = join(sourceDir, `${template.id}.webp`);
    if (!existsSync(file)) continue;
    const out = join(outDir, `${template.id}.webp`);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(file).resize(480, 300, { fit: "cover" }).webp({ quality: 80, effort: 6 }).toFile(out);
    kept.push(template);
  }
  const order = (genre) => (genres.indexOf(genre) === -1 ? genres.length : genres.indexOf(genre));
  kept.sort((a, b) => order(a.genre) - order(b.genre));
  return `// AUTO-GENERATED by scripts/sync-dashboard-assets.mjs — do not edit by hand.

/** Card design genres in the app's order. Labels: \`accounts.card_design.genre_<genre>\`. */
export const CARD_DESIGN_GENRES: readonly string[] = ${JSON.stringify(genres.filter((genre) => kept.some((t) => t.genre === genre)))};

/** The app's built-in card designs (\`accounts.card_design\` = id), artwork at /dashboard/card-designs/<id>.webp. */
export const CARD_DESIGNS: readonly { id: string; genre: string; textTone: "light" | "dark"; scrim: number }[] = ${JSON.stringify(kept, null, 2)};
`;
}

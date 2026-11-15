/**
 * Copies Quick Entry's category keywords to the website, so a shared album's
 * bill typed there is tagged as the app tags it ("Lunch" → Food), for
 * album.money2time.com and the Web Dashboard.
 *
 *   features/transactions/utils/categoryKeywords/<locale>.ts
 *     -> ../web/src/lib/album/keywords/<locale>.json
 *
 * Each file holds a shared album's categories (`ALBUM_CATEGORIES`) and, under
 * `other`, every other bucket's keywords (a title of another kind, a movie
 * say, is filed under Other); `core.json` is the English core every language
 * starts from, the others only what their language adds. Latin keywords are
 * matched whatever their case, so they are kept once, in lower case. The
 * app's files are the source; never edit the website's copy.
 * `__tests__/scripts/syncCategoryKeywords.test.ts` (which runs this with
 * `--check`) fails while they differ.
 *
 *   npm run sync:category-keywords
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = path.join(ROOT, 'features/transactions/utils/categoryKeywords');
export const TARGET_DIR = path.join(ROOT, '../web/src/lib/album/keywords');
/** The album's categories with keywords of their own, in the app's bucket order. */
export const ALBUM_BUCKETS = [
  'food',
  'groceries',
  'transport',
  'housing',
  'bills',
  'healthcare',
  'shopping',
];

const CJK = /[㐀-鿿豈-﫿]/;

/** A bucket → keywords table as the website reads it. */
export function webKeywords(table) {
  const out = Object.fromEntries([...ALBUM_BUCKETS, 'other'].map((key) => [key, []]));
  const seen = Object.fromEntries([...ALBUM_BUCKETS, 'other'].map((key) => [key, new Set()]));
  for (const [bucket, list] of Object.entries(table)) {
    const key = ALBUM_BUCKETS.includes(bucket) ? bucket : 'other';
    for (const raw of list) {
      const keyword = CJK.test(raw) ? raw : raw.toLowerCase();
      if (!keyword || seen[key].has(keyword)) continue;
      seen[key].add(keyword);
      out[key].push(keyword);
    }
  }
  return out;
}

/** Every file the website gets, by name, from the app's keyword tables. */
export function webFiles(tables) {
  const files = {};
  for (const [locale, table] of Object.entries(tables)) {
    files[`${locale === 'en' ? 'core' : locale}.json`] = `${JSON.stringify(webKeywords(table))}\n`;
  }
  return files;
}

async function readTables() {
  const tables = {};
  for (const file of (await fs.readdir(SOURCE_DIR)).sort()) {
    if (!/^[a-z]{2,3}\.ts$/.test(file)) continue;
    const module = await import(pathToFileURL(path.join(SOURCE_DIR, file)).href);
    tables[file.replace(/\.ts$/, '')] = module.default;
  }
  return tables;
}

async function differences(files) {
  const names = new Set([...Object.keys(files), ...(await fs.readdir(TARGET_DIR).catch(() => []))]);
  const stale = [];
  for (const name of names) {
    const text = await fs.readFile(path.join(TARGET_DIR, name), 'utf8').catch(() => null);
    if (text !== files[name]) stale.push(name);
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = webFiles(await readTables());
  if (process.argv.includes('--check')) {
    const stale = await differences(files);
    if (stale.length) {
      console.error(`Out of date: ${stale.join(', ')}. Run npm run sync:category-keywords.`);
      process.exit(1);
    }
    process.exit(0);
  }
  await fs.rm(TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(TARGET_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await fs.writeFile(path.join(TARGET_DIR, name), text);
  }
  console.log(
    `Wrote ${Object.keys(files).length} files to ${path.relative(process.cwd(), TARGET_DIR)}`,
  );
}

// Builds the bundled, read-only offline place database from GeoNames data.
// Produces assets/db/cities.db with cities + country/admin1 name lookups and an
// FTS5 index for diacritic-insensitive typeahead, then VACUUMs to one compact
// file. The generated .db is committed as a build asset.
//
// Re-run when refreshing GeoNames data:
//   node scripts/build-cities-db.mjs              # download + populate
//   node scripts/build-cities-db.mjs --empty      # schema only (placeholder)
//
// Dataset: cities15000 (~26k cities, pop > 15000 or capitals). Swap CITIES_FILE
// to cities5000 for ~50k smaller towns.
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'assets/db');
const OUT_FILE = path.join(OUT_DIR, 'cities.db');

const GEONAMES_BASE = 'https://download.geonames.org/export/dump';
const CITIES_FILE = 'cities15000';
const EMPTY = process.argv.includes('--empty');

const SCHEMA = `
  CREATE TABLE country_names (code TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE admin1_names (key TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE cities (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    admin1       TEXT,
    country_code TEXT NOT NULL,
    latitude     REAL NOT NULL,
    longitude    REAL NOT NULL,
    population   INTEGER NOT NULL DEFAULT 0,
    timezone     TEXT
  );
  CREATE INDEX cities_population ON cities (population DESC);
  CREATE VIRTUAL TABLE cities_fts USING fts5(
    name, ascii_name, content='', tokenize = "unicode61 remove_diacritics 2"
  );
`;

function createSchema(db) {
  db.exec(SCHEMA);
}

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function download(file) {
  const url = `${GEONAMES_BASE}/${file}`;
  process.stdout.write(`Downloading ${url} …\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// cities15000 ships as a .zip containing a single .txt. Unzip with the system
// `unzip` into a temp dir to avoid adding a zip dependency.
async function downloadCitiesTxt() {
  const zip = await download(`${CITIES_FILE}.zip`);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'geonames-'));
  const zipPath = path.join(tmp, `${CITIES_FILE}.zip`);
  await fs.writeFile(zipPath, zip);
  execFileSync('unzip', ['-o', zipPath, '-d', tmp], { stdio: 'ignore' });
  return fs.readFile(path.join(tmp, `${CITIES_FILE}.txt`), 'utf8');
}

async function downloadTsv(file) {
  return (await download(file)).toString('utf8');
}

function parseCountryInfo(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t');
    const code = cols[0];
    const name = cols[4];
    if (code && name) rows.push([code, name]);
  }
  return rows;
}

function parseAdmin1(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    const key = cols[0]; // e.g. "JP.40"
    const name = cols[1];
    if (key && name) rows.push([key, name]);
  }
  return rows;
}

// GeoNames cities table columns (tab-separated, no header):
// 0 geonameid 1 name 2 asciiname 3 alternatenames 4 lat 5 lng 6 feature_class
// 7 feature_code 8 country_code 9 cc2 10 admin1_code … 14 population 17 timezone
function parseCities(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 18) continue;
    rows.push({
      id: c[0],
      name: c[1],
      asciiName: c[2],
      latitude: Number(c[4]),
      longitude: Number(c[5]),
      countryCode: c[8],
      admin1: c[10] || null,
      population: Number(c[14]) || 0,
      timezone: c[17] || null,
    });
  }
  return rows;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.rm(OUT_FILE, { force: true });

  const db = new DatabaseSync(OUT_FILE);
  db.exec('PRAGMA journal_mode = DELETE;');
  createSchema(db);

  if (EMPTY) {
    process.stdout.write('Creating schema-only placeholder (--empty).\n');
  } else {
    const [citiesTxt, countryTxt, admin1Txt] = await Promise.all([
      downloadCitiesTxt(),
      downloadTsv('countryInfo.txt'),
      downloadTsv('admin1CodesASCII.txt'),
    ]);

    const insertCountry = db.prepare('INSERT INTO country_names (code, name) VALUES (?, ?)');
    const insertAdmin1 = db.prepare('INSERT INTO admin1_names (key, name) VALUES (?, ?)');
    const insertCity = db.prepare(
      `INSERT INTO cities (id, name, admin1, country_code, latitude, longitude, population, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = db.prepare(
      'INSERT INTO cities_fts (rowid, name, ascii_name) VALUES (?, ?, ?)',
    );

    db.exec('BEGIN');
    for (const [code, name] of parseCountryInfo(countryTxt)) insertCountry.run(code, name);
    for (const [key, name] of parseAdmin1(admin1Txt)) insertAdmin1.run(key, name);

    let rowid = 0;
    let count = 0;
    for (const city of parseCities(citiesTxt)) {
      rowid += 1;
      insertCity.run(
        city.id,
        city.name,
        city.admin1,
        city.countryCode,
        city.latitude,
        city.longitude,
        city.population,
        city.timezone,
      );
      insertFts.run(rowid, city.name, stripDiacritics(city.asciiName || city.name));
      count += 1;
    }
    db.exec('COMMIT');
    process.stdout.write(`Inserted ${count} cities.\n`);
  }

  db.exec('VACUUM;');
  db.close();

  const { size } = await fs.stat(OUT_FILE);
  process.stdout.write(`Wrote ${OUT_FILE} (${(size / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});

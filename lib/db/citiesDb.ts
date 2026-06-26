import type { SQLiteDatabase } from 'expo-sqlite';

import type { City } from '~/types';

/**
 * Read-only offline place database (GeoNames cities15000), separate from
 * money2time.db. The prebuilt asset (assets/db/cities.db) is copied into the
 * SQLite directory once on first run, then opened query-only. It is pure
 * reference data: never migrated, never backed up, never reset.
 *
 * Regenerate the asset with `node scripts/build-cities-db.mjs`.
 */

// Bump whenever assets/db/cities.db is regenerated so the cached copy is replaced.
// v2: populated with real GeoNames cities15000 (the v1 asset was an empty placeholder).
export const CITIES_DB_VERSION = 2;
const CITIES_DB_NAME = 'cities.db';

// ---------------------------------------------------------------------------
// Pure helpers (no native imports — unit tested)
// ---------------------------------------------------------------------------

/** Normalize a search query: trim, collapse whitespace, strip diacritics, lowercase. */
export function normalizeCityQuery(query: string): string {
  return query.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Build an FTS5 MATCH expression for prefix typeahead. Each whitespace token is
 * reduced to alphanumerics and turned into a prefix term (`tok*`). Returns ''
 * when there is nothing searchable, so callers can short-circuit.
 */
export function buildFtsMatch(query: string): string {
  const normalized = normalizeCityQuery(query);
  if (!normalized) return '';
  const terms = normalized
    .split(' ')
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .map((token) => `${token}*`);
  return terms.join(' ');
}

interface CityJoinRow {
  id: string;
  name: string;
  admin1: string | null;
  country_code: string;
  country_name: string | null;
  admin_name: string | null;
  latitude: number;
  longitude: number;
  population: number;
}

export function toCity(row: CityJoinRow): City {
  return {
    id: row.id,
    name: row.name,
    admin: row.admin_name ?? row.admin1 ?? null,
    countryCode: row.country_code,
    countryName: row.country_name ?? row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    population: row.population,
  };
}

// ---------------------------------------------------------------------------
// Runtime (native) — lazily loaded so tests can import the pure helpers above
// ---------------------------------------------------------------------------

let cachedDb: SQLiteDatabase | null = null;
let openFailed = false;
let initPromise: Promise<SQLiteDatabase | null> | null = null;

const CITY_SELECT = `
  SELECT c.id AS id, c.name AS name, c.admin1 AS admin1, c.country_code AS country_code,
         c.latitude AS latitude, c.longitude AS longitude, c.population AS population,
         cn.name AS country_name, an.name AS admin_name
  FROM cities c
  LEFT JOIN country_names cn ON cn.code = c.country_code
  LEFT JOIN admin1_names an ON an.key = c.country_code || '.' || c.admin1
`;

async function copyAssetIfNeeded(): Promise<void> {
  const { Asset } = await import('expo-asset');
  const { Directory, File, Paths } = await import('expo-file-system/next');

  const sqliteDir = new Directory(Paths.document, 'SQLite');
  if (!sqliteDir.exists) sqliteDir.create({ intermediates: true });

  const dest = new File(sqliteDir, CITIES_DB_NAME);
  const marker = new File(sqliteDir, `${CITIES_DB_NAME}.version`);

  const upToDate =
    dest.exists && marker.exists && marker.textSync().trim() === String(CITIES_DB_VERSION);
  if (upToDate) return;

  const asset = Asset.fromModule(require('../../assets/db/cities.db'));
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('cities.db asset has no localUri');

  if (dest.exists) dest.delete();
  new File(asset.localUri).copy(dest);

  if (marker.exists) marker.delete();
  marker.create();
  marker.write(String(CITIES_DB_VERSION));
}

async function openCitiesDb(): Promise<SQLiteDatabase | null> {
  try {
    await copyAssetIfNeeded();
    const { openDatabaseSync } = await import('expo-sqlite');
    const db = openDatabaseSync(CITIES_DB_NAME);
    db.execSync('PRAGMA query_only = ON; PRAGMA mmap_size = 67108864;');
    cachedDb = db;
    return db;
  } catch (error) {
    // Degrade gracefully: a missing/corrupt asset must never crash the picker.
    openFailed = true;
    console.warn('citiesDb: failed to open offline cities database', error);
    return null;
  }
}

// Single-flight: concurrent first callers share one init so the non-atomic
// copy-on-first-run can't race itself into a half-written DB.
function getCitiesDb(): Promise<SQLiteDatabase | null> {
  if (cachedDb) return Promise.resolve(cachedDb);
  if (openFailed) return Promise.resolve(null);
  if (!initPromise) initPromise = openCitiesDb();
  return initPromise;
}

/** Diacritic-insensitive prefix search, ranked by population. Empty on failure. */
export async function searchCities(query: string, limit = 30): Promise<City[]> {
  const match = buildFtsMatch(query);
  if (!match) return [];
  const db = await getCitiesDb();
  if (!db) return [];
  try {
    const rows = db.getAllSync<CityJoinRow>(
      `${CITY_SELECT}
       JOIN cities_fts f ON f.rowid = c.rowid
       WHERE cities_fts MATCH ?
       ORDER BY c.population DESC
       LIMIT ?`,
      [match, limit],
    );
    return rows.map(toCity);
  } catch (error) {
    console.warn('citiesDb: search failed', error);
    return [];
  }
}

/**
 * The offline cities database must replace a copy that holds no cities.
 *
 * Builds 1.6.1 and 1.6.2 started the asset copy without waiting for it and
 * opened the database straight away. `openDatabaseSync` then created an empty
 * cities.db, the copy failed with "Destination already exists", and the
 * version marker was still written. Every later launch took that empty file
 * as current, so the album city picker found nothing, even after an update.
 */

const ASSET_URI = 'bundle/cities.db';
const DEST = 'doc/SQLite/cities.db';
const MARKER = 'doc/SQLite/cities.db.version';

type Content = 'REAL' | 'EMPTY' | string;
const files = new Map<string, Content>();
const dirs = new Set<string>();
const copies: string[] = [];

function joinPath(parts: unknown[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : (part as { path: string }).path))
    .join('/');
}

jest.mock('expo-file-system/next', () => {
  class Directory {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = joinPath(parts);
    }
    get exists() {
      return dirs.has(this.path);
    }
    create() {
      dirs.add(this.path);
    }
  }
  class File {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = joinPath(parts);
    }
    get exists() {
      return files.has(this.path);
    }
    textSync() {
      return files.get(this.path) ?? '';
    }
    delete() {
      files.delete(this.path);
    }
    create() {
      files.set(this.path, '');
    }
    async write(text: string) {
      files.set(this.path, text);
    }
    async copy(dest: { path: string }) {
      if (files.has(dest.path)) throw new Error('Destination already exists');
      copies.push(dest.path);
      files.set(dest.path, files.get(this.path) ?? '');
    }
  }
  return { Directory, File, Paths: { document: 'doc' } };
});

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ localUri: ASSET_URI, downloadAsync: async () => undefined }),
  },
}));

jest.mock('../../assets/db/cities.db', () => 1);

const ROW = {
  id: '1850147',
  name: 'Tokyo',
  admin1: '40',
  country_code: 'JP',
  country_name: 'Japan',
  admin_name: 'Tokyo',
  latitude: 35.6895,
  longitude: 139.69171,
  population: 8336599,
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (name: string) => {
    const path = `doc/SQLite/${name}`;
    // Like SQLite: opening a missing file creates an empty database.
    if (!files.has(path)) files.set(path, 'EMPTY');
    const hasCities = () => files.get(path) === 'REAL';
    return {
      execSync: () => undefined,
      closeSync: () => undefined,
      getFirstSync: (sql: string) => {
        if (sql.includes('sqlite_master')) return { n: hasCities() ? 1 : 0 };
        throw new Error(`unexpected query: ${sql}`);
      },
      getAllSync: () => {
        if (!hasCities()) throw new Error('no such table: cities');
        return [ROW];
      },
    };
  },
}));

function loadCitiesDb(): typeof import('~/lib/db/citiesDb') {
  let mod: typeof import('~/lib/db/citiesDb') | undefined;
  jest.isolateModules(() => {
    mod = require('~/lib/db/citiesDb');
  });
  return mod!;
}

beforeEach(() => {
  files.clear();
  dirs.clear();
  copies.length = 0;
  files.set(ASSET_URI, 'REAL');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('offline cities database', () => {
  it('copies the asset on first run and finds cities', async () => {
    const { searchCities, CITIES_DB_VERSION } = loadCitiesDb();
    const results = await searchCities('tokyo');
    expect(results.map((city) => city.name)).toEqual(['Tokyo']);
    expect(copies).toEqual([DEST]);
    expect(files.get(MARKER)).toBe(String(CITIES_DB_VERSION));
  });

  it('keeps an intact current copy without copying again', async () => {
    const { searchCities, CITIES_DB_VERSION } = loadCitiesDb();
    files.set(DEST, 'REAL');
    files.set(MARKER, String(CITIES_DB_VERSION));
    const results = await searchCities('tokyo');
    expect(results).toHaveLength(1);
    expect(copies).toEqual([]);
  });

  it('replaces an empty copy that the version marker calls current', async () => {
    const { searchCities, CITIES_DB_VERSION } = loadCitiesDb();
    // What a 1.6.1 / 1.6.2 launch left behind.
    files.set(DEST, 'EMPTY');
    files.set(MARKER, String(CITIES_DB_VERSION));
    const results = await searchCities('tokyo');
    expect(results.map((city) => city.name)).toEqual(['Tokyo']);
    expect(copies).toEqual([DEST]);
    expect(files.get(DEST)).toBe('REAL');
  });

  it('gives up quietly when the bundled asset itself has no cities', async () => {
    const { searchCities } = loadCitiesDb();
    files.set(ASSET_URI, 'EMPTY');
    await expect(searchCities('tokyo')).resolves.toEqual([]);
    // Not retried on every keystroke.
    await expect(searchCities('osaka')).resolves.toEqual([]);
    expect(copies.length).toBeLessThanOrEqual(2);
  });
});

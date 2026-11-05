import { SyncEngine } from '~/features/cloudSync/services/syncEngine';

// The Turso engine writes temporary indexes (an `IN (…)` list, a sort that
// spills, a TEMP table) to a directory from $TMPDIR, falling back to
// /data/local/tmp on Android, which apps cannot write. Android sets $TMPDIR to
// the app's cache dir only when that directory is available at start-up. This
// fake replica behaves like the engine on a phone where it was not: a query
// that needs a temporary index fails unless the connection keeps them in memory.
const TEMPDIR_ERROR = 'I/O error (tempdir): permission denied';

const executed: string[] = [];

jest.mock('@tursodatabase/sync-react-native', () => {
  class Database {
    private tempInMemory = false;
    async connect() {}
    async exec(sql: string) {
      executed.push(sql);
      if (/PRAGMA\s+temp_store\s*=\s*(MEMORY|2)/i.test(sql)) this.tempInMemory = true;
    }
    async all(sql: string) {
      if (/\bIN\s*\(/i.test(sql) && !this.tempInMemory) throw new Error(TEMPDIR_ERROR);
      return [];
    }
    close() {}
  }
  return { Database, getDbPath: (name: string) => `/data/user/0/app/databases/${name}` };
});
jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {
    exists = false;
  },
  Directory: class {},
}));
jest.mock('~/services/userAssets', () => ({
  assetRelativePathFromRef: () => null,
  invalidateCustomUriCache: jest.fn(),
}));
jest.mock('~/services/userAssetGc', () => ({ collectReferencedAssetPaths: () => new Set() }));

function engine(): SyncEngine {
  return new SyncEngine({
    userId: 'test-user',
    channel: 'personal',
    url: 'libsql://test',
    getTursoToken: async () => 'token',
    getSessionToken: async () => 'session',
    mediaPath: '/v1/media',
    deviceName: 'Test',
  });
}

beforeEach(() => {
  executed.length = 0;
});

describe('Cloud Sync replica temporary storage', () => {
  it('keeps temporary indexes in memory, so the summary works without a writable temp dir', async () => {
    const sync = engine();
    await sync.open();

    await expect(sync.summarizeCloud()).resolves.toMatchObject({ transactions: 0, accounts: 0 });
  });

  it('sets the temp store before creating the schema', async () => {
    await engine().open();

    const pragma = executed.findIndex((sql) => /PRAGMA\s+temp_store\s*=\s*MEMORY/i.test(sql));
    const schema = executed.findIndex((sql) => /CREATE TABLE/i.test(sql));
    expect(pragma).toBeGreaterThanOrEqual(0);
    expect(pragma).toBeLessThan(schema);
  });
});

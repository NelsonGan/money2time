import { SyncEngine } from '~/features/cloudSync/services/syncEngine';

// Turso's sync engine (0.8.3) keeps, beside the replica, how far into the WAL
// its last pull reached. A replica kept from an earlier session whose WAL no
// longer holds those frames fails every pull with this error, so signing in to
// Cloud Sync failed until the user tried again (a failed link deletes the
// replica). Reproduced against a local tursodb 0.8.3 sync server.
const STUCK =
  'sync engine operation failed: database sync engine error: unable to checkpoint synced portion of WAL: ' +
  'result=CheckpointResult { wal_max_frame: 0, wal_total_backfilled: 0 }, watermark=998';

const REPLICA_DIR = '/data/user/0/app/databases';
const files = new Set<string>();
const log: string[] = [];

jest.mock('@tursodatabase/sync-react-native', () => {
  class Database {
    private readonly path: string;
    private readonly stuck: boolean;
    constructor(opts: { path: string }) {
      this.path = opts.path;
      // A replica opened over files that are still there is the kept one.
      this.stuck = files.has(this.path.slice(this.path.lastIndexOf('/') + 1));
    }
    async connect() {
      const name = this.path.slice(this.path.lastIndexOf('/') + 1);
      log.push(this.stuck ? 'open kept' : 'open fresh');
      for (const suffix of ['', '-wal', '-info']) files.add(`${name}${suffix}`);
    }
    async exec() {}
    async pull() {
      log.push('pull');
      if (this.stuck) throw new Error(STUCK);
      return true;
    }
    close() {
      log.push('close');
    }
  }
  return { Database, getDbPath: (name: string) => `/data/user/0/app/databases/${name}` };
});
jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {
    exists = false;
  },
  Directory: class {
    constructor(readonly uri: string) {}
    get exists() {
      return this.uri === `file://${REPLICA_DIR}`;
    }
    list() {
      return [...files].map((name) => ({
        name,
        delete: () => {
          files.delete(name);
          log.push(`delete ${name}`);
        },
      }));
    }
  },
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
  files.clear();
  log.length = 0;
});

describe('pulling before a link', () => {
  it('pulls a fresh replica once', async () => {
    const sync = engine();
    await sync.open();

    await sync.pullLatest();

    expect(log).toEqual(['open fresh', 'pull']);
  });

  it('starts again from a fresh copy of the cloud when a kept replica is stuck', async () => {
    // An earlier session left the replica behind; the engine cannot pull into it.
    await engine().open();
    log.length = 0;
    const sync = engine();
    await sync.open();

    await expect(sync.pullLatest()).resolves.toBeUndefined();

    const deleted = expect.stringMatching(/^delete m2t-cloud-\w+\.db(-wal|-info)?$/);
    expect(log).toEqual([
      'open kept',
      'pull',
      'close',
      deleted,
      deleted,
      deleted,
      'open fresh',
      'pull',
    ]);
  });

  it('does not throw away the replica for other failures', async () => {
    await engine().open();
    const sync = engine();
    await sync.open();
    const offline = new Error('HTTP response failed (network error)');
    jest.spyOn(sync as unknown as { db: () => { pull: () => Promise<void> } }, 'db').mockReturnValue({
      pull: () => Promise.reject(offline),
    });

    await expect(sync.pullLatest()).rejects.toBe(offline);
    expect(log.some((entry) => entry.startsWith('delete'))).toBe(false);
  });
});

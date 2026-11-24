import { SyncEngine } from '~/features/cloudSync/services/syncEngine';
import { reportError } from '~/services/errorReporting';

// Turso's sync engine (0.8.3) keeps, beside the replica, how far into the WAL
// its last pull reached. A replica kept from an earlier session whose WAL no
// longer holds those frames fails every pull with this error, so signing in to
// Cloud Sync failed until the user tried again (a failed link deletes the
// replica). Reproduced against a local tursodb 0.8.3 sync server.
const STUCK =
  'sync engine operation failed: database sync engine error: unable to checkpoint synced portion of WAL: ' +
  'result=CheckpointResult { wal_max_frame: 0, wal_total_backfilled: 0 }, watermark=998';
// A replica whose files were put back from an older copy (an Android or iCloud
// backup restored, a phone-to-phone transfer) has pushed more than its files
// remember: the cloud's record of this replica's last push is ahead of its own,
// and the engine refuses every pull. Reproduced against a local tursodb 0.8.3
// sync server by restoring a replica's files from a copy taken three syncs earlier.
const RESTORED =
  'sync engine operation failed: database sync engine error: protocol error: ' +
  'remote_pull_gen > local_pull_gen: 11 > 10';
// A replica file the engine finds damaged: replaying this phone's unsent change
// over the pulled ones read a TEXT value that is not UTF-8. The app cannot
// write one (the binding stores an unpaired surrogate as U+FFFD), so the file
// itself is damaged, and every pull fails the same way (2026-11-24, iPadOS).
const CORRUPT =
  'sync engine operation failed: database sync engine error: failed to replay local change after remote apply: ' +
  'database error: Corrupt database: TEXT value contains invalid UTF-8';
let stuckMessage = STUCK;

const REPLICA_DIR = '/data/user/0/app/databases';
const files = new Set<string>();
const log: string[] = [];
let freshOpenError: Error | null = null;
let deleteFails = false;

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
      if (!this.stuck && freshOpenError) throw freshOpenError;
      for (const suffix of ['', '-wal', '-info']) files.add(`${name}${suffix}`);
    }
    async exec() {}
    async pull() {
      log.push('pull');
      if (this.stuck) throw new Error(stuckMessage);
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
          if (deleteFails) throw new Error('EPERM');
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
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));

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
  freshOpenError = null;
  deleteFails = false;
  stuckMessage = STUCK;
  jest.mocked(reportError).mockClear();
});

describe('pulling before a link', () => {
  it('pulls a fresh replica once', async () => {
    const sync = engine();
    await sync.open();

    await sync.pullLatest();

    expect(log).toEqual(['open fresh', 'pull']);
  });

  it.each([
    ['its WAL no longer holds the last pull', STUCK],
    ['it was restored from an older copy of its files', RESTORED],
    ['its file is damaged', CORRUPT],
  ])(
    'starts again from a fresh copy of the cloud when a kept replica is stuck: %s',
    async (_case, message) => {
      stuckMessage = message;
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
      // Recovered, but still reported, so the engine fault's rate stays visible.
      expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message }), {
        scope: 'cloud_sync',
        stage: 'replica_rebuilt',
      });
    },
  );

  it('gives up after one fresh copy, so a failing download is reported as before', async () => {
    await engine().open();
    const sync = engine();
    await sync.open();
    freshOpenError = new Error('HTTP response failed (network error)');

    await expect(sync.pullLatest()).rejects.toBe(freshOpenError);
    // The earlier session's replica, the kept one, then one fresh copy only.
    expect(log.filter((entry) => entry.startsWith('open'))).toEqual([
      'open fresh',
      'open kept',
      'open fresh',
    ]);
    expect(reportError).not.toHaveBeenCalled();

    // Back online, the next try opens a fresh copy instead of a closed replica.
    freshOpenError = null;
    log.length = 0;
    await expect(sync.pullLatest()).resolves.toBeUndefined();
    expect(log).toEqual(['open fresh', 'pull']);
  });

  it('fails as before when the stuck files could not be deleted', async () => {
    await engine().open();
    const sync = engine();
    await sync.open();
    deleteFails = true;

    await expect(sync.pullLatest()).rejects.toThrow(STUCK);
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each([
    'remote server returned an error: status=500, body={"error":"Corrupt database: page 7"}',
    'unexpected http response: status=502, body=Corrupt database: page 7',
  ])('keeps the replica when the cloud, not this file, reports damage: %s', async (remote) => {
    stuckMessage = `sync engine operation failed: database sync engine error: ${remote}`;
    await engine().open();
    const sync = engine();
    await sync.open();

    await expect(sync.pullLatest()).rejects.toThrow(stuckMessage);
    expect(log.some((entry) => entry.startsWith('delete'))).toBe(false);
  });

  it('does not throw away the replica for other failures', async () => {
    await engine().open();
    const sync = engine();
    await sync.open();
    const offline = new Error('HTTP response failed (network error)');
    jest
      .spyOn(sync as unknown as { db: () => { pull: () => Promise<void> } }, 'db')
      .mockReturnValue({
        pull: () => Promise.reject(offline),
      });

    await expect(sync.pullLatest()).rejects.toBe(offline);
    expect(log.some((entry) => entry.startsWith('delete'))).toBe(false);
  });
});

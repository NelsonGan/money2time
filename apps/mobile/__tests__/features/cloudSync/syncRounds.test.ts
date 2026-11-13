import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  downloadMedia as apiDownloadMedia,
  uploadMedia as apiUploadMedia,
} from '~/features/cloudSync/services/cloudSyncApi';
import {
  removeSharedLedger,
  saveSharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { enableCapture, SyncEngine } from '~/features/cloudSync/services/syncEngine';
import { getSQLite } from '~/lib/db/client';
import { applyMigrations } from '~/lib/db/migrations/runner';

// What one sync round costs on the wire (README: Cloud Sync > How it works,
// Sync run): one pull, a push only with something to send, a replacement of
// the cloud copy that writes only what differs, and the replica's WAL kept
// small. The fake replica is a SQLite database with the cloud's tables and
// counts what the engine asks of Turso.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
const files = new Set<string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.filter((part) => typeof part === 'string').join('/');
    }
    get exists() {
      return files.has(this.path);
    }
    get parentDirectory() {
      return { exists: true, create: () => undefined };
    }
    delete() {
      files.delete(this.path);
    }
    moveSync(to: { path: string }) {
      files.delete(this.path);
      files.add(to.path);
    }
  },
  Directory: class {},
}));
jest.mock('~/services/userAssets', () => ({
  assetRelativePathFromRef: (value: string) => value,
  invalidateCustomUriCache: jest.fn(),
}));
jest.mock('~/services/userAssetGc', () => ({ collectReferencedAssetPaths: () => new Set() }));
jest.mock('~/features/cloudSync/services/cloudSyncApi', () => ({
  existingMedia: jest.fn(async () => new Set()),
  uploadMedia: jest.fn(async () => undefined),
  downloadMedia: jest.fn(async () => undefined),
}));

const now = '2026-11-05T00:00:00.000Z';
let app: DatabaseSync;
let cloud: DatabaseSync;
let engine: SyncEngine;
let calls: string[];
let unpushed: number;
let walSize: number;
let pushError: Error | null;
/** The cloud as the last successful push left it (`cloud` also holds unpushed writes). */
let pushedRows: Map<string, Record<string, unknown>>;
/** The next pull brings a change (another phone wrote to `cloud`). */
let remoteChanged: boolean;
/** Turso's engine refuses every pull into this replica (see stuckReplica.test.ts). */
let stuckPull: boolean;
const STUCK = 'database sync engine error: unable to checkpoint synced portion of WAL';

function addTransaction(id: string, amount: number, extra: Record<string, string> = {}) {
  const columns = [
    'id',
    'ledger_id',
    'type',
    'amount',
    'currency',
    'date',
    'created_at',
    'updated_at',
    ...Object.keys(extra),
  ];
  app
    .prepare(
      `INSERT INTO transactions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(id, 'default', 'expense', amount, 'USD', '2026-11-05', now, now, ...Object.values(extra));
}

function cloudSnapshot(): Map<string, Record<string, unknown>> {
  return new Map(
    cloud
      .prepare('SELECT row_id, data FROM sync_rows')
      .all()
      .map((row) => [String(row.row_id), JSON.parse(String(row.data))]),
  );
}

function pushedRow(id: string): Record<string, unknown> | null {
  return pushedRows.get(id) ?? null;
}

function cloudRow(id: string): Record<string, unknown> | null {
  const row = cloud.prepare('SELECT data, rev FROM sync_rows WHERE row_id = ?').get(id);
  return row ? { ...JSON.parse(String(row.data)), rev: row.rev } : null;
}

beforeEach(() => {
  files.clear();
  jest.clearAllMocks();
  app = new DatabaseSync(':memory:');
  cloud = new DatabaseSync(':memory:');
  const flat = (args: unknown[]) => args.flat() as (string | number | null)[];
  const db = {
    execSync: (sql: string) => app.exec(sql),
    getAllSync: (sql: string, ...args: unknown[]) => app.prepare(sql).all(...flat(args)),
    getFirstSync: (sql: string, ...args: unknown[]) => app.prepare(sql).get(...flat(args)) ?? null,
    runSync: (sql: string, ...args: unknown[]) => app.prepare(sql).run(...flat(args)),
    withTransactionSync: (fn: () => void) => {
      app.exec('BEGIN');
      try {
        fn();
        app.exec('COMMIT');
      } catch (error) {
        app.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  (getSQLite as jest.Mock).mockReturnValue(db);
  const dir = join(__dirname, '../../../lib/db/migrations');
  applyMigrations(
    db,
    readdirSync(dir)
      .filter((file) => /^\d{3}_.+\.ts$/.test(file))
      .sort()
      .map((file) => require(join(dir, file)).default),
  );
  app.exec(
    `INSERT INTO settings (id, app_user_id, created_at, updated_at) VALUES ('primary', 'rc-test', '${now}', '${now}');
     INSERT OR IGNORE INTO ledgers (id, sort_order, created_at, updated_at) VALUES ('default', 0, '${now}', '${now}');`,
  );
  // Signed in: edits are recorded from the start.
  enableCapture();
  cloud.exec(
    'CREATE TABLE sync_rows (table_name TEXT, row_id TEXT, data TEXT, rev TEXT, origin TEXT, updated_at INTEGER, PRIMARY KEY(table_name,row_id)); CREATE TABLE sync_info (key TEXT PRIMARY KEY, value TEXT);',
  );
  calls = [];
  unpushed = 0;
  walSize = 0;
  pushError = null;
  remoteChanged = false;
  stuckPull = false;
  pushedRows = new Map();
  const write = (sql: string, args: (string | number | null)[] = []) => {
    calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase());
    unpushed += 1;
    return cloud.prepare(sql).run(...args);
  };
  const replica = {
    all: async (sql: string, args: (string | number | null)[] = []) =>
      cloud.prepare(sql).all(...args),
    run: async (sql: string, args: (string | number | null)[] = []) => write(sql, args),
    exec: async (sql: string) => {
      if (/^\s*(DELETE|INSERT|UPDATE)/i.test(sql)) unpushed += 1;
      cloud.exec(sql);
    },
    transaction: async (fn: () => Promise<void>) => {
      cloud.exec('BEGIN');
      try {
        await fn();
        cloud.exec('COMMIT');
      } catch (error) {
        cloud.exec('ROLLBACK');
        throw error;
      }
    },
    pull: async () => {
      calls.push('pull');
      if (stuckPull) throw new Error(STUCK);
      const changed = remoteChanged;
      remoteChanged = false;
      return changed;
    },
    push: async () => {
      calls.push('push');
      if (pushError) throw pushError;
      unpushed = 0;
      pushedRows = cloudSnapshot();
    },
    stats: async () => ({ cdcOperations: unpushed, mainWalSize: walSize }),
    checkpoint: async () => {
      calls.push('checkpoint');
      walSize = 0;
    },
  };
  engine = new SyncEngine({
    userId: 'test-user',
    channel: 'personal',
    url: 'local-test',
    getTursoToken: async () => 'local-test',
    getSessionToken: async () => 'local-test',
    mediaPath: '/v1/media',
    deviceName: 'Test',
  });
  Object.assign(engine, { replica });
});

afterEach(() => {
  removeSharedLedger('family');
  app.close();
  cloud.close();
});

const rounds = () => calls.filter((call) => call === 'pull' || call === 'push');

it('pulls once and pushes nothing when there is nothing to send', async () => {
  await engine.syncNow();
  calls = [];
  await engine.syncNow();
  expect(rounds()).toEqual(['pull']);
});

it('pulls once, then pushes, for an edit', async () => {
  await engine.syncNow();
  calls = [];
  addTransaction('lunch', 12);
  const outcome = await engine.syncNow();
  expect(rounds()).toEqual(['pull', 'push']);
  expect(outcome.pushed).toBe(true);
  expect(cloudRow('lunch')?.amount).toBe(12);
});

it('pushes nothing when only a device-local setting and the row stamp changed', async () => {
  await engine.uploadAllReplacingCloud();
  expect(cloudRow('primary')).not.toBeNull();
  calls = [];
  // What a rate refresh saves: the fetch time, and the row's updated_at.
  app.exec(
    "UPDATE settings SET last_rate_fetch_at = '2026-11-07T06:00:00Z', updated_at = '2026-11-07T06:00:00Z'",
  );
  await engine.syncNow();
  expect(rounds()).toEqual(['pull']);
  app.exec("UPDATE settings SET locale = 'fr', updated_at = '2026-11-07T07:00:00Z'");
  await engine.syncNow();
  expect(rounds()).toEqual(['pull', 'pull', 'push']);
});

it("keeps another phone's settings edit when only a device-local setting changed here", async () => {
  await engine.uploadAllReplacingCloud();
  // Another phone renamed the profile; this phone has not pulled it yet.
  const { rev: _rev, ...settings } = cloudRow('primary')!;
  cloud
    .prepare("UPDATE sync_rows SET data = ?, rev = 'rev-other' WHERE row_id = 'primary'")
    .run(JSON.stringify({ ...settings, profile_name: 'Sam', updated_at: '2026-11-07T21:00:00Z' }));
  remoteChanged = true;
  // Meanwhile this phone refreshes its rates (a device-local setting).
  app.exec(
    "UPDATE settings SET last_rate_fetch_at = '2026-11-08T08:00:00Z', updated_at = '2026-11-08T08:00:00Z'",
  );
  expect(app.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get()?.n).toBe(0);
  await engine.syncNow();
  expect(cloudRow('primary')?.profile_name).toBe('Sam');
  expect(app.prepare('SELECT profile_name FROM settings').get()?.profile_name).toBe('Sam');
  expect(app.prepare('SELECT last_rate_fetch_at FROM settings').get()?.last_rate_fetch_at).toBe(
    '2026-11-08T08:00:00Z',
  );
});

it('pushes a change already in the replica that an earlier push did not carry', async () => {
  addTransaction('lunch', 12);
  pushError = new Error('offline');
  await expect(engine.syncNow()).rejects.toThrow('offline');
  pushError = null;
  calls = [];
  const outcome = await engine.syncNow();
  expect(rounds()).toEqual(['pull', 'push']);
  expect(outcome.pushed).toBe(true);
});

describe('replacing the cloud copy with this phone', () => {
  beforeEach(async () => {
    addTransaction('same', 10);
    addTransaction('changed', 20);
    await engine.uploadAllReplacingCloud();
    // Another phone's rows: one this phone never had, one it changed since.
    cloud
      .prepare('INSERT INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        'transactions',
        'elsewhere',
        JSON.stringify({ ...cloudRow('same'), id: 'elsewhere' }),
        'rev-x',
        'other',
        1,
      );
    // Pushed by that phone.
    pushedRows = cloudSnapshot();
    app.exec("UPDATE transactions SET amount = 25 WHERE id = 'changed'");
    app.exec('DELETE FROM sync_outbox');
    calls = [];
  });

  it('writes only what differs and deletes what this phone does not have', async () => {
    const sameRev = cloudRow('same')?.rev;
    await engine.uploadAllReplacingCloud();
    expect(cloudRow('same')?.rev).toBe(sameRev);
    expect(cloudRow('changed')?.amount).toBe(25);
    expect(cloudRow('elsewhere')).toBeNull();
    expect(calls.filter((call) => call === 'INSERT INTO SYNC_ROWS')).toHaveLength(0);
    expect(rounds()).toEqual(['pull', 'push']);
  });

  it('still replaces the copy on the next sync after a failed push', async () => {
    pushError = new Error('offline');
    await expect(engine.uploadAllReplacingCloud()).rejects.toThrow('offline');
    // Nothing of the replacement reached the cloud yet.
    expect(pushedRow('elsewhere')).not.toBeNull();
    pushError = null;
    calls = [];
    const outcome = await engine.syncNow();
    expect(outcome.pushed).toBe(true);
    expect(rounds()).toEqual(['pull', 'push']);
    expect(pushedRow('elsewhere')).toBeNull();
    expect(pushedRow('changed')?.amount).toBe(25);
  });

  it('replaces the copy after an app killed before the sync', async () => {
    // The intent and the queue are written together, before any network.
    const sync = jest.spyOn(engine as unknown as { runSync: () => Promise<unknown> }, 'runSync');
    sync.mockRejectedValueOnce(new Error('killed'));
    await expect(engine.uploadAllReplacingCloud()).rejects.toThrow('killed');
    sync.mockRestore();
    await engine.syncNow();
    expect(cloudRow('elsewhere')).toBeNull();
    expect(cloudRow('changed')?.amount).toBe(25);
  });
});

it('checkpoints the replica once its WAL is large, and only then', async () => {
  await engine.syncNow();
  expect(calls).not.toContain('checkpoint');
  walSize = 8 * 1024 * 1024;
  await engine.syncNow();
  expect(calls).toContain('checkpoint');
});

it('does not fail a sync whose checkpoint fails', async () => {
  walSize = 8 * 1024 * 1024;
  const replica = (engine as unknown as { replica: { checkpoint: () => Promise<void> } }).replica;
  replica.checkpoint = async () => {
    throw new Error('busy');
  };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  addTransaction('lunch', 12);
  await expect(engine.syncNow()).resolves.toMatchObject({ pushed: true });
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('uploads images four at a time', async () => {
  let inFlight = 0;
  let most = 0;
  (apiUploadMedia as jest.Mock).mockImplementation(async () => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });
  for (let i = 0; i < 10; i++) {
    files.add(`user-assets/receipts/r${i}.jpg`);
    addTransaction(`t${i}`, i, { receipt_uri: `receipts/r${i}.jpg` });
  }
  await engine.syncNow();
  expect(apiUploadMedia).toHaveBeenCalledTimes(10);
  expect(most).toBe(4);
});

it('tries a missing image again on a later sync only after a while', async () => {
  (apiDownloadMedia as jest.Mock).mockRejectedValue(new Error('404'));
  app.exec(
    "INSERT INTO sync_media_missing (path, channel) VALUES ('receipts/gone.jpg', 'personal')",
  );
  await engine.syncNow();
  expect(apiDownloadMedia).toHaveBeenCalledTimes(1);
  await engine.syncNow();
  await engine.syncNow();
  expect(apiDownloadMedia).toHaveBeenCalledTimes(1);
  const later = Date.now() + 11 * 60_000;
  jest.spyOn(Date, 'now').mockReturnValue(later);
  await engine.syncNow();
  expect(apiDownloadMedia).toHaveBeenCalledTimes(2);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Edge cases around the fewer round trips

function cloudTables(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE sync_rows (table_name TEXT, row_id TEXT, data TEXT, rev TEXT, origin TEXT, updated_at INTEGER, PRIMARY KEY(table_name,row_id)); CREATE TABLE sync_info (key TEXT PRIMARY KEY, value TEXT);',
  );
}

function putRow(db: DatabaseSync, id: string, row: Record<string, unknown>, rev: string) {
  db.prepare('INSERT OR REPLACE INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)').run(
    'transactions',
    id,
    JSON.stringify(row),
    rev,
    'another-phone',
    1,
  );
}

function localRow(id: string): Record<string, unknown> | undefined {
  return app.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
}

/** A shared ledger "family" and an engine on its own (fake) cloud database. */
function shareFamily(state: { attached?: boolean; detached?: boolean } = {}) {
  app.exec(
    `INSERT INTO ledgers (id, name, sort_order, created_at, updated_at) VALUES ('family', 'Family', 1, '${now}', '${now}')`,
  );
  saveSharedLedger({
    ledgerId: 'family',
    shareId: 'family-share',
    role: 'owner',
    name: 'Family',
    ownerName: 'Owner',
    memberCount: 2,
    active: true,
  });
  if (state.attached) app.exec("INSERT INTO sync_state VALUES ('attached:family-share', '1')");
  if (state.detached) app.exec("INSERT INTO sync_state VALUES ('detached:family-share', '1')");
  const ledgerCloud = new DatabaseSync(':memory:');
  cloudTables(ledgerCloud);
  const log = { calls: [] as string[], unpushed: 0 };
  const replica = {
    all: async (sql: string, args: (string | number | null)[] = []) =>
      ledgerCloud.prepare(sql).all(...args),
    run: async (sql: string, args: (string | number | null)[] = []) => {
      log.unpushed += 1;
      return ledgerCloud.prepare(sql).run(...args);
    },
    exec: async (sql: string) => void ledgerCloud.exec(sql),
    transaction: async (fn: () => Promise<void>) => {
      ledgerCloud.exec('BEGIN');
      try {
        await fn();
        ledgerCloud.exec('COMMIT');
      } catch (error) {
        ledgerCloud.exec('ROLLBACK');
        throw error;
      }
    },
    pull: async () => {
      log.calls.push('pull');
      return false;
    },
    push: async () => {
      log.calls.push('push');
      log.unpushed = 0;
    },
    stats: async () => ({ cdcOperations: log.unpushed, mainWalSize: 0 }),
    checkpoint: async () => undefined,
  };
  const ledgerEngine = new SyncEngine({
    userId: 'test-user',
    channel: 'family-share',
    ledgerId: 'family',
    url: 'local-test',
    getTursoToken: async () => 'local-test',
    getSessionToken: async () => 'local-test',
    mediaPath: '/v1/ledgers/family-share/media',
    deviceName: 'Test',
  });
  Object.assign(ledgerEngine, { replica });
  return { ledgerEngine, ledgerCloud, log };
}

function addFamilyTransaction(id: string, amount: number) {
  app
    .prepare(
      'INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, 'family', 'expense', amount, 'USD', '2026-11-05', now, now);
}

describe('shared ledgers', () => {
  it('sync with one pull when idle and push only for an edit', async () => {
    const { ledgerEngine, ledgerCloud, log } = shareFamily({ attached: true, detached: true });
    await ledgerEngine.syncNow();
    log.calls = [];
    await ledgerEngine.syncNow();
    expect(log.calls).toEqual(['pull']);
    addFamilyTransaction('groceries', 30);
    const outcome = await ledgerEngine.syncNow();
    expect(log.calls).toEqual(['pull', 'pull', 'push']);
    expect(outcome.pushed).toBe(true);
    expect(ledgerCloud.prepare('SELECT COUNT(*) AS n FROM sync_rows').get()?.n).toBeGreaterThan(0);
    ledgerCloud.close();
  });

  it('push while a ledger is being attached, even with nothing new to send', async () => {
    const { ledgerEngine, ledgerCloud, log } = shareFamily();
    const outcome = await ledgerEngine.syncNow();
    expect(log.calls).toContain('push');
    expect(outcome.pushed).toBe(true);
    ledgerCloud.close();
  });

  it("push the user's own copy when only a ledger's detach changed it", async () => {
    // The ledger's rows went to its own database; this phone's copy still has one.
    const { ledgerCloud } = shareFamily({ attached: true });
    addFamilyTransaction('groceries', 30);
    app.exec('DELETE FROM sync_outbox');
    putRow(cloud, 'groceries', { ...localRow('groceries') }, 'rev-1');
    await engine.syncNow();
    expect(rounds()).toEqual(['pull', 'push']);
    expect(cloudRow('groceries')).toBeNull();
    ledgerCloud.close();
  });

  it("leave a shared ledger's rows out of a replaced copy of the user's own data", async () => {
    const { ledgerCloud } = shareFamily({ attached: true, detached: true });
    addFamilyTransaction('groceries', 30);
    addTransaction('lunch', 12);
    // A stray row of the shared ledger in the user's own copy.
    putRow(cloud, 'groceries', { ...localRow('groceries') }, 'rev-1');
    await engine.uploadAllReplacingCloud();
    expect(cloudRow('groceries')).toBeNull();
    expect(cloudRow('lunch')?.amount).toBe(12);
    ledgerCloud.close();
  });
});

describe('with one pull per sync', () => {
  beforeEach(async () => {
    addTransaction('lunch', 12);
    addTransaction('dinner', 20);
    await engine.syncNow();
    calls = [];
  });

  it("takes another phone's delete over an edit made here meanwhile", async () => {
    const stored = cloudRow('lunch')!;
    const { rev: _rev, ...row } = stored;
    putRow(cloud, 'lunch', { ...row, deleted_at: now }, 'rev-other');
    remoteChanged = true;
    app.exec("UPDATE transactions SET amount = 99 WHERE id = 'lunch'");
    await engine.syncNow();
    expect(cloudRow('lunch')?.deleted_at).toBe(now);
    expect(localRow('lunch')?.deleted_at).toBe(now);
  });

  it("applies another phone's change in the same sync that sends this phone's", async () => {
    const { rev: _rev, ...row } = cloudRow('dinner')!;
    putRow(cloud, 'dinner', { ...row, amount: 50 }, 'rev-other');
    remoteChanged = true;
    app.exec("UPDATE transactions SET amount = 13 WHERE id = 'lunch'");
    const outcome = await engine.syncNow();
    expect(rounds()).toEqual(['pull', 'push']);
    expect(localRow('dinner')?.amount).toBe(50);
    expect(cloudRow('lunch')?.amount).toBe(13);
    expect(outcome.appliedRows).toBe(1);
  });

  it('keeps an edit made here over a stale copy of the same row from the pull', async () => {
    const { rev: _rev, ...row } = cloudRow('lunch')!;
    putRow(cloud, 'lunch', { ...row, amount: 77 }, 'rev-other');
    remoteChanged = true;
    app.exec("UPDATE transactions SET amount = 14 WHERE id = 'lunch'");
    await engine.syncNow();
    expect(localRow('lunch')?.amount).toBe(14);
    expect(cloudRow('lunch')?.amount).toBe(14);
  });
});

describe('images', () => {
  it('stop the push when one keeps failing to upload, and the retry sends only the rest', async () => {
    let failing = true;
    const sent: string[] = [];
    (apiUploadMedia as jest.Mock).mockImplementation(async (_token, _media, path: string) => {
      sent.push(path);
      if (failing && path === 'receipts/r2.jpg') {
        throw Object.assign(new Error('upload failed'), { code: 'server', status: 502 });
      }
    });
    for (let i = 0; i < 6; i++) {
      files.add(`user-assets/receipts/r${i}.jpg`);
      addTransaction(`t${i}`, i, { receipt_uri: `receipts/r${i}.jpg` });
    }
    await expect(engine.syncNow()).rejects.toThrow('upload failed');
    // No row may reach another phone before its image can.
    expect(calls).not.toContain('push');
    // Tried three times in the round before giving up.
    expect(sent.filter((path) => path === 'receipts/r2.jpg')).toHaveLength(3);
    failing = false;
    sent.length = 0;
    await engine.syncNow();
    expect(calls).toContain('push');
    // The next round sends only what had not gone up: the others are not
    // uploaded twice.
    expect(sent).toEqual(['receipts/r2.jpg']);
    expect(app.prepare('SELECT COUNT(*) AS n FROM sync_media_pending').get()?.n).toBe(0);
  }, 15_000);

  // 2026-11-10: four people turning Cloud Sync on were sent back to the
  // sign-in screen because one image upload failed once (CloudSyncApiError
  // "server" from uploadMedia). Cloudflare saw the same uploads end with the
  // phone closing the connection, and the same images went up a minute later.
  // A failure in a link drops the session, so one blip cost the whole setup.
  it('try a failed upload again in the same round before giving up', async () => {
    const tries = new Map<string, number>();
    (apiUploadMedia as jest.Mock).mockImplementation(async (_token, _media, path: string) => {
      const n = (tries.get(path) ?? 0) + 1;
      tries.set(path, n);
      if (path === 'receipts/r1.jpg' && n === 1) {
        throw Object.assign(new Error('server: http_500'), { code: 'server', status: 500 });
      }
      // How uploadMedia reports an upload that broke on the phone.
      if (path === 'receipts/r3.jpg' && n === 1) {
        throw Object.assign(new Error('network'), { code: 'network', status: 0 });
      }
      // 2026-11-12, 1.7.5: "server: http_408". The Worker never answers 408
      // (Cloudflare logged none for its host that week), so something on the
      // way timed the upload out: not a refusal of the image.
      if (path === 'receipts/r4.jpg' && n === 1) {
        throw Object.assign(new Error('server: http_408'), { code: 'server', status: 408 });
      }
    });
    for (let i = 0; i < 5; i++) {
      files.add(`user-assets/receipts/r${i}.jpg`);
      addTransaction(`t${i}`, i, { receipt_uri: `receipts/r${i}.jpg` });
    }
    await expect(engine.syncNow()).resolves.toMatchObject({ pushed: true });
    expect(tries.get('receipts/r1.jpg')).toBe(2);
    expect(tries.get('receipts/r3.jpg')).toBe(2);
    expect(tries.get('receipts/r4.jpg')).toBe(2);
    expect(app.prepare('SELECT COUNT(*) AS n FROM sync_media_pending').get()?.n).toBe(0);
  }, 15_000);

  it.each([
    ['the session was refused', 'unauthorized', 401],
    ['Pro was refused', 'not_pro', 403],
    ['the image was refused', 'server', 413],
    ['the request was malformed', 'server', 400],
  ] as const)('do not try again when %s', async (_case, code, status) => {
    const { CloudSyncApiError } = jest.requireActual<
      typeof import('~/features/cloudSync/services/cloudSyncApi')
    >('~/features/cloudSync/services/cloudSyncApi');
    (apiUploadMedia as jest.Mock).mockRejectedValue(new CloudSyncApiError(code, status));
    files.add('user-assets/receipts/r0.jpg');
    addTransaction('t0', 1, { receipt_uri: 'receipts/r0.jpg' });
    await expect(engine.syncNow()).rejects.toThrow(code);
    expect(apiUploadMedia).toHaveBeenCalledTimes(1);
  });

  it('download one a pulled row names at once, while failed ones wait', async () => {
    (apiDownloadMedia as jest.Mock).mockRejectedValue(new Error('404'));
    app.exec(
      "INSERT INTO sync_media_missing (path, channel) VALUES ('receipts/gone.jpg', 'personal')",
    );
    await engine.syncNow();
    (apiDownloadMedia as jest.Mock).mockClear();
    (apiDownloadMedia as jest.Mock).mockResolvedValue(undefined);
    addTransaction('lunch', 12);
    await engine.syncNow();
    const { rev: _rev, ...row } = cloudRow('lunch')!;
    putRow(cloud, 'photo', { ...row, id: 'photo', receipt_uri: 'receipts/new.jpg' }, 'rev-other');
    remoteChanged = true;
    await engine.syncNow();
    const paths = (apiDownloadMedia as jest.Mock).mock.calls.map((call) => call[2]);
    expect(paths).toEqual(['receipts/new.jpg']);
  });
});

describe("the choice screen's last change", () => {
  const info = () =>
    Object.fromEntries(
      cloud
        .prepare('SELECT key, value FROM sync_info')
        .all()
        .map((row) => [String(row.key), row.value]),
    );
  const infoWrites = () => calls.filter((call) => call.endsWith('SYNC_INFO'));
  const thisPhone = () =>
    String(cloud.prepare("SELECT origin FROM sync_rows WHERE row_id = 'lunch'").get()?.origin);
  const otherPhoneRow = (id: string, updatedAt: number, origin = 'other-phone') => {
    const { rev: _rev, ...row } = cloudRow('lunch')!;
    cloud
      .prepare('INSERT INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)')
      .run('transactions', id, JSON.stringify({ ...row, id }), `rev-${id}`, origin, updatedAt);
  };

  afterEach(() => jest.restoreAllMocks());

  it('names this phone once, so later edits do not rewrite sync_info', async () => {
    addTransaction('lunch', 12);
    await engine.syncNow();
    expect(info()).toEqual({ [`device_name:${thisPhone()}`]: 'Test' });
    calls = [];
    addTransaction('dinner', 30);
    await engine.syncNow();
    expect(rounds()).toEqual(['pull', 'push']);
    expect(infoWrites()).toEqual([]);
  });

  it("writes this phone's name again when it changes", async () => {
    addTransaction('lunch', 12);
    await engine.syncNow();
    const renamed = new SyncEngine({
      userId: 'test-user',
      channel: 'personal',
      url: 'local-test',
      getTursoToken: async () => 'local-test',
      getSessionToken: async () => 'local-test',
      mediaPath: '/v1/media',
      deviceName: 'Renamed',
    });
    Object.assign(renamed, { replica: (engine as unknown as { replica: unknown }).replica });
    calls = [];
    addTransaction('dinner', 30);
    await renamed.syncNow();
    expect(info()[`device_name:${thisPhone()}`]).toBe('Renamed');
    expect(infoWrites()).toEqual(['DELETE FROM SYNC_INFO', 'INSERT INTO SYNC_INFO']);
  });

  it("leaves a shared ledger's database without names", async () => {
    const { ledgerEngine, ledgerCloud } = shareFamily({ attached: true, detached: true });
    addFamilyTransaction('groceries', 30);
    await ledgerEngine.syncNow();
    expect(ledgerCloud.prepare('SELECT COUNT(*) AS n FROM sync_rows').get()?.n).toBeGreaterThan(0);
    expect(ledgerCloud.prepare('SELECT COUNT(*) AS n FROM sync_info').get()?.n).toBe(0);
    ledgerCloud.close();
  });

  it('never writes the keys older versions read', async () => {
    const start = Date.now();
    addTransaction('lunch', 12);
    await engine.syncNow();
    calls = [];
    jest.spyOn(Date, 'now').mockReturnValue(start + 25 * 3_600_000);
    addTransaction('dinner', 30);
    await engine.syncNow();
    expect(infoWrites()).toEqual([]);
    expect(info()).not.toHaveProperty('last_synced_at');
  });

  it("shows the newest row's time and phone", async () => {
    addTransaction('lunch', 12);
    await engine.syncNow();
    const later = Date.now() + 60_000;
    otherPhoneRow('from-pixel', later);
    cloud.prepare("INSERT INTO sync_info VALUES ('device_name:other-phone', 'Pixel 10')").run();
    await expect(engine.summarizeCloud()).resolves.toMatchObject({
      lastSyncedAt: later,
      lastDeviceName: 'Pixel 10',
    });
  });

  it('uses the keys an older version wrote when they are newer', async () => {
    addTransaction('lunch', 12);
    await engine.syncNow();
    // An older version names itself only in these keys, on every push.
    const later = Date.now() + 60_000;
    otherPhoneRow('from-old-app', later - 5, 'old-phone');
    cloud.exec(
      `DELETE FROM sync_info WHERE key IN ('last_synced_at', 'last_device_name');
       INSERT INTO sync_info VALUES ('last_synced_at', '${later}'), ('last_device_name', 'Old iPhone');`,
    );
    await expect(engine.summarizeCloud()).resolves.toMatchObject({
      lastSyncedAt: later,
      lastDeviceName: 'Old iPhone',
    });
  });

  it('names no phone when the newest row is from one it cannot name', async () => {
    addTransaction('lunch', 12);
    await engine.syncNow();
    const later = Date.now() + 60_000;
    otherPhoneRow('from-unknown', later, 'unknown-phone');
    await expect(engine.summarizeCloud()).resolves.toMatchObject({
      lastSyncedAt: later,
      lastDeviceName: null,
    });
  });
});

describe('exchange rates', () => {
  const addRate = (id: string, quote: string, source: 'api' | 'manual', rate = 1.5) =>
    app
      .prepare(
        `INSERT INTO exchange_rates (id, base_currency, quote_currency, rate, as_of_date, source, updated_at)
         VALUES (?, 'USD', ?, ?, '2026-11-05', ?, ?)`,
      )
      .run(id, quote, rate, source, now);
  const rateRow = (id: string) =>
    app.prepare('SELECT * FROM exchange_rates WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
  const cloudRate = (id: string) => {
    const row = cloud
      .prepare("SELECT data FROM sync_rows WHERE table_name = 'exchange_rates' AND row_id = ?")
      .get(id);
    return row ? (JSON.parse(String(row.data)) as Record<string, unknown>) : null;
  };
  /** A rate in the cloud copy, as another phone (or an older version) sent it. */
  const putCloudRate = (id: string, quote: string, source: string, rate: number, rev: string) =>
    cloud.prepare('INSERT OR REPLACE INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)').run(
      'exchange_rates',
      id,
      JSON.stringify({
        id,
        base_currency: 'USD',
        quote_currency: quote,
        rate,
        as_of_date: '2026-11-06',
        source,
        updated_at: '2026-11-06T00:00:00.000Z',
      }),
      rev,
      'another-phone',
      1,
    );
  const outboxCount = () =>
    Number(app.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get()?.n ?? 0);

  beforeEach(async () => {
    await engine.syncNow();
    calls = [];
  });

  it('stay on the phone when downloaded, so the daily refresh sends nothing', async () => {
    addRate('eur', 'EUR', 'api');
    addRate('gbp', 'GBP', 'api');
    app.exec("UPDATE exchange_rates SET rate = 2, updated_at = 'later' WHERE source = 'api'");
    expect(outboxCount()).toBe(0);
    await engine.syncNow();
    expect(rounds()).toEqual(['pull']);
    expect(cloudRate('eur')).toBeNull();
  });

  it('sync when typed, including a downloaded rate the user overrides', async () => {
    addRate('jpy', 'JPY', 'manual', 150);
    addRate('eur', 'EUR', 'api');
    await engine.syncNow();
    expect(cloudRate('jpy')).toMatchObject({ rate: 150, source: 'manual' });
    expect(cloudRate('eur')).toBeNull();
    app.exec("UPDATE exchange_rates SET rate = 0.9, source = 'manual' WHERE id = 'eur'");
    await engine.syncNow();
    expect(cloudRate('eur')).toMatchObject({ rate: 0.9, source: 'manual' });
    app.exec("DELETE FROM exchange_rates WHERE id = 'jpy'");
    await engine.syncNow();
    expect(cloudRate('jpy')).toBeNull();
  });

  it("keep this phone's downloaded rates over an older version's", async () => {
    addRate('eur', 'EUR', 'api', 0.8);
    putCloudRate('eur', 'EUR', 'api', 0.5, 'rev-old');
    remoteChanged = true;
    await engine.syncNow();
    expect(rateRow('eur')?.rate).toBe(0.8);
    // Its delete leaves this phone's rate too.
    cloud.exec("DELETE FROM sync_rows WHERE row_id = 'eur'");
    remoteChanged = true;
    await engine.syncNow();
    expect(rateRow('eur')?.rate).toBe(0.8);
    expect(outboxCount()).toBe(0);
  });

  it("take a typed rate from another phone over this phone's downloaded one", async () => {
    // The pulled row's id sorts after the local one, which would win a clash
    // between two synced rows.
    addRate('a-local', 'EUR', 'api', 0.8);
    putCloudRate('z-typed', 'EUR', 'manual', 0.95, 'rev-typed');
    remoteChanged = true;
    await engine.syncNow();
    expect(rateRow('a-local')).toBeUndefined();
    expect(rateRow('z-typed')).toMatchObject({ rate: 0.95, source: 'manual' });
    expect(outboxCount()).toBe(0);
    expect(cloudRate('z-typed')).toMatchObject({ rate: 0.95 });
  });

  it("keep a typed rate over an older version's downloaded one with a lower id", async () => {
    // An older version still sends its downloaded rates. Its row's id sorts
    // first, which would win a clash between two synced rows and retire the
    // rate the user typed here.
    addRate('z-typed', 'EUR', 'manual', 0.95);
    await engine.syncNow();
    putCloudRate('a-old-download', 'EUR', 'api', 0.5, 'rev-old');
    remoteChanged = true;
    await engine.syncNow();
    expect(rateRow('z-typed')).toMatchObject({ rate: 0.95, source: 'manual' });
    expect(rateRow('a-old-download')).toBeUndefined();
    expect(cloudRate('z-typed')).toMatchObject({ rate: 0.95 });
  });

  it("leave an older version's downloaded rates out of a copy this phone replaces", async () => {
    addRate('eur', 'EUR', 'api', 0.8);
    addRate('jpy', 'JPY', 'manual', 150);
    putCloudRate('old-gbp', 'GBP', 'api', 0.7, 'rev-old');
    putCloudRate('eur', 'EUR', 'api', 0.5, 'rev-old-eur');
    await engine.uploadAllReplacingCloud();
    expect(cloudRate('old-gbp')).toBeNull();
    expect(cloudRate('eur')).toBeNull();
    expect(cloudRate('jpy')).toMatchObject({ rate: 150 });
    expect(rateRow('eur')?.rate).toBe(0.8);
  });

  it("keep this phone's downloaded rates when it takes the cloud copy", async () => {
    addRate('eur', 'EUR', 'api', 0.8);
    addRate('jpy', 'JPY', 'manual', 150);
    putCloudRate('cad', 'CAD', 'manual', 1.4, 'rev-cad');
    putCloudRate('old-gbp', 'GBP', 'api', 0.7, 'rev-old');
    await engine.replaceLocalWithCloud();
    expect(rateRow('eur')?.rate).toBe(0.8);
    expect(rateRow('jpy')).toBeUndefined();
    expect(rateRow('cad')).toMatchObject({ rate: 1.4, source: 'manual' });
    expect(rateRow('old-gbp')).toBeUndefined();
  });

  it('replace triggers an earlier version made, which queued downloaded rates', async () => {
    app.exec(`
      DROP TRIGGER m2t_sync_exchange_rates_ins;
      CREATE TRIGGER m2t_sync_exchange_rates_ins AFTER INSERT ON exchange_rates BEGIN
        INSERT INTO sync_outbox (table_name, row_id, seq) VALUES ('exchange_rates', NEW.id, 1);
      END;
      DELETE FROM sync_state WHERE key = 'capture_version';
    `);
    addRate('queued', 'CHF', 'api');
    expect(outboxCount()).toBe(1);
    putCloudRate('queued', 'CHF', 'api', 0.9, 'rev-old');
    remoteChanged = true;
    await engine.syncNow();
    // The old entry goes up as a delete; the phone keeps its rate.
    expect(cloudRate('queued')).toBeNull();
    expect(rateRow('queued')).toBeDefined();
    addRate('later', 'SEK', 'api');
    expect(outboxCount()).toBe(0);
  });
});

describe('with a replica the engine cannot pull into', () => {
  /** Stands in for deleting the replica and downloading the cloud copy again. */
  function spyOnRebuild() {
    return jest
      .spyOn(engine as unknown as { rebuildReplica: () => Promise<void> }, 'rebuildReplica')
      .mockImplementation(async () => {
        calls.push('rebuild');
        stuckPull = false;
      });
  }

  it('downloads it again when nothing waits to be pushed, and applies what came down', async () => {
    await engine.uploadAllReplacingCloud();
    // Another phone renamed the profile; this phone's replica is stuck.
    const { rev: _rev, ...settings } = cloudRow('primary')!;
    cloud
      .prepare("UPDATE sync_rows SET data = ?, rev = 'rev-other' WHERE row_id = 'primary'")
      .run(
        JSON.stringify({ ...settings, profile_name: 'Sam', updated_at: '2026-11-07T21:00:00Z' }),
      );
    stuckPull = true;
    const rebuild = spyOnRebuild();
    calls = [];

    await engine.syncNow();

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => ['pull', 'rebuild', 'push'].includes(call))).toEqual([
      'pull',
      'rebuild',
    ]);
    expect(app.prepare('SELECT profile_name FROM settings').get()?.profile_name).toBe('Sam');
  });

  it('keeps it, and fails as before, while an edit waits to be pushed', async () => {
    addTransaction('lunch', 12);
    pushError = new Error('offline');
    await expect(engine.syncNow()).rejects.toThrow('offline');
    pushError = null;
    stuckPull = true;
    const rebuild = spyOnRebuild();

    await expect(engine.syncNow()).rejects.toThrow(STUCK);
    expect(rebuild).not.toHaveBeenCalled();
  });
});

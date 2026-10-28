// Cloud Sync engine. See README.md > Cloud Sync.
//
// The app database (expo-sqlite, read synchronously everywhere) stays the
// source of truth on the phone. Beside it sits a local Turso Sync replica of
// the user's cloud database, which carries changes to and from Turso Cloud:
//
//   app tables ──triggers──▶ sync_outbox ──flush──▶ replica.sync_rows ──push──▶ Turso Cloud
//   app tables ◀──apply──── diff of revisions ◀──── replica.sync_rows ◀──pull── Turso Cloud
//
// A row is stored in the replica as JSON with a revision. After a pull, every
// revision that differs from the one this phone last wrote or applied
// (sync_row_meta) is a change from another phone and is written into the app
// table with the triggers quiet. A row still waiting in the outbox wins over
// the pulled copy: it is newer and goes up on the next flush.
//
// The replica's sync_rows is never written with an upsert: in the Turso engine
// (0.8.3) `INSERT … ON CONFLICT DO UPDATE` on its two-column key fails once the
// replica has pulled. Plain UPDATE and INSERT are used instead.

import { Directory, File, Paths } from 'expo-file-system';

import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { reportError } from '~/services/errorReporting';
import { collectReferencedAssetPaths } from '~/services/userAssetGc';
import { assetRelativePathFromRef } from '~/services/userAssets';
import { newId } from '~/utils/id';

import {
  captureTriggersSql,
  dropCaptureTriggersSql,
  ENQUEUE_ROW_SQL,
  enqueueAllSql,
} from '../lib/capture';
import {
  buildWrite,
  decodeRow,
  diffRevs,
  encodeRow,
  makeRev,
  type RevEntry,
  type Row,
  rowKey,
} from '../lib/rowCodec';
import {
  ASSET_COLUMNS,
  CURRENT_SYNCED_SHAPE,
  isSyncTable,
  MEANINGFUL_DATA_TABLES,
  shapeAdditions,
  SYNC_TABLES,
  type SyncedShape,
  type SyncTable,
} from '../lib/syncTables';
import { downloadMedia, existingMedia, uploadMedia } from './cloudSyncApi';

type TursoModule = typeof import('@tursodatabase/sync-react-native');
type Replica = InstanceType<TursoModule['Database']>;

/** The cloud copy's tables. Identical to `CLOUD_SCHEMA_SQL` in the Worker's src/turso.ts. */
const CLOUD_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS sync_rows (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    data TEXT NOT NULL,
    rev TEXT NOT NULL,
    origin TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (table_name, row_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_info (key TEXT NOT NULL PRIMARY KEY, value TEXT)`,
];

const FLUSH_BATCH = 250;
const FETCH_BATCH = 200;
const MEDIA_BATCH = 100;
const DOWNLOAD_CONCURRENCY = 4;
/** A missing image is retried on this many syncs, then left to its fallback. */
const MAX_DOWNLOAD_ATTEMPTS = 10;
const SHAPE_STATE_KEY = 'synced_shape';

export interface DataSummary {
  transactions: number;
  accounts: number;
  hasMeaningfulData: boolean;
  /** Cloud only: when and from which phone the copy last changed. */
  lastSyncedAt?: number | null;
  lastDeviceName?: string | null;
}

export interface EngineConfig {
  userId: string;
  url: string;
  /** Returns a current Turso token for the user's database. */
  getTursoToken: () => Promise<string>;
  /** Returns the Worker session token, for images. */
  getSessionToken: () => Promise<string>;
  deviceName: string;
}

export interface SyncOutcome {
  /** Rows written to or removed from the app tables. */
  appliedRows: number;
}

let turso: TursoModule | null | undefined;

/** The Turso native module, or null on a build without it. */
function loadTurso(): TursoModule | null {
  if (turso !== undefined) return turso;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    turso = require('@tursodatabase/sync-react-native') as TursoModule;
    turso.getDbPath('probe.db');
  } catch {
    turso = null;
  }
  return turso;
}

export function isCloudSyncAvailable(): boolean {
  return loadTurso() !== null;
}

function replicaFileName(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return `m2t-cloud-${(hash >>> 0).toString(36)}.db`;
}

// ---------------------------------------------------------------------------
// App database helpers (synchronous, like the rest of the app)

const columnCache = new Map<string, Set<string>>();

function localColumns(table: string): Set<string> {
  let cols = columnCache.get(table);
  if (!cols) {
    const info = getSQLite().getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`);
    cols = new Set(info.map((c) => c.name));
    if (cols.size) columnCache.set(table, cols);
  }
  return cols;
}

function tableExists(table: string): boolean {
  return localColumns(table).size > 0;
}

function getState(key: string): string | null {
  const row = getSQLite().getFirstSync<{ value: string | null }>(
    'SELECT value FROM sync_state WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

function setState(key: string, value: string | null): void {
  getSQLite().runSync(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

let cachedDeviceId: string | null = null;

/** This install's id in revisions and `origin`; kept across sign-outs. */
function deviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id = getState('device_id');
  if (!id) {
    id = newId().replace(/-/g, '').slice(0, 16);
    setState('device_id', id);
  }
  cachedDeviceId = id;
  return id;
}

let revCounter = 0;
function nextRev(): string {
  revCounter += 1;
  return makeRev(deviceId(), Date.now(), revCounter);
}

/** Runs `fn` in one app-database transaction with the capture triggers quiet. */
function applyQuietly(fn: () => void): void {
  const db = getSQLite();
  db.withTransactionSync(() => {
    setState('applying', '1');
    try {
      fn();
    } finally {
      setState('applying', '0');
    }
  });
}

function outboxKeys(): Set<string> {
  return new Set(
    getSQLite()
      .getAllSync<{ table_name: string; row_id: string }>(
        'SELECT table_name, row_id FROM sync_outbox',
      )
      .map((r) => rowKey(r.table_name, r.row_id)),
  );
}

function recordRev(table: string, id: string, rev: string | null): void {
  if (rev) {
    getSQLite().runSync(
      'INSERT OR REPLACE INTO sync_row_meta (table_name, row_id, rev) VALUES (?, ?, ?)',
      [table, id, rev],
    );
  } else {
    getSQLite().runSync('DELETE FROM sync_row_meta WHERE table_name = ? AND row_id = ?', [
      table,
      id,
    ]);
  }
}

interface UniqueIndex {
  columns: string[];
  /** Partial indexes here are all `WHERE deleted_at IS NULL`. */
  partial: boolean;
}

const uniqueIndexCache = new Map<string, UniqueIndex[]>();

/** The table's unique indexes other than its primary key. */
function uniqueIndexes(table: string): UniqueIndex[] {
  let found = uniqueIndexCache.get(table);
  if (found) return found;
  const db = getSQLite();
  found = db
    .getAllSync<{ name: string; unique: number; origin: string; partial: number }>(
      `PRAGMA index_list("${table}")`,
    )
    .filter((index) => index.unique === 1 && index.origin !== 'pk')
    .map((index) => ({
      columns: db
        .getAllSync<{ name: string }>(`PRAGMA index_info("${index.name}")`)
        .map((c) => c.name),
      partial: index.partial === 1,
    }));
  uniqueIndexCache.set(table, found);
  return found;
}

/** Queues images to upload on the next sync (kept until they are up). */
function queueMedia(paths: Iterable<string>): void {
  const db = getSQLite();
  for (const path of paths) {
    db.runSync('INSERT OR IGNORE INTO sync_media_pending (path) VALUES (?)', [path]);
  }
}

/**
 * Two phones can each make a row with the same natural key (the week's
 * auto-created budget, an exchange-rate pair, a wage month) under different
 * ids, which the table's unique index refuses. The lower id wins on every
 * phone: a losing local row is retired (soft-deleted, or deleted where the
 * table has no tombstones) and the change queued so the cloud follows; a
 * losing incoming row is skipped. Returns whether the incoming row may be
 * written.
 */
function resolveUniqueClashes(table: string, row: Row): boolean {
  const db = getSQLite();
  const columns = localColumns(table);
  const tombstones = columns.has('deleted_at');
  for (const index of uniqueIndexes(table)) {
    if (index.columns.some((c) => !(c in row))) continue;
    const live = index.partial && tombstones;
    if (live && row.deleted_at != null) continue;
    const where =
      index.columns.map((c) => `"${c}" IS ?`).join(' AND ') +
      (live ? ' AND deleted_at IS NULL' : '') +
      ' AND id <> ?';
    const clashes = db.getAllSync<{ id: string }>(`SELECT id FROM "${table}" WHERE ${where}`, [
      ...index.columns.map((c) => row[c] ?? null),
      row.id ?? null,
    ]);
    for (const clash of clashes) {
      if (String(row.id) > clash.id) return false;
      if (live) {
        const now = new Date().toISOString();
        db.runSync(
          columns.has('updated_at')
            ? `UPDATE "${table}" SET deleted_at = ?, updated_at = ? WHERE id = ?`
            : `UPDATE "${table}" SET deleted_at = ? WHERE id = ?`,
          columns.has('updated_at') ? [now, now, clash.id] : [now, clash.id],
        );
      } else {
        db.runSync(`DELETE FROM "${table}" WHERE id = ?`, [clash.id]);
      }
      db.runSync(ENQUEUE_ROW_SQL, [table, clash.id]);
    }
  }
  return true;
}

/** Writes one pulled row, keeping this phone's device-local settings. */
function writeRow(table: string, row: Row): boolean {
  const db = getSQLite();
  const exists = !!db.getFirstSync('SELECT 1 FROM "' + table + '" WHERE id = ?', [row.id ?? '']);
  // A settings row only ever updates this phone's own row.
  if (!exists && table === 'settings') return false;
  if (!resolveUniqueClashes(table, row)) return false;
  const [sql, params] = buildWrite(table, row, exists);
  db.runSync(sql, params);
  return true;
}

/**
 * Writes one pulled row in its own savepoint, so a row this app version cannot
 * store (a constraint another version allows) is skipped and reported instead
 * of stopping every later sync.
 */
function writeRowSafely(table: string, row: Row): boolean {
  const db = getSQLite();
  db.execSync('SAVEPOINT m2t_sync_row');
  try {
    const written = writeRow(table, row);
    db.execSync('RELEASE m2t_sync_row');
    return written;
  } catch (error) {
    db.execSync('ROLLBACK TO m2t_sync_row; RELEASE m2t_sync_row');
    reportError(error, { scope: 'cloud_sync', stage: 'apply_row', table });
    return false;
  }
}

function collectAssetRefs(table: string, row: Row | null, into: Set<string>): void {
  if (!row || !isSyncTable(table)) return;
  for (const column of ASSET_COLUMNS[table] ?? []) {
    const value = row[column];
    if (typeof value !== 'string') continue;
    const rel = assetRelativePathFromRef(value);
    if (rel && rel.includes('/')) into.add(rel);
  }
}

/** Remembers what this app version syncs, after the phone holds all of it. */
function saveSyncedShape(): void {
  setState(SHAPE_STATE_KEY, JSON.stringify(CURRENT_SYNCED_SHAPE));
}

/**
 * After an app update that syncs more (a new table, a new image column), the
 * rows and images that already existed are queued once, and remote rows of
 * the new tables applied on the next pull.
 */
function catchUpSyncedShape(): void {
  const raw = getState(SHAPE_STATE_KEY);
  if (raw === JSON.stringify(CURRENT_SYNCED_SHAPE)) return;
  let saved: SyncedShape | null = null;
  try {
    saved = raw ? (JSON.parse(raw) as SyncedShape) : null;
  } catch {
    saved = null;
  }
  const { newTables, assetsChanged } = shapeAdditions(saved);
  const db = getSQLite();
  db.withTransactionSync(() => {
    for (const table of newTables) {
      if (tableExists(table)) db.execSync(enqueueAllSql(table));
    }
    if (assetsChanged) queueMedia(collectReferencedAssetPaths());
    if (newTables.length) setState('apply_pending', '1');
    saveSyncedShape();
  });
}

/**
 * Every phone needs the default ledger, and its open ledger must exist. After
 * the cloud copy replaced this phone's data (which may come from an app
 * before ledgers, or not have the ledger this phone had open), put both right,
 * as a backup restore does. The app then reopens the default ledger.
 */
function ensureDefaultLedger(): void {
  if (!tableExists('ledgers')) return;
  const db = getSQLite();
  const now = new Date().toISOString();
  db.runSync(
    `INSERT OR IGNORE INTO ledgers (id, sort_order, created_at, updated_at) VALUES (?, 0, ?, ?)`,
    [DEFAULT_LEDGER_ID, now, now],
  );
  db.runSync('UPDATE ledgers SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [
    DEFAULT_LEDGER_ID,
  ]);
  db.runSync(
    `UPDATE settings SET active_ledger_id = NULL
     WHERE active_ledger_id IS NOT NULL
       AND active_ledger_id NOT IN (SELECT id FROM ledgers WHERE deleted_at IS NULL)`,
  );
}

// ---------------------------------------------------------------------------
// Capture

export function enableCapture(): void {
  const db = getSQLite();
  for (const table of SYNC_TABLES) {
    if (tableExists(table)) db.execSync(captureTriggersSql(table));
  }
}

export function disableCapture(): void {
  const db = getSQLite();
  for (const table of SYNC_TABLES) db.execSync(dropCaptureTriggersSql(table));
}

export function pendingChangeCount(): number {
  return getSQLite().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox')?.n ?? 0;
}

/** Forgets everything this phone knew about the cloud copy (sign-out, account switch). */
export function resetLocalSyncState(): void {
  disableCapture();
  getSQLite().execSync(`
    DELETE FROM sync_outbox;
    DELETE FROM sync_row_meta;
    DELETE FROM sync_media_pending;
    DELETE FROM sync_media_missing;
    DELETE FROM sync_state WHERE key NOT IN ('applying', 'device_id');
  `);
}

// ---------------------------------------------------------------------------
// Summaries for the "Keep which data?" choice

const SUMMARY_TABLES = ['accounts', ...MEANINGFUL_DATA_TABLES] as const;

function summaryFromCounts(count: (table: string) => number): DataSummary {
  return {
    transactions: count('transactions'),
    accounts: count('accounts'),
    hasMeaningfulData: MEANINGFUL_DATA_TABLES.some((t) => count(t) > 0),
  };
}

export function summarizeLocal(): DataSummary {
  const db = getSQLite();
  return summaryFromCounts((table) =>
    tableExists(table)
      ? (db.getFirstSync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM "${table}" WHERE deleted_at IS NULL`,
        )?.n ?? 0)
      : 0,
  );
}

// ---------------------------------------------------------------------------
// The engine

interface StoredRow {
  data: string;
  rev: string;
}

export class SyncEngine {
  private replica: Replica | null = null;
  private running: Promise<SyncOutcome> | null = null;
  /** Serializes every operation on the replica (syncs, pulls, full replacements). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: EngineConfig) {}

  get userId(): string {
    return this.config.userId;
  }

  /** Opens the replica, downloading the cloud copy on first use. Needs the network then. */
  async open(): Promise<void> {
    if (this.replica) return;
    const mod = loadTurso();
    if (!mod) throw new Error('turso_unavailable');
    const replica = new mod.Database({
      path: mod.getDbPath(replicaFileName(this.config.userId)),
      url: this.config.url,
      authToken: () => this.config.getTursoToken(),
      clientName: 'money2time',
      bootstrapIfEmpty: true,
    });
    await replica.connect();
    for (const sql of CLOUD_SCHEMA_SQL) await replica.exec(sql);
    this.replica = replica;
  }

  close(): void {
    this.replica?.close();
    this.replica = null;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Brings the replica up to date with the cloud. Opening only downloads a
   * copy when the replica is empty, so one kept from an earlier session (an
   * expired sign-in, an app closed mid-link) must be pulled before any
   * decision is made from it.
   */
  pullLatest(): Promise<void> {
    return this.exclusive(async () => {
      await this.db().pull();
    });
  }

  /** Resolves once every operation started so far has finished (sign-out waits for it). */
  async waitIdle(): Promise<void> {
    await this.queue;
  }

  private db(): Replica {
    if (!this.replica) throw new Error('replica_closed');
    return this.replica;
  }

  async summarizeCloud(): Promise<DataSummary> {
    const replica = this.db();
    const counts = new Map<string, number>();
    const rows = await replica.all(
      `SELECT table_name, data FROM sync_rows WHERE table_name IN (${SUMMARY_TABLES.map(() => '?').join(', ')})`,
      [...SUMMARY_TABLES],
    );
    for (const row of rows) {
      try {
        const data = JSON.parse(String(row.data)) as { deleted_at?: unknown };
        if (data.deleted_at != null) continue;
      } catch {
        continue;
      }
      const table = String(row.table_name);
      counts.set(table, (counts.get(table) ?? 0) + 1);
    }
    const info = await replica.all('SELECT key, value FROM sync_info');
    const infoMap = new Map(
      info.map((r) => [String(r.key), r.value == null ? null : String(r.value)]),
    );
    return {
      ...summaryFromCounts((table) => counts.get(table) ?? 0),
      lastSyncedAt: Number(infoMap.get('last_synced_at') ?? '') || null,
      lastDeviceName: infoMap.get('last_device_name') ?? null,
    };
  }

  /** Makes this phone's data the cloud copy: other phones follow it. */
  uploadAllReplacingCloud(): Promise<void> {
    return this.exclusive(async () => {
      const replica = this.db();
      const db = getSQLite();
      // Every row the cloud has must be known here to be deleted.
      await replica.pull();
      // The whole phone is queued before the cloud copy is cleared, so an app
      // killed in between still uploads everything on its next sync.
      db.withTransactionSync(() => {
        db.execSync('DELETE FROM sync_row_meta; DELETE FROM sync_outbox;');
        for (const table of SYNC_TABLES) {
          if (tableExists(table)) db.execSync(enqueueAllSql(table));
        }
        queueMedia(collectReferencedAssetPaths());
        saveSyncedShape();
      });
      enableCapture();
      await replica.exec('DELETE FROM sync_rows');
      await this.runSync();
    });
  }

  /** Replaces this phone's synced data with the cloud copy. */
  replaceLocalWithCloud(): Promise<void> {
    return this.exclusive(async () => {
      const replica = this.db();
      const db = getSQLite();
      await replica.pull();
      const assets = new Set<string>();
      const perTable = new Map<string, { row_id: string; data: string; rev: string }[]>();
      for (const table of SYNC_TABLES) {
        const rows = await replica.all(
          'SELECT row_id, data, rev FROM sync_rows WHERE table_name = ?',
          [table],
        );
        perTable.set(
          table,
          rows.map((r) => ({ row_id: String(r.row_id), data: String(r.data), rev: String(r.rev) })),
        );
      }
      applyQuietly(() => {
        db.execSync(
          'DELETE FROM sync_outbox; DELETE FROM sync_row_meta; DELETE FROM sync_media_pending;',
        );
        for (const table of SYNC_TABLES) {
          if (!tableExists(table)) continue;
          // The settings row is updated in place so this phone keeps its own
          // device-local settings (and its purchase identity).
          if (table !== 'settings') db.execSync(`DELETE FROM "${table}"`);
          const cols = localColumns(table);
          for (const stored of perTable.get(table) ?? []) {
            const row = decodeRow(table, stored.data, cols);
            if (!row) continue;
            if (writeRowSafely(table, row)) collectAssetRefs(table, row, assets);
            recordRev(table, stored.row_id, stored.rev);
          }
        }
        ensureDefaultLedger();
        saveSyncedShape();
      });
      enableCapture();
      await this.downloadMedia(assets);
    });
  }

  /** Flush, push, pull and apply. Concurrent calls share one run. */
  syncNow(): Promise<SyncOutcome> {
    if (this.running) return this.running;
    this.running = this.exclusive(() => this.runSync()).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runSync(): Promise<SyncOutcome> {
    const replica = this.db();
    enableCapture();
    catchUpSyncedShape();
    const pushedRows = await this.flushOutbox();
    if (pushedRows > 0) await this.recordLastDevice();
    // Images first: a row must never reach another phone before its image can.
    await this.uploadPendingMedia();
    await replica.push();
    const pulled = await replica.pull();
    let appliedRows = 0;
    // Also re-applies after an apply that failed, which a later pull with no
    // new changes would otherwise never retry.
    if (pulled || getState('apply_pending') !== '0') {
      setState('apply_pending', '1');
      appliedRows = await this.applyRemoteChanges();
      setState('apply_pending', '0');
    }
    await this.downloadMedia(new Set());
    return { appliedRows };
  }

  /** When and from which phone the cloud copy last changed, for the choice screen. */
  private async recordLastDevice(): Promise<void> {
    const replica = this.db();
    await replica.transaction(async () => {
      await replica.run(
        "DELETE FROM sync_info WHERE key IN ('last_synced_at', 'last_device_name')",
      );
      await replica.run('INSERT INTO sync_info (key, value) VALUES (?, ?), (?, ?)', [
        'last_synced_at',
        String(Date.now()),
        'last_device_name',
        this.config.deviceName,
      ]);
    });
  }

  /** The stored data and revision of `ids` in one table, read in batches. */
  private async storedRows(table: string, ids: string[]): Promise<Map<string, StoredRow>> {
    const found = new Map<string, StoredRow>();
    for (let i = 0; i < ids.length; i += FETCH_BATCH) {
      const slice = ids.slice(i, i + FETCH_BATCH);
      const rows = await this.db().all(
        `SELECT row_id, data, rev FROM sync_rows WHERE table_name = ? AND row_id IN (${slice.map(() => '?').join(',')})`,
        [table, ...slice],
      );
      for (const r of rows)
        found.set(String(r.row_id), { data: String(r.data), rev: String(r.rev) });
    }
    return found;
  }

  /** Copies outbox rows into the replica. Returns how many rows changed there. */
  private async flushOutbox(): Promise<number> {
    const db = getSQLite();
    const replica = this.db();
    const origin = deviceId();
    let changedRows = 0;
    for (;;) {
      const batch = db.getAllSync<{ table_name: string; row_id: string; seq: number }>(
        'SELECT table_name, row_id, seq FROM sync_outbox ORDER BY seq LIMIT ?',
        [FLUSH_BATCH],
      );
      if (!batch.length) break;
      const stored = new Map<string, StoredRow>();
      const idsByTable = new Map<string, string[]>();
      for (const entry of batch) {
        if (!isSyncTable(entry.table_name)) continue;
        const ids = idsByTable.get(entry.table_name) ?? [];
        ids.push(entry.row_id);
        idsByTable.set(entry.table_name, ids);
      }
      for (const [table, ids] of idsByTable) {
        for (const [id, row] of await this.storedRows(table, ids))
          stored.set(rowKey(table, id), row);
      }

      const results: { table: string; id: string; seq: number; rev: string | null }[] = [];
      const assets = new Set<string>();
      await replica.transaction(async () => {
        for (const entry of batch) {
          const table = entry.table_name;
          const id = entry.row_id;
          if (!isSyncTable(table)) {
            results.push({ table, id, seq: entry.seq, rev: null });
            continue;
          }
          const local = db.getFirstSync<Row>(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
          const before = stored.get(rowKey(table, id));
          if (!local) {
            if (before) {
              await replica.run('DELETE FROM sync_rows WHERE table_name = ? AND row_id = ?', [
                table,
                id,
              ]);
              changedRows += 1;
            }
            results.push({ table, id, seq: entry.seq, rev: null });
            continue;
          }
          const data = encodeRow(table, local, before?.data ?? null);
          // Only device-local columns changed (a backup timestamp, say): the
          // cloud copy stays as it is.
          if (before && before.data === data) {
            results.push({ table, id, seq: entry.seq, rev: before.rev });
            continue;
          }
          const rev = nextRev();
          if (before) {
            await replica.run(
              `UPDATE sync_rows SET data = ?, rev = ?, origin = ?, updated_at = ?
               WHERE table_name = ? AND row_id = ?`,
              [data, rev, origin, Date.now(), table, id],
            );
          } else {
            await replica.run(
              `INSERT INTO sync_rows (table_name, row_id, data, rev, origin, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [table, id, data, rev, origin, Date.now()],
            );
          }
          changedRows += 1;
          results.push({ table, id, seq: entry.seq, rev });
          collectAssetRefs(table, local, assets);
        }
      });
      db.withTransactionSync(() => {
        // Queued with the outbox change, so an upload that fails is retried.
        queueMedia(assets);
        for (const r of results) {
          // Only clear the entry if the row did not change again meanwhile.
          db.runSync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND seq = ?', [
            r.table,
            r.id,
            r.seq,
          ]);
          recordRev(r.table, r.id, r.rev);
        }
      });
    }
    return changedRows;
  }

  /** Rows other phones changed or removed, minus those this phone is still sending. */
  private async remoteChanges(): Promise<{
    changed: RevEntry[];
    removed: { table: string; id: string }[];
  }> {
    const remote: RevEntry[] = (
      await this.db().all('SELECT table_name, row_id, rev FROM sync_rows')
    ).map((r) => ({ table: String(r.table_name), id: String(r.row_id), rev: String(r.rev) }));
    const local: RevEntry[] = getSQLite()
      .getAllSync<{ table_name: string; row_id: string; rev: string }>(
        'SELECT table_name, row_id, rev FROM sync_row_meta',
      )
      .map((r) => ({ table: r.table_name, id: r.row_id, rev: r.rev }));
    const pending = outboxKeys();
    const keep = (e: { table: string; id: string }) =>
      isSyncTable(e.table) && !pending.has(rowKey(e.table, e.id));
    const diff = diffRevs(remote, local);
    return { changed: diff.changed.filter(keep), removed: diff.removed.filter(keep) };
  }

  /** Writes rows other phones changed into the app tables. Returns rows written or removed. */
  private async applyRemoteChanges(): Promise<number> {
    const { changed, removed } = await this.remoteChanges();
    if (!changed.length && !removed.length) return 0;

    const fetched: { table: SyncTable; id: string; rev: string; data: string }[] = [];
    const idsByTable = new Map<SyncTable, string[]>();
    for (const entry of changed) {
      const table = entry.table as SyncTable;
      const ids = idsByTable.get(table) ?? [];
      ids.push(entry.id);
      idsByTable.set(table, ids);
    }
    for (const [table, ids] of idsByTable) {
      for (const [id, row] of await this.storedRows(table, ids)) {
        fetched.push({ table, id, rev: row.rev, data: row.data });
      }
    }

    const db = getSQLite();
    const assets = new Set<string>();
    let applied = 0;
    applyQuietly(() => {
      // Re-read: the user may have edited a row while the data was fetched,
      // and their edit wins.
      const pendingNow = outboxKeys();
      // Deletions first, so a replacement row with a new id does not clash
      // with the one it replaces.
      for (const item of removed) {
        if (pendingNow.has(rowKey(item.table, item.id))) continue;
        if (tableExists(item.table)) {
          applied += db.runSync(`DELETE FROM "${item.table}" WHERE id = ?`, [item.id]).changes;
        }
        recordRev(item.table, item.id, null);
      }
      for (const item of fetched) {
        if (!tableExists(item.table) || pendingNow.has(rowKey(item.table, item.id))) continue;
        const row = decodeRow(item.table, item.data, localColumns(item.table));
        if (row && writeRowSafely(item.table, row)) {
          applied += 1;
          collectAssetRefs(item.table, row, assets);
        }
        recordRev(item.table, item.id, item.rev);
      }
    });
    await this.downloadMedia(assets);
    return applied;
  }

  // -------------------------------------------------------------------------
  // Images

  /** Uploads every queued image the cloud does not have yet. */
  private async uploadPendingMedia(): Promise<void> {
    const db = getSQLite();
    const queued = db
      .getAllSync<{ path: string }>('SELECT path FROM sync_media_pending')
      .map((r) => r.path);
    if (!queued.length) return;
    // An image no longer on disk cannot go up; nothing references it either.
    const onDisk: string[] = [];
    for (const path of queued) {
      if (assetFile(path).exists) onDisk.push(path);
      else db.runSync('DELETE FROM sync_media_pending WHERE path = ?', [path]);
    }
    if (!onDisk.length) return;
    const token = await this.config.getSessionToken();
    for (let i = 0; i < onDisk.length; i += MEDIA_BATCH) {
      const slice = onDisk.slice(i, i + MEDIA_BATCH);
      const existing = await existingMedia(token, slice);
      for (const path of slice) {
        if (!existing.has(path)) await uploadMedia(token, path, assetFile(path));
        db.runSync('DELETE FROM sync_media_pending WHERE path = ?', [path]);
      }
    }
  }

  /**
   * Downloads `paths` that are not on disk, plus any earlier download that
   * failed. Never throws: a missing image must not stop the data (the row shows
   * its fallback), and it is retried on later syncs.
   */
  private async downloadMedia(paths: Set<string>): Promise<void> {
    const db = getSQLite();
    for (const path of paths) {
      if (!assetFile(path).exists) {
        db.runSync('INSERT OR IGNORE INTO sync_media_missing (path) VALUES (?)', [path]);
      }
    }
    const missing = db
      .getAllSync<{
        path: string;
      }>('SELECT path FROM sync_media_missing WHERE attempts < ?', [MAX_DOWNLOAD_ATTEMPTS])
      .map((r) => r.path);
    if (!missing.length) return;
    let token: string;
    try {
      token = await this.config.getSessionToken();
    } catch {
      return;
    }
    const next = async (): Promise<void> => {
      const path = missing.shift();
      if (!path) return;
      const file = assetFile(path);
      try {
        if (!file.exists) {
          const parent = file.parentDirectory;
          if (!parent.exists) parent.create({ intermediates: true });
          await downloadMedia(token, path, file);
        }
        db.runSync('DELETE FROM sync_media_missing WHERE path = ?', [path]);
      } catch {
        db.runSync('UPDATE sync_media_missing SET attempts = attempts + 1 WHERE path = ?', [path]);
      }
      await next();
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, next));
  }
}

function assetFile(relativePath: string): File {
  return new File(Paths.document, 'user-assets', relativePath);
}

/** Deletes the local replica files of a user (sign-out, account deletion). */
export function deleteReplicaFiles(userId: string): void {
  const mod = loadTurso();
  if (!mod) return;
  try {
    const path = mod.getDbPath(replicaFileName(userId));
    const slash = path.lastIndexOf('/');
    const dir = new Directory(`file://${path.slice(0, slash)}`);
    const base = path.slice(slash + 1);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry.name.startsWith(base)) entry.delete();
    }
  } catch (error) {
    console.warn('[cloudSync] replica cleanup failed', error);
  }
}

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
//
// One engine runs per channel: the user's own cloud copy ('personal') and each
// shared ledger's database (services/ledgerChannels.ts routes the rows). They
// share the outbox and the bookkeeping, which records each row's channel, and
// take turns on one queue.

import { Directory, File, Paths } from 'expo-file-system';

import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { collectReferencedAssetPaths } from '~/services/userAssetGc';
import { assetRelativePathFromRef, invalidateCustomUriCache } from '~/services/userAssets';
import { newId } from '~/utils/id';

import {
  captureTriggersSql,
  dropCaptureTriggersSql,
  ENQUEUE_ROW_SQL,
  enqueueAllSql,
} from '../lib/capture';
import { inLedgersSql, isLedgerScoped, NO_CHANNEL, PERSONAL_CHANNEL } from '../lib/ledgerRows';
import {
  buildWrite,
  decodeRow,
  deletedElsewhere,
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
  hasMeaningfulRows,
  isSyncTable,
  type LiveRows,
  MEANINGFUL_ROWS,
  shapeAdditions,
  SYNC_TABLES,
  type SyncedShape,
  type SyncTable,
} from '../lib/syncTables';
import { downloadMedia, existingMedia, uploadMedia } from './cloudSyncApi';
import {
  attachedKey,
  channelOfRow,
  detachedKey,
  enqueueLedgerRows,
  personalRowsSql,
  recordedChannel,
  sharedLedgerIds,
  unpushedKey,
} from './ledgerChannels';
import { listSharedLedgers } from './sharedLedgerStore';

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
  /** PERSONAL_CHANNEL, or a shared ledger's share id. */
  channel: string;
  /** A shared ledger's channel: the app's id of the ledger it carries. */
  ledgerId?: string;
  url: string;
  /** Returns a current Turso token for the user's database. */
  getTursoToken: () => Promise<string>;
  /** Returns the Worker session token, for images. */
  getSessionToken: () => Promise<string>;
  /** The channel's image routes on the Worker: `/v1/media` or `/v1/ledgers/<id>/media`. */
  mediaPath: string;
  /** Personal channel: refreshes the shared-ledger list before ledger rows are removed. */
  beforeLedgerRemovals?: () => Promise<void>;
  deviceName: string;
}

export interface SyncOutcome {
  /** Rows written to or removed from the app tables. */
  appliedRows: number;
  /** This phone's changes reached the cloud: other phones can be told to sync. */
  pushed: boolean;
  /** A pulled row could not be written; it is retried on the next sync. */
  applyError: Error | null;
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

function replicaFileName(userId: string, channel: string): string {
  if (channel !== PERSONAL_CHANNEL) return `m2t-ledger-${channel.replace(/[^a-z0-9]/gi, '')}.db`;
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

function recordRev(table: string, id: string, rev: string | null, channel: string): void {
  if (rev) {
    getSQLite().runSync(
      'INSERT OR REPLACE INTO sync_row_meta (table_name, row_id, rev, channel) VALUES (?, ?, ?, ?)',
      [table, id, rev, channel],
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

/** Queues images to upload on the next sync of `channel` (kept until they are up). */
function queueMedia(paths: Iterable<string>, channel: string): void {
  const db = getSQLite();
  for (const path of paths) {
    db.runSync('INSERT OR IGNORE INTO sync_media_pending (path, channel) VALUES (?, ?)', [
      path,
      channel,
    ]);
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
 * store (a constraint another version allows) does not stop the rows after it.
 * Returns whether it was written, or the error that stopped it.
 */
function writeRowSafely(table: string, row: Row): boolean | Error {
  const db = getSQLite();
  db.execSync('SAVEPOINT m2t_sync_row');
  try {
    const written = writeRow(table, row);
    db.execSync('RELEASE m2t_sync_row');
    return written;
  } catch (error) {
    db.execSync('ROLLBACK TO m2t_sync_row; RELEASE m2t_sync_row');
    return new Error(`Could not apply a pulled ${table} row`, { cause: error });
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
    if (assetsChanged) queueMedia(collectReferencedAssetPaths(), PERSONAL_CHANNEL);
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

/**
 * Changes waiting to go up. Those of a paused shared ledger are left out:
 * they wait for its owner's Pro, and must not keep the schedulers busy.
 */
export function pendingChangeCount(): number {
  const db = getSQLite();
  let count = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox')?.n ?? 0;
  const paused = listSharedLedgers()
    .filter((ledger) => !ledger.active)
    .map((ledger) => ledger.ledgerId);
  if (!count || !paused.length) return count;
  for (const table of SYNC_TABLES) {
    if (!isLedgerScoped(table) || !tableExists(table)) continue;
    count -=
      db.getFirstSync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = ?
           AND row_id IN (SELECT id FROM "${table}" WHERE ${inLedgersSql(table, paused)})`,
        [table],
      )?.n ?? 0;
  }
  return Math.max(0, count);
}

/**
 * Changes waiting to go up in the given shared ledgers, by default those that
 * sync now (active ones). The shared-only schedule (a member without Pro, or
 * Pro paused) asks this, not `pendingChangeCount`: the user's own changes may
 * be kept for when their Pro is back, and must not make it sync every few
 * seconds meanwhile.
 */
export function pendingSharedChangeCount(
  ledgerIds: readonly string[] = listSharedLedgers()
    .filter((ledger) => ledger.active)
    .map((ledger) => ledger.ledgerId),
): number {
  if (!ledgerIds.length) return 0;
  const db = getSQLite();
  let count = 0;
  for (const table of SYNC_TABLES) {
    if (!isLedgerScoped(table) || !tableExists(table)) continue;
    count +=
      db.getFirstSync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = ?
           AND row_id IN (SELECT id FROM "${table}" WHERE ${inLedgersSql(table, ledgerIds)})`,
        [table],
      )?.n ?? 0;
  }
  return count;
}

/**
 * Drops queued changes of the user's own data, keeping shared ledgers'. Run
 * inside a transaction: when the user's own data has no cloud copy to go to
 * (a member without Cloud Sync, whose linking uploads everything anyway), and
 * when a full upload or download replaces the user's own copy.
 */
export function dropPersonalOutbox(): void {
  const db = getSQLite();
  if (!listSharedLedgers().length) {
    db.runSync('DELETE FROM sync_outbox');
    return;
  }
  const entries = db.getAllSync<{ table_name: string; row_id: string }>(
    'SELECT table_name, row_id FROM sync_outbox',
  );
  for (const entry of entries) {
    const local = isSyncTable(entry.table_name)
      ? db.getFirstSync<Row>(`SELECT * FROM "${entry.table_name}" WHERE id = ?`, [entry.row_id])
      : null;
    const channel = local
      ? channelOfRow(entry.table_name, local)
      : (recordedChannel(entry.table_name, entry.row_id) ?? PERSONAL_CHANNEL);
    if (channel === PERSONAL_CHANNEL) {
      db.runSync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', [
        entry.table_name,
        entry.row_id,
      ]);
    }
  }
}

/**
 * Whether a channel has changes flushed into its replica that no push has
 * carried yet (a sync failed after its flush). They are out of the outbox.
 */
export function hasUnpushedChanges(channel: string): boolean {
  return getState(unpushedKey(channel)) === '1';
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

const SUMMARY_TABLES = Object.keys(MEANINGFUL_ROWS) as SyncTable[];

/** Counts and whether there is anything to keep, from a side's live rows. */
function summaryOf(side: LiveRows): DataSummary {
  return {
    transactions: side.count('transactions'),
    accounts: side.count('accounts'),
    hasMeaningfulData: hasMeaningfulRows(side),
  };
}

/** This phone's own data, without the shared ledgers (they sync on their own). */
export function summarizeLocal(): DataSummary {
  const db = getSQLite();
  const live = (table: SyncTable) => `deleted_at IS NULL AND ${personalRowsSql(table)}`;
  return summaryOf({
    count: (table) =>
      tableExists(table)
        ? (db.getFirstSync<{ n: number }>(
            `SELECT COUNT(*) AS n FROM "${table}" WHERE ${live(table)}`,
          )?.n ?? 0)
        : 0,
    rows: (table) =>
      tableExists(table) ? db.getAllSync<Row>(`SELECT * FROM "${table}" WHERE ${live(table)}`) : [],
  });
}

// ---------------------------------------------------------------------------
// The engine

interface StoredRow {
  data: string;
  rev: string;
}

/**
 * Routes worked out for outbox entries during one flush pass over the
 * channels (see `entriesForChannel`), so each entry's row is read once rather
 * than once per channel. Cleared at the start of every sync of the user's own
 * channel and whenever the shared ledgers change: seq numbers restart once
 * the outbox empties, so an entry key alone does not stay unique.
 */
const routeMemo = new Map<string, string>();
let routeMemoList: unknown = null;

function routeMemoFresh(): Map<string, string> {
  const list = listSharedLedgers();
  if (routeMemoList !== list) {
    routeMemo.clear();
    routeMemoList = list;
  }
  return routeMemo;
}

/**
 * Serializes every operation on every replica (syncs, pulls, full
 * replacements): engines share the outbox and the app tables.
 */
let replicaQueue: Promise<unknown> = Promise.resolve();

/** Runs `fn` when no replica operation is in flight, holding the others back. */
export function runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = async () => fn();
  const result = replicaQueue.then(run, run);
  replicaQueue = result.catch(() => undefined);
  return result;
}

export class SyncEngine {
  private replica: Replica | null = null;
  private running: Promise<SyncOutcome> | null = null;
  /** The last apply left ledger-row removals for later (see applyRemoteChanges). */
  private removalsDeferred = false;
  /** The first pulled row this sync could not write. */
  private applyFailure: Error | null = null;

  constructor(private readonly config: EngineConfig) {}

  get userId(): string {
    return this.config.userId;
  }

  get channel(): string {
    return this.config.channel;
  }

  private get isPersonal(): boolean {
    return this.config.channel === PERSONAL_CHANNEL;
  }

  /** Opens the replica, downloading the cloud copy on first use. Needs the network then. */
  async open(): Promise<void> {
    if (this.replica) return;
    const mod = loadTurso();
    if (!mod) throw new Error('turso_unavailable');
    const replica = new mod.Database({
      path: mod.getDbPath(replicaFileName(this.config.userId, this.config.channel)),
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
    return runExclusive(fn);
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

  /**
   * Takes the cloud's changes into the app without sending anything: a paused
   * shared ledger's last download, with a read-only token, before it stops.
   * Returns the first pulled row that could not be written, if any.
   */
  pullAndApply(): Promise<Error | null> {
    return this.exclusive(async () => {
      this.applyFailure = null;
      await this.db().pull();
      await this.applyRemoteChanges();
      return this.applyFailure;
    });
  }

  /** Resolves once every operation started so far has finished (sign-out waits for it). */
  async waitIdle(): Promise<void> {
    await replicaQueue;
  }

  private db(): Replica {
    if (!this.replica) throw new Error('replica_closed');
    return this.replica;
  }

  async summarizeCloud(): Promise<DataSummary> {
    const replica = this.db();
    const live = new Map<string, Row[]>();
    const rows = await replica.all(
      `SELECT table_name, data FROM sync_rows WHERE table_name IN (${SUMMARY_TABLES.map(() => '?').join(', ')})`,
      [...SUMMARY_TABLES],
    );
    for (const row of rows) {
      let data: Row;
      try {
        data = JSON.parse(String(row.data)) as Row;
      } catch {
        continue;
      }
      if (data.deleted_at != null) continue;
      const table = String(row.table_name);
      const list = live.get(table) ?? [];
      list.push(data);
      live.set(table, list);
    }
    const info = await replica.all('SELECT key, value FROM sync_info');
    const infoMap = new Map(
      info.map((r) => [String(r.key), r.value == null ? null : String(r.value)]),
    );
    return {
      ...summaryOf({
        count: (table) => live.get(table)?.length ?? 0,
        rows: (table) => live.get(table) ?? [],
      }),
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
        // Shared ledgers' rows are queued too: their channels find them
        // unchanged and leave them be (a paused ledger's wait until it resumes).
        db.execSync(`DELETE FROM sync_row_meta WHERE channel = '${PERSONAL_CHANNEL}'`);
        dropPersonalOutbox();
        for (const table of SYNC_TABLES) {
          if (tableExists(table)) db.execSync(enqueueAllSql(table));
        }
        queueMedia(collectReferencedAssetPaths(), PERSONAL_CHANNEL);
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
      const shared = sharedLedgerIds();
      applyQuietly(() => {
        // Shared ledgers' changes waiting to go up stay queued.
        dropPersonalOutbox();
        db.execSync(
          `DELETE FROM sync_row_meta WHERE channel = '${PERSONAL_CHANNEL}';
           DELETE FROM sync_media_pending WHERE channel = '${PERSONAL_CHANNEL}';`,
        );
        // Shared ledgers stay as they are: they sync with their own databases.
        // Children go first, while their parents still say which ledger they are in.
        for (const table of [...SYNC_TABLES].reverse()) {
          // The settings row is updated in place so this phone keeps its own
          // device-local settings (and its purchase identity).
          if (!tableExists(table) || table === 'settings') continue;
          db.execSync(
            isLedgerScoped(table)
              ? `DELETE FROM "${table}" WHERE NOT (${inLedgersSql(table, shared)})`
              : `DELETE FROM "${table}"`,
          );
        }
        for (const table of SYNC_TABLES) {
          if (!tableExists(table)) continue;
          const cols = localColumns(table);
          for (const stored of perTable.get(table) ?? []) {
            const row = decodeRow(table, stored.data, cols);
            if (!row || channelOfRow(table, row) !== PERSONAL_CHANNEL) continue;
            const written = writeRowSafely(table, row);
            if (written instanceof Error) {
              // Unrecorded, so the next sync's apply tries it again.
              setState('apply_pending', '1');
              continue;
            }
            if (written) collectAssetRefs(table, row, assets);
            recordRev(table, stored.row_id, stored.rev, PERSONAL_CHANNEL);
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
    let appliedRows = 0;
    this.applyFailure = null;
    // A ledger just shared, joined, or signed into again: take what the cloud
    // has (keeping this phone's newer edits), then send what only this phone
    // has. It counts as attached once that is pushed.
    const attaching = !this.isPersonal && getState(attachedKey(this.channel)) !== '1';
    if (this.isPersonal) {
      // The personal sync starts each round of syncs: routes start afresh.
      routeMemo.clear();
      catchUpSyncedShape();
      await this.detachSharedLedgers();
    } else if (attaching) {
      await replica.pull();
      appliedRows += await this.applyRemoteChanges({ attaching: true });
      enqueueLedgerRows(this.config.ledgerId ?? '', this.channel);
    }
    // The cloud's latest before the flush, so it sees a row deleted elsewhere
    // that this phone changed meanwhile (`deletedElsewhere`).
    const pulledFirst = !attaching && (await replica.pull());
    const { pushed: pushedRows, adopted } = await this.flushOutbox();
    appliedRows += adopted;
    // Kept until a push succeeds, across restarts: a failed push leaves the
    // rows in the replica, out of the outbox, and the retry that sends them
    // flushes nothing new.
    if (pushedRows > 0) {
      setState(unpushedKey(this.channel), '1');
      await this.recordLastDevice();
    }
    // Images first: a row must never reach another phone before its image can.
    await this.uploadPendingMedia();
    await replica.push();
    const pushed = hasUnpushedChanges(this.channel) || attaching;
    setState(unpushedKey(this.channel), '0');
    if (attaching) setState(attachedKey(this.channel), '1');
    const pulled = (await replica.pull()) || pulledFirst;
    // Also re-applies after an apply that failed, which a later pull with no
    // new changes would otherwise never retry.
    const pendingKey = this.isPersonal ? 'apply_pending' : `apply_pending:${this.channel}`;
    if (pulled || this.applyFailure || getState(pendingKey) !== '0') {
      setState(pendingKey, '1');
      this.removalsDeferred = false;
      appliedRows += await this.applyRemoteChanges();
      // Deferred removals and rows that failed keep the apply pending, so
      // the next sync retries.
      if (!this.removalsDeferred && !this.applyFailure) setState(pendingKey, '0');
    }
    await this.downloadMedia(new Set());
    return { appliedRows, pushed, applyError: this.applyFailure };
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

  /**
   * The outbox entries this channel sends, with their rows as they are now.
   * An entry for a row that is gone goes where the row was last synced.
   */
  private entriesForChannel(
    batch: { table_name: string; row_id: string; seq: number }[],
  ): { table_name: string; row_id: string; seq: number; local: Row | null }[] {
    const db = getSQLite();
    const mine: { table_name: string; row_id: string; seq: number; local: Row | null }[] = [];
    for (const entry of batch) {
      if (!isSyncTable(entry.table_name)) {
        if (this.isPersonal) mine.push({ ...entry, local: null });
        continue;
      }
      // Each channel walks the whole outbox: an entry another channel
      // already routed (same change, same list of shared ledgers) is skipped
      // without reading its row.
      const key = `${entry.table_name}:${entry.row_id}:${entry.seq}`;
      const memo = routeMemoFresh();
      const known = memo.get(key);
      if (known !== undefined && known !== this.channel) continue;
      const local = db.getFirstSync<Row>(`SELECT * FROM "${entry.table_name}" WHERE id = ?`, [
        entry.row_id,
      ]);
      const channel = local
        ? channelOfRow(entry.table_name, local)
        : (recordedChannel(entry.table_name, entry.row_id) ?? PERSONAL_CHANNEL);
      memo.set(key, channel);
      if (channel === NO_CHANNEL) {
        // Goes nowhere (a ledger about to be deleted here): drop it.
        db.runSync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND seq = ?', [
          entry.table_name,
          entry.row_id,
          entry.seq,
        ]);
      } else if (channel === this.channel) mine.push({ ...entry, local });
    }
    return mine;
  }

  /**
   * Copies this channel's outbox rows into the replica. Returns how many rows
   * changed there, and how many local rows took a delete from the cloud.
   */
  private async flushOutbox(): Promise<{ pushed: number; adopted: number }> {
    const db = getSQLite();
    const replica = this.db();
    const origin = deviceId();
    let changedRows = 0;
    let adoptedRows = 0;
    // Other channels' entries stay behind, so walk the outbox in order. A
    // bulk queue gives many rows one seq, so the key is (seq, table, id).
    let after: [number, string, string] = [-1, '', ''];
    for (;;) {
      const page = db.getAllSync<{ table_name: string; row_id: string; seq: number }>(
        `SELECT table_name, row_id, seq FROM sync_outbox WHERE (seq, table_name, row_id) > (?, ?, ?)
         ORDER BY seq, table_name, row_id LIMIT ?`,
        [...after, FLUSH_BATCH],
      );
      if (!page.length) break;
      const last = page[page.length - 1];
      after = [last.seq, last.table_name, last.row_id];
      const batch = this.entriesForChannel(page);
      if (!batch.length) continue;
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
      // Local rows that take the cloud's delete instead (`deletedElsewhere`).
      const adopted: { table: string; id: string; data: string }[] = [];
      const assets = new Set<string>();
      await replica.transaction(async () => {
        for (const entry of batch) {
          const table = entry.table_name;
          const id = entry.row_id;
          if (!isSyncTable(table)) {
            results.push({ table, id, seq: entry.seq, rev: null });
            continue;
          }
          const local = entry.local;
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
          const seen = db.getFirstSync<{ rev: string }>(
            'SELECT rev FROM sync_row_meta WHERE table_name = ? AND row_id = ? AND channel = ?',
            [table, id, this.channel],
          )?.rev;
          if (before && deletedElsewhere(seen ?? null, before, local)) {
            adopted.push({ table, id, data: before.data });
            results.push({ table, id, seq: entry.seq, rev: before.rev });
            continue;
          }
          const data = encodeRow(table, local, before?.data ?? null, !this.isPersonal);
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
        queueMedia(assets, this.channel);
        for (const r of results) {
          // Only clear the entry if the row did not change again meanwhile.
          db.runSync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND seq = ?', [
            r.table,
            r.id,
            r.seq,
          ]);
          recordRev(r.table, r.id, r.rev, this.channel);
        }
        if (!adopted.length) return;
        setState('applying', '1');
        try {
          for (const { table, id, data } of adopted) {
            const row = decodeRow(table, data, localColumns(table), !this.isPersonal);
            if (row && writeRowSafely(table, row) === true) adoptedRows += 1;
            // Not written: forget the revision, so the next pull applies it.
            else recordRev(table, id, null, this.channel);
          }
        } finally {
          setState('applying', '0');
        }
      });
    }
    return { pushed: changedRows, adopted: adoptedRows };
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
        'SELECT table_name, row_id, rev FROM sync_row_meta WHERE channel = ?',
        [this.channel],
      )
      .map((r) => ({ table: r.table_name, id: r.row_id, rev: r.rev }));
    const pending = outboxKeys();
    // A shared ledger's database only ever carries that ledger's rows.
    const keep = (e: { table: string; id: string }) =>
      isSyncTable(e.table) &&
      (this.isPersonal || isLedgerScoped(e.table)) &&
      !pending.has(rowKey(e.table, e.id));
    const diff = diffRevs(remote, local);
    return { changed: diff.changed.filter(keep), removed: diff.removed.filter(keep) };
  }

  /** Writes rows other phones changed into the app tables. Returns rows written or removed. */
  private async applyRemoteChanges(opts: { attaching?: boolean } = {}): Promise<number> {
    const { changed, removed } = await this.remoteChanges();
    if (!changed.length && !removed.length) return 0;
    // Ledger rows leaving the user's own copy may have moved to a ledger
    // shared from another phone: learn of it first, so they are kept.
    let deferLedgerRemovals = false;
    if (
      this.isPersonal &&
      this.config.beforeLedgerRemovals &&
      removed.some((item) => isLedgerScoped(item.table))
    ) {
      // Without the list (offline Worker), those removals wait for a later
      // sync; everything else applies now.
      deferLedgerRemovals = !(await this.config.beforeLedgerRemovals().then(
        () => true,
        () => false,
      ));
      this.removalsDeferred = deferLedgerRemovals;
    }

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
    // Parents before children, so a child row can tell which ledger it is in.
    const order = (table: string) => SYNC_TABLES.indexOf(table as SyncTable);
    fetched.sort((a, b) => order(a.table) - order(b.table));

    const db = getSQLite();
    const assets = new Set<string>();
    let applied = 0;
    let failure: Error | null = null;
    applyQuietly(() => {
      // Re-read: the user may have edited a row while the data was fetched,
      // and their edit wins.
      const pendingNow = outboxKeys();
      // Deletions first, so a replacement row with a new id does not clash
      // with the one it replaces.
      for (const item of removed) {
        if (pendingNow.has(rowKey(item.table, item.id))) continue;
        if (deferLedgerRemovals && isLedgerScoped(item.table)) continue;
        // A row that moved to another channel (its ledger was shared) stays.
        if (tableExists(item.table) && this.ownsLocalRow(item.table, item.id)) {
          applied += db.runSync(`DELETE FROM "${item.table}" WHERE id = ?`, [item.id]).changes;
        }
        recordRev(item.table, item.id, null, this.channel);
      }
      for (const item of fetched) {
        if (!tableExists(item.table) || pendingNow.has(rowKey(item.table, item.id))) continue;
        const row = decodeRow(item.table, item.data, localColumns(item.table), !this.isPersonal);
        if (!row || !this.accepts(item.table, row)) continue;
        if (opts.attaching && this.localIsNewer(item.table, row)) {
          // Edited here while signed out: this phone's copy goes up instead.
          db.runSync(ENQUEUE_ROW_SQL, [item.table, item.id]);
          recordRev(item.table, item.id, item.rev, this.channel);
          continue;
        }
        const written = writeRowSafely(item.table, row);
        if (written instanceof Error) {
          // Left unrecorded, so every later sync tries it again.
          failure ??= written;
          continue;
        }
        if (written) {
          applied += 1;
          collectAssetRefs(item.table, row, assets);
        }
        recordRev(item.table, item.id, item.rev, this.channel);
      }
    });
    this.applyFailure ??= failure;
    await this.downloadMedia(assets);
    return applied;
  }

  /** Whether this phone's copy of a row was edited after the pulled one. */
  private localIsNewer(table: string, row: Row): boolean {
    if (typeof row.updated_at !== 'string' || !localColumns(table).has('updated_at')) return false;
    const local = getSQLite().getFirstSync<{ updated_at: string | null }>(
      `SELECT updated_at FROM "${table}" WHERE id = ?`,
      [String(row.id ?? '')],
    );
    return typeof local?.updated_at === 'string' && local.updated_at > row.updated_at;
  }

  /** Whether this phone's copy of a row (if any) belongs to this channel. */
  private ownsLocalRow(table: string, id: string): boolean {
    // Nothing shared: every row is the user's own.
    if (!listSharedLedgers().length) return this.isPersonal;
    const local = getSQLite().getFirstSync<Row>(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
    return !local || channelOfRow(table, local) === this.channel;
  }

  /**
   * Whether a pulled row may be written. It must belong to this channel, and
   * so must the row it would replace: the user's own copy skips rows of
   * ledgers now shared, and a shared ledger's database (which its members
   * write to) can never reach the user's settings or another ledger.
   */
  private accepts(table: string, row: Row): boolean {
    if (channelOfRow(table, row) !== this.channel) return false;
    return this.ownsLocalRow(table, String(row.id ?? ''));
  }

  /**
   * Once a ledger is shared, its rows leave the user's own cloud copy (they
   * live in the ledger's database now), so other phones stop reading them
   * from there. Personal channel only; done once per shared ledger.
   */
  private async detachSharedLedgers(): Promise<void> {
    for (const ledger of listSharedLedgers()) {
      if (getState(detachedKey(ledger.shareId)) === '1') continue;
      // Only once the ledger's own database has its rows (this phone's
      // channel pushed them): until then the user's copy is the only one.
      if (getState(attachedKey(ledger.shareId)) !== '1') continue;
      await this.detachLedger(ledger.ledgerId);
      setState(detachedKey(ledger.shareId), '1');
    }
  }

  /**
   * Deletes a ledger's rows from the user's own cloud copy. Found by this
   * phone's rows of the ledger (their revisions are on the ledger's channel
   * by now, so they cannot be found through sync_row_meta).
   */
  private async detachLedger(ledgerId: string): Promise<void> {
    const replica = this.db();
    const db = getSQLite();
    await replica.transaction(async () => {
      for (const table of SYNC_TABLES) {
        if (!isLedgerScoped(table) || !tableExists(table)) continue;
        const ids = db
          .getAllSync<{
            id: string;
          }>(`SELECT id FROM "${table}" WHERE ${inLedgersSql(table, [ledgerId])}`)
          .map((row) => row.id);
        for (let i = 0; i < ids.length; i += FETCH_BATCH) {
          const slice = ids.slice(i, i + FETCH_BATCH);
          await replica.run(
            `DELETE FROM sync_rows WHERE table_name = ? AND row_id IN (${slice.map(() => '?').join(',')})`,
            [table, ...slice],
          );
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Images

  /** Uploads every queued image the cloud does not have yet. */
  private async uploadPendingMedia(): Promise<void> {
    const db = getSQLite();
    const channel = this.channel;
    const queued = db
      .getAllSync<{
        path: string;
      }>('SELECT path FROM sync_media_pending WHERE channel = ?', [channel])
      .map((r) => r.path);
    if (!queued.length) return;
    const done = (path: string) =>
      db.runSync('DELETE FROM sync_media_pending WHERE path = ? AND channel = ?', [path, channel]);
    // An image no longer on disk cannot go up; nothing references it either.
    const onDisk: string[] = [];
    for (const path of queued) {
      if (assetFile(path).exists) onDisk.push(path);
      else done(path);
    }
    if (!onDisk.length) return;
    const token = await this.config.getSessionToken();
    const { mediaPath } = this.config;
    for (let i = 0; i < onDisk.length; i += MEDIA_BATCH) {
      const slice = onDisk.slice(i, i + MEDIA_BATCH);
      const existing = await existingMedia(token, mediaPath, slice);
      for (const path of slice) {
        if (!existing.has(path)) await uploadMedia(token, mediaPath, path, assetFile(path));
        done(path);
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
    const channel = this.channel;
    for (const path of paths) {
      if (!assetFile(path).exists) {
        db.runSync('INSERT OR IGNORE INTO sync_media_missing (path, channel) VALUES (?, ?)', [
          path,
          channel,
        ]);
      }
    }
    const missing = db
      .getAllSync<{
        path: string;
      }>('SELECT path FROM sync_media_missing WHERE channel = ? AND attempts < ?', [
        channel,
        MAX_DOWNLOAD_ATTEMPTS,
      ])
      .map((r) => r.path);
    if (!missing.length) return;
    let token: string;
    try {
      token = await this.config.getSessionToken();
    } catch {
      return;
    }
    let downloaded = 0;
    const next = async (): Promise<void> => {
      const path = missing.shift();
      if (!path) return;
      const file = assetFile(path);
      // Downloaded beside the image and moved into place once complete: an
      // interrupted download must not leave a partial file that looks done.
      const partial = assetFile(`${path}.part`);
      try {
        if (!file.exists) {
          const parent = file.parentDirectory;
          if (!parent.exists) parent.create({ intermediates: true });
          if (partial.exists) partial.delete();
          await downloadMedia(token, this.config.mediaPath, path, partial);
          partial.moveSync(file);
          downloaded += 1;
        }
        db.runSync('DELETE FROM sync_media_missing WHERE path = ? AND channel = ?', [
          path,
          channel,
        ]);
      } catch {
        if (partial.exists) partial.delete();
        db.runSync(
          'UPDATE sync_media_missing SET attempts = attempts + 1 WHERE path = ? AND channel = ?',
          [path, channel],
        );
      }
      await next();
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, next));
    // Icons drawn before their file arrived were remembered as missing.
    if (downloaded > 0) invalidateCustomUriCache();
  }
}

function assetFile(relativePath: string): File {
  return new File(Paths.document, 'user-assets', relativePath);
}

/**
 * Deletes the local replica files of a channel: the user's own (sign-out,
 * account deletion) or a shared ledger's (no longer shared or joined).
 */
export function deleteReplicaFiles(userId: string, channel: string = PERSONAL_CHANNEL): void {
  const mod = loadTurso();
  if (!mod) return;
  try {
    const path = mod.getDbPath(replicaFileName(userId, channel));
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

// A shared album's group in its own database, as the Worker reads and writes
// it. See README.md > Album members and shared albums > How it works.
//
// Phones write their album's database themselves, through Cloud Sync: they
// plan each change by the app's rules (apps/mobile/features/albums/lib/
// groupPlan.ts) and apply it to their own copy, which then goes up. The
// Worker writes by the same rules, from a copy of that file, only for what
// happens here: someone joining or leaving, and changes made on the website.
//
// Rows are stored as the app stores them (`sync_rows`: table, id, JSON, a
// revision), so phones apply what the Worker wrote like any other synced row.
// The Worker writes a row only if it still has the revision it was read at,
// and plans again otherwise, so it never overwrites a change (a phone's push,
// another join) that landed while it planned. A website change also names
// the revisions it was planned from on the page (`WriteBase`), and is refused
// as `stale` when they moved since, since the page's read may be minutes old.

import {
  type GroupState,
  GROUP_TABLES,
  type GroupTable,
  GroupWriteError,
  isText,
  MAX_MEMBER_ROWS,
  membersOf,
  type Plan,
  type PlanContext,
  planJoin,
  rowKey,
  type Row,
  selfOf,
  type StoredRow,
  type WriteRequest,
} from './groupPlan.generated';
import { json } from './http';

export { GroupWriteError, planLeave, planWrite, type WriteRequest } from './groupPlan.generated';

// ---------------------------------------------------------------------------
// The group's database

interface Statement {
  sql: string;
  args: (string | number | null)[];
}

/** What the Worker needs of an album's database. */
export interface GroupDb {
  /** Runs the statements in order, in one round trip, and returns each one's rows. */
  queryAll(statements: Statement[]): Promise<Row[][]>;
  /** Runs the statements as one transaction; false when one failed (another write won). */
  transaction(statements: Statement[]): Promise<boolean>;
}

/** What the Worker read, with each row's revision (`rowKey` to `rev`) for its guard. */
interface LoadedState extends GroupState {
  revs: Map<string, string>;
  /** Every member row and its revision, as read: a join elsewhere changes it. */
  membersStamp: string;
  /** Every bill and payment and its revision, as read, when the write records payments. */
  moneyStamp?: string;
}

/** The member rows and their revisions, in one value, so a write can tell they changed. */
const MEMBERS_STAMP_SQL = `COALESCE((SELECT group_concat(row_id || ':' || rev, ',') FROM
  (SELECT row_id, rev FROM sync_rows WHERE table_name = 'album_members' ORDER BY row_id)), '')`;

/**
 * Every bill and payment and its revision, in one value: what is owed is
 * worked out from all of them, so a payment the website planned is written
 * only while none of them changed (`moneyRev`).
 */
const MONEY_STAMP_SQL = `COALESCE((SELECT group_concat(table_name || ':' || row_id || ':' || rev, ',') FROM
  (SELECT table_name, row_id, rev FROM sync_rows
   WHERE table_name IN ('album_expenses', 'album_settlements') ORDER BY table_name, row_id)), '')`;

/**
 * The money stamp as the website is given it and sends it back (`moneyRev`,
 * `moneyBase`): a hash, since the stamp itself grows with the album.
 */
export async function moneyRevOf(stamp: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stamp));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const MEMBER_ROWS_SQL = `SELECT table_name, row_id, data, rev FROM sync_rows
  WHERE table_name = 'album_members' LIMIT ${MAX_MEMBER_ROWS}`;

/** A stored row read with its revision; null when it is not JSON. */
function parseStored(raw: Row, revs: Map<string, string>): StoredRow | null {
  try {
    const data = JSON.parse(String(raw.data)) as Row;
    if (!data || typeof data !== 'object') return null;
    const row = { table: String(raw.table_name), id: String(raw.row_id), data };
    revs.set(rowKey(row.table, row.id), String(raw.rev));
    return row;
  } catch {
    return null;
  }
}

/**
 * Reads the group's members and the rows a write names (with the bills its
 * payments are for), in one round trip; with `money`, the money stamp too.
 * The stamps are read before the rows, so a change landing in between makes
 * the write's guard fail (and plan again) rather than pass on rows older than
 * the stamp.
 */
async function loadState(
  db: GroupDb,
  request: WriteRequest | null,
  money = false,
): Promise<LoadedState> {
  const keys: { table: string; id: string }[] = [];
  for (const item of request?.rows ?? []) {
    const id = item?.row?.id;
    if (!isText(item?.table) || !isText(id)) continue;
    keys.push({ table: item.table, id });
    if (item.table === 'album_settlements' && isText(item.row.expense_id)) {
      keys.push({ table: 'album_expenses', id: item.row.expense_id });
    }
  }
  const statements: Statement[] = [
    {
      sql: `SELECT ${MEMBERS_STAMP_SQL} AS stamp${money ? `, ${MONEY_STAMP_SQL} AS money` : ''}`,
      args: [],
    },
    { sql: MEMBER_ROWS_SQL, args: [] },
  ];
  for (let start = 0; start < keys.length; start += 100) {
    const part = keys.slice(start, start + 100);
    statements.push({
      sql: `SELECT table_name, row_id, data, rev FROM sync_rows WHERE ${part
        .map(() => '(table_name = ? AND row_id = ?)')
        .join(' OR ')}`,
      args: part.flatMap((key) => [key.table, key.id]),
    });
  }
  const [stamps, memberRows, ...found] = await db.queryAll(statements);
  const revs = new Map<string, string>();
  const members = memberRows
    .map((raw) => parseStored(raw, revs))
    .filter((row): row is StoredRow => row !== null);
  const rows = new Map<string, StoredRow>();
  for (const row of members) rows.set(rowKey(row.table, row.id), row);
  for (const raw of found.flat()) {
    const row = parseStored(raw, revs);
    if (row) rows.set(rowKey(row.table, row.id), row);
  }
  return {
    members,
    rows,
    revs,
    membersStamp: String(stamps[0]?.stamp ?? ''),
    ...(money ? { moneyStamp: String(stamps[0]?.money ?? '') } : null),
  };
}

/** The newest log entries the website is sent; older ones stay in the database. */
const MAX_READ_ACTIVITY = 1000;
/** Bills and payments the website is sent at most: far past any trip. */
const MAX_READ_ROWS = 20000;

/** One stored row of a group, as the website reads it, with its revision. */
interface GroupRow {
  table: GroupTable;
  id: string;
  data: Row;
  /** What a website write names as its `base`, so it never overwrites a newer change. */
  rev: string;
}

/**
 * The whole group for the website (GET /v1/ledgers/<id>/album): its members,
 * bills (deleted ones too, whose payments still count), payments, settings,
 * categories, and the newest log entries, each with its revision, and the money stamp
 * (`moneyRev`) a payment planned from them is sent back with. One round trip,
 * the stamp read first (a change landing meanwhile makes a payment stale,
 * never let through). The website checks every row again, as a phone does
 * (`toAlbumMember` and the rest): a member can write anything the rules
 * allow, so nothing here is trusted for more than its shape.
 */
export async function readGroup(db: GroupDb): Promise<{ rows: GroupRow[]; moneyRev: string }> {
  const groupRowsSql = `SELECT table_name, row_id, data, rev FROM sync_rows
            WHERE table_name IN ('album_members', 'album_expenses', 'album_settlements', 'album_groups',
              'album_categories')
            ORDER BY CASE table_name WHEN 'album_members' THEN 0 WHEN 'album_groups' THEN 1
              WHEN 'album_categories' THEN 1 WHEN 'album_expenses' THEN 2 ELSE 3 END, updated_at
            LIMIT ${MAX_READ_ROWS}`;
  const activitySql = `SELECT table_name, row_id, data, rev FROM sync_rows WHERE table_name = 'album_activity'
            ORDER BY updated_at DESC, row_id DESC LIMIT ${MAX_READ_ACTIVITY}`;
  let [rows, activity] = await db.queryAll([
    // People and settings first, then bills before payments: past the cap
    // (far beyond any trip) the newest payments go, never a member.
    { sql: groupRowsSql, args: [] },
    { sql: activitySql, args: [] },
  ]);
  // Compute the money stamp from the rows already read instead of scanning
  // sync_rows a second time (identical to MONEY_STAMP_SQL unless capped).
  let stamp: string;
  if (rows.length < MAX_READ_ROWS) {
    const moneyRows = rows
      .filter(
        (raw) => raw.table_name === 'album_expenses' || raw.table_name === 'album_settlements',
      )
      .map((raw) => ({
        table: String(raw.table_name),
        id: String(raw.row_id),
        rev: String(raw.rev),
      }))
      .sort((a, b) =>
        a.table !== b.table
          ? a.table < b.table
            ? -1
            : 1
          : a.id !== b.id
            ? a.id < b.id
              ? -1
              : 1
            : 0,
      );
    stamp = moneyRows.map((row) => `${row.table}:${row.id}:${row.rev}`).join(',');
  } else {
    // Past the cap: re-read the whole group with MONEY_STAMP_SQL first in one
    // round trip so a change landing meanwhile fails safe as stale.
    const [stampRow, freshRows, freshActivity] = await db.queryAll([
      { sql: `SELECT ${MONEY_STAMP_SQL} AS money`, args: [] },
      { sql: groupRowsSql, args: [] },
      { sql: activitySql, args: [] },
    ]);
    rows = freshRows;
    activity = freshActivity;
    stamp = String(stampRow[0]?.money ?? '');
  }
  const out: GroupRow[] = [];
  for (const raw of [...rows, ...activity]) {
    const table = String(raw.table_name) as GroupTable;
    if (!(GROUP_TABLES as readonly string[]).includes(table)) continue;
    try {
      const data = JSON.parse(String(raw.data)) as unknown;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        out.push({ table, id: String(raw.row_id), data: data as Row, rev: String(raw.rev) });
      }
    } catch {
      // A row that is not JSON is passed over, as a phone passes it over.
    }
  }
  return { rows: out, moneyRev: await moneyRevOf(stamp) };
}

/** The name the account goes by in the group, while it is in it; null when it is not. */
export async function readOwnerName(db: GroupDb, userId: string): Promise<string | null> {
  const [rows] = await db.queryAll([{ sql: MEMBER_ROWS_SQL, args: [] }]);
  const members = rows
    .map((raw) => parseStored(raw, new Map()))
    .filter((row): row is StoredRow => row !== null);
  return selfOf(membersOf({ members, rows: new Map() }), userId)?.name ?? null;
}

/** A revision of the Worker's, in the app's shape (`<time>.<counter>.<origin>`). */
function workerRev(index: number, nowMs: number, salt: string): string {
  return `${nowMs.toString(36)}.${index.toString(36)}.w${salt}`;
}

/**
 * Writes a plan as one transaction. Each row is written only if it still has
 * the revision it was read at (`revs`; a row not read must not exist), and
 * only while the members are as they were read (a join planned at the same
 * time would otherwise take the same name), and, for a website payment,
 * while every bill and payment is (`moneyStamp`), so a change that landed
 * meanwhile is never overwritten or planned past. Null when one had.
 */
async function commitPlan(
  db: GroupDb,
  plan: Plan,
  read: Pick<LoadedState, 'revs' | 'membersStamp' | 'moneyStamp'>,
  nowMs = Date.now(),
): Promise<{ table: string; id: string; data: string; rev: string }[] | null> {
  if (!plan.writes.length) return [];
  const salt = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const written = plan.writes.map((write, index) => ({
    table: write.table,
    id: write.id,
    data: JSON.stringify(write.data),
    rev: workerRev(index, nowMs, salt),
    expect: read.revs.get(rowKey(write.table, write.id)) ?? null,
  }));
  // Each check fails (integer overflow) unless what it reads is as it was read.
  const statements: Statement[] = [
    {
      sql: `SELECT CASE WHEN ${MEMBERS_STAMP_SQL} IS ? THEN 1 ELSE abs(-9223372036854775807 - 1) END`,
      args: [read.membersStamp],
    },
  ];
  if (read.moneyStamp !== undefined) {
    statements.push({
      sql: `SELECT CASE WHEN ${MONEY_STAMP_SQL} IS ? THEN 1 ELSE abs(-9223372036854775807 - 1) END`,
      args: [read.moneyStamp],
    });
  }
  for (const { table, id, data, rev, expect } of written) {
    statements.push({
      sql: `SELECT CASE WHEN (SELECT rev FROM sync_rows WHERE table_name = ? AND row_id = ?) IS ?
             THEN 1 ELSE abs(-9223372036854775807 - 1) END`,
      args: [table, id, expect],
    });
    statements.push(
      expect === null
        ? {
            sql: `INSERT INTO sync_rows (table_name, row_id, data, rev, origin, updated_at)
                  VALUES (?, ?, ?, ?, 'worker', ?)`,
            args: [table, id, data, rev, nowMs],
          }
        : {
            sql: `UPDATE sync_rows SET data = ?, rev = ?, origin = 'worker', updated_at = ?
                  WHERE table_name = ? AND row_id = ?`,
            args: [data, rev, nowMs, table, id],
          },
    );
  }
  if (!(await db.transaction(statements))) return null;
  return written.map(({ table, id, data, rev }) => ({ table, id, data, rev }));
}

/**
 * What a website write was planned from (`via: 'web'`): the revision each row
 * it changes had on the page (`base`, null for a row the page did not have),
 * and for payments the money stamp (`moneyBase`, the read's `moneyRev`). The
 * page plans from its last read, which may be minutes old, so a row changed
 * since (a phone's edit or delete) or any bill or payment changed since (a
 * payment recorded on a phone) makes the write `stale`: refused, not planned
 * again, for the page to read the album again and the user to look.
 */
export interface WriteBase {
  rows: { table: string; id: string; base: string | null }[];
  moneyBase?: string;
}

/**
 * Reads what a change needs, plans it and writes it, planning again on what
 * landed if another write came first (unless `base` says the change was
 * planned from what is no longer there). Returns the rows written.
 */
export async function writeGroup(
  db: GroupDb,
  request: WriteRequest | null,
  plan: (state: GroupState) => Plan,
  base?: WriteBase,
): Promise<{ table: string; id: string; data: string; rev: string }[]> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadState(db, request, base?.moneyBase !== undefined);
    if (base) await assertBase(state, base);
    const written = await commitPlan(db, plan(state), state);
    if (written) return written;
  }
  throw new GroupWriteError('busy', 409);
}

async function assertBase(state: LoadedState, base: WriteBase): Promise<void> {
  for (const row of base.rows) {
    if ((state.revs.get(rowKey(row.table, row.id)) ?? null) !== row.base) {
      throw new GroupWriteError('stale', 409);
    }
  }
  if (
    base.moneyBase !== undefined &&
    (await moneyRevOf(state.moneyStamp ?? '')) !== base.moneyBase
  ) {
    throw new GroupWriteError('stale', 409);
  }
}

/** `planJoin`, written, with the album's settings row read first. */
export function joinGroup(db: GroupDb, ctx: PlanContext, name: string) {
  const request: WriteRequest = { rows: [{ table: 'album_groups', row: { id: ctx.groupId } }] };
  return writeGroup(db, request, (state) => planJoin(state, ctx, name));
}

// ---------------------------------------------------------------------------
// Turso's HTTP API (Hrana over HTTP)

type HranaValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

function toHrana(value: string | number | null): HranaValue {
  if (value === null) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  return { type: 'text', value };
}

function fromHrana(value: HranaValue): unknown {
  switch (value.type) {
    case 'null':
      return null;
    case 'integer':
      return Number(value.value);
    case 'float':
      return value.value;
    case 'text':
      return value.value;
    default:
      return null;
  }
}

interface HranaResult {
  cols: { name: string | null }[];
  rows: HranaValue[][];
}

/** An album's database over Turso's HTTP API, with the Worker's own token. */
export function hranaDb(url: string, token: string): GroupDb {
  const endpoint = `${url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '')}/v2/pipeline`;
  const post = async (requests: unknown[]) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
    });
    if (!res.ok) throw new Error(`turso_pipeline_failed_${res.status}`);
    const body = (await res.json()) as {
      results: (
        | { type: 'ok'; response: Record<string, unknown> }
        | { type: 'error'; error: { message: string } }
      )[];
    };
    return body.results;
  };
  const stmt = (statement: Statement) => ({
    sql: statement.sql,
    args: statement.args.map(toHrana),
  });
  return {
    async queryAll(statements) {
      if (!statements.length) return [];
      const results = await post(
        statements.map((statement) => ({ type: 'execute', stmt: stmt(statement) })),
      );
      return statements.map((_, index) => {
        const result = results[index];
        if (result?.type !== 'ok') throw new Error('turso_query_failed');
        const { cols, rows } = (result.response as { result: HranaResult }).result;
        return rows.map((values) =>
          Object.fromEntries(
            values.map((value, i) => [cols[i]?.name ?? String(i), fromHrana(value)]),
          ),
        );
      });
    },
    async transaction(statements) {
      // BEGIN, each statement only if everything before it went, COMMIT only
      // if all did, else ROLLBACK: one round trip.
      const steps: { stmt: unknown; condition?: unknown }[] = [
        { stmt: { sql: 'BEGIN IMMEDIATE' } },
      ];
      for (const statement of statements) {
        steps.push({ stmt: stmt(statement), condition: { type: 'ok', step: steps.length - 1 } });
      }
      const commit = steps.length;
      steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: commit - 1 } });
      steps.push({
        stmt: { sql: 'ROLLBACK' },
        condition: { type: 'not', cond: { type: 'ok', step: commit } },
      });
      const [result] = await post([{ type: 'batch', batch: { steps } }]);
      if (result?.type !== 'ok') throw new Error('turso_batch_failed');
      const outcome = (
        result.response as { result: { step_results: unknown[]; step_errors: unknown[] } }
      ).result;
      if (outcome.step_results[commit] != null) return true;
      // A failed check is another write that landed first; anything else is not.
      const failed = outcome.step_errors.find((error) => error != null) as
        | { message?: string }
        | undefined;
      if (failed && !/overflow/i.test(failed.message ?? '')) {
        throw new Error(`turso_write_failed: ${failed.message ?? ''}`);
      }
      return false;
    },
  };
}

/** The response for a refused write. */
export function groupWriteErrorResponse(error: unknown): Response | null {
  return error instanceof GroupWriteError ? json({ error: error.code }, error.status) : null;
}

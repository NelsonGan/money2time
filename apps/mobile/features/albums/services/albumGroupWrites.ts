// Changes to a shared album's group, made on this phone. A change is planned
// by the album's rules (../lib/groupPlan.ts: checked, stamped with who made
// it, with its activity entries) and written to the phone's own copy of the
// group in one transaction; Cloud Sync's triggers queue it, and the album's
// channel sends it to the album's database like any shared row. So a change
// saves offline and goes up when the phone is back online. This is the only
// code that writes the group's tables (a test refuses any other write that
// names one), so no change skips the log. The caller then brings the user's own entries in step
// (`projectGroup`). See README.md > Album members and shared albums.

import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import { sharedAlbumFor } from '~/features/cloudSync/services/sharedLedgerStore';
import { sharedLedgerSync } from '~/features/cloudSync/services/sharedLedgerSync';
import { getSQLite } from '~/lib/db/client';
import { I18n } from '~/lib/i18n';
import { newId, nowIso } from '~/utils/id';

import {
  type GroupState,
  GroupWriteError,
  MAX_MEMBER_ROWS,
  type Plan,
  type PlannedWrite,
  planWrite,
  type Row,
  rowKey,
  type StoredRow,
  type WriteRequest,
} from '../lib/groupPlan';
import type { GroupRowWrite } from '../lib/groupRows';

const SAFE_TABLE = /^album_(members|expenses|settlements|groups|activity)$/;

const columnCache = new Map<string, Set<string>>();

function columnsOf(table: string): Set<string> {
  let columns = columnCache.get(table);
  if (!columns) {
    columns = new Set(
      getSQLite()
        .getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`)
        .map((column) => column.name),
    );
    if (columns.size) columnCache.set(table, columns);
  }
  return columns;
}

/**
 * What a change reads first, from this phone's copy of the group: its
 * members, and the rows the change names (with the bills its payments are
 * for). Only the group's own rows: an id is the group's to choose, so a row
 * of another group is never reached through it.
 */
export function loadGroupState(groupId: string, request: WriteRequest): GroupState {
  const db = getSQLite();
  const members: StoredRow[] = db
    .getAllSync<Row>(`SELECT * FROM album_members WHERE ledger_id = ? LIMIT ${MAX_MEMBER_ROWS}`, [
      groupId,
    ])
    .map((data) => ({ table: 'album_members', id: String(data.id), data }));
  const rows = new Map<string, StoredRow>();
  for (const row of members) rows.set(rowKey(row.table, row.id), row);
  const wanted = new Map<string, Set<string>>();
  const want = (table: unknown, id: unknown) => {
    if (typeof table !== 'string' || typeof id !== 'string' || !SAFE_TABLE.test(table)) return;
    if (!wanted.has(table)) wanted.set(table, new Set());
    wanted.get(table)!.add(id);
  };
  for (const item of request.rows) {
    want(item?.table, item?.row?.id);
    if (item?.table === 'album_settlements') want('album_expenses', item.row.expense_id);
  }
  for (const [table, ids] of wanted) {
    if (table === 'album_members') continue;
    const list = [...ids];
    for (let start = 0; start < list.length; start += 200) {
      const part = list.slice(start, start + 200);
      const found = db.getAllSync<Row>(
        `SELECT * FROM "${table}" WHERE ledger_id = ? AND id IN (${part.map(() => '?').join(', ')})`,
        [groupId, ...part],
      );
      for (const data of found) {
        rows.set(rowKey(table, String(data.id)), { table, id: String(data.id), data });
      }
    }
  }
  return { members, rows };
}

type Value = string | number | null;

function toValue(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Writes a plan's rows whole, in one transaction, with the triggers on so
 * Cloud Sync sends them. A row id held by another group's row is never taken
 * over: the whole change is refused (`bad_row`), log entries included.
 */
export function applyPlanLocally(groupId: string, plan: Plan): void {
  if (!plan.writes.length) return;
  const db = getSQLite();
  db.withTransactionSync(() => {
    for (const write of plan.writes) writeRow(groupId, write);
  });
}

function writeRow(groupId: string, write: PlannedWrite): void {
  const columns = columnsOf(write.table);
  if (!SAFE_TABLE.test(write.table) || !columns.size) throw new GroupWriteError('bad_row');
  const data: Row = { ...write.data, id: write.id, ledger_id: groupId };
  const names = Object.keys(data).filter((name) => columns.has(name));
  const updates = names.filter((name) => name !== 'id');
  const result = getSQLite().runSync(
    `INSERT INTO "${write.table}" (${names.map((name) => `"${name}"`).join(', ')})
     VALUES (${names.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.map((name) => `"${name}" = excluded."${name}"`).join(', ')}
     WHERE "${write.table}".ledger_id = excluded.ledger_id`,
    names.map((name) => toValue(data[name])),
  );
  // The guard skipped it: the id is another group's.
  if (!result.changes) throw new GroupWriteError('bad_row');
}

/**
 * Makes a change to a shared album's group on this phone: planned by the
 * album's rules as the account the user is in it as, then written to the
 * phone's copy, which Cloud Sync sends up. `reason: 'close_even'` marks
 * payments the app records by itself to close an even group, so the log
 * says so. Throws `GroupWriteError` for a change the album does not allow,
 * and `not_found` when the album is not shared here. Works offline.
 */
export async function writeGroup(
  groupId: string,
  rows: readonly GroupRowWrite[],
  opts: { reason?: 'close_even' } = {},
): Promise<void> {
  if (!rows.length) return;
  const share = sharedAlbumFor(groupId);
  if (!share?.userId) throw new CloudSyncApiError('not_found', 404);
  const request: WriteRequest = { rows: [...rows], reason: opts.reason };
  const plan = planWrite(
    loadGroupState(groupId, request),
    { groupId, userId: share.userId, now: nowIso(), newId },
    request,
    share.ownerUserId ?? (share.role === 'owner' ? share.userId : ''),
  );
  applyPlanLocally(groupId, plan);
}

/**
 * Puts the user on the album's list as themselves (joining, or starting it).
 * Written by the Worker, as for someone joining on the website, so two people
 * joining at once never take one name; the album's channel then brings it
 * down. Needs a connection, as joining does.
 */
export async function joinGroup(groupId: string, name: string): Promise<void> {
  await sharedLedgerSync.joinAlbumGroup(groupId, name);
}

/** Why a change to a shared album did not go, in words. */
export function groupWriteMessage(error: unknown): string {
  if (error instanceof GroupWriteError && error.code === 'not_member') {
    return I18n.t('albums.write.not_member');
  }
  if (error instanceof CloudSyncApiError && error.code === 'not_found') {
    return I18n.t('albums.write.not_member');
  }
  return I18n.t('albums.write.failed');
}

/** Whether a failed change is worth reporting: not a refusal by the album's rules. */
export function isExpectedGroupWriteError(error: unknown): boolean {
  if (error instanceof GroupWriteError) {
    return ['not_member', 'name_taken', 'not_a_member', 'forbidden'].includes(error.code);
  }
  return (
    error instanceof CloudSyncApiError &&
    ['network', 'not_member', 'not_found', 'unauthorized', 'name_taken'].includes(error.code)
  );
}

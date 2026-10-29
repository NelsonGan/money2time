// Turning an app row into the JSON stored in the cloud copy, and back. Pure.
//
// The cloud keeps each row as one JSON object, so app updates that add columns
// need no cloud migration. Two rules keep mixed app versions safe:
// - Writing merges over the stored JSON, so a phone on an older app version
//   keeps the fields it does not know about instead of erasing them.
// - Reading keeps only the columns this phone's table has.
// Device-local columns (syncTables.ts: some settings, and a shared ledger's
// preferences) never leave the phone and are never overwritten by another
// phone's values. `shared`: the row syncs with a shared ledger's database.

import { isDeviceLocalColumn } from './syncTables';

export type RowValue = string | number | null;
export type Row = Record<string, RowValue>;

function isRowValue(value: unknown): value is RowValue {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

/** The JSON to store for `localRow`, merged over the stored copy if any. */
export function encodeRow(
  table: string,
  localRow: Row,
  storedJson: string | null,
  shared = false,
): string {
  const merged: Row = {};
  const stored = parseStored(storedJson);
  for (const [column, value] of Object.entries(stored)) {
    if (!isDeviceLocalColumn(table, column, shared)) merged[column] = value;
  }
  for (const [column, value] of Object.entries(localRow)) {
    if (isDeviceLocalColumn(table, column, shared)) continue;
    // Blobs never occur in the app's tables; anything not JSON-safe is skipped.
    if (isRowValue(value)) merged[column] = value;
  }
  return JSON.stringify(merged);
}

/**
 * The column values to write locally for a stored row: only columns this
 * phone's table has, never a device-local setting. Returns null when the JSON
 * is unreadable or has no id.
 */
export function decodeRow(
  table: string,
  storedJson: string,
  localColumns: ReadonlySet<string>,
  shared = false,
): Row | null {
  const stored = parseStored(storedJson);
  if (typeof stored.id !== 'string' || !stored.id) return null;
  const row: Row = {};
  for (const [column, value] of Object.entries(stored)) {
    if (!localColumns.has(column) || isDeviceLocalColumn(table, column, shared)) continue;
    row[column] = value;
  }
  return row;
}

function parseStored(json: string | null): Row {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const row: Row = {};
    for (const [column, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRowValue(value)) row[column] = value;
    }
    return row;
  } catch {
    return {};
  }
}

/**
 * Whether the cloud's copy is a tombstone made after this phone last saw the
 * row (`seenRev`), while this phone changed its older, live copy: a phone that
 * was offline running a recurring rule deleted elsewhere, say. The delete
 * wins, since sending the stale copy would bring the row back on every phone.
 * A row this phone saw deleted and then revived itself (a budget line added
 * back) goes up as usual. A row merely missing from the cloud copy is not a
 * delete: sharing a ledger moves its rows out of the user's own copy.
 */
export function deletedElsewhere(
  seenRev: string | null,
  stored: { data: string; rev: string } | undefined,
  local: Row,
): boolean {
  if (!seenRev || !stored || stored.rev === seenRev || local.deleted_at != null) return false;
  return parseStored(stored.data).deleted_at != null;
}

/**
 * SQL to write one decoded row, as `[sql, params]`: an UPDATE when this phone
 * already has the row, else an INSERT. Not an upsert: SQLite checks NOT NULL
 * on the insert half first, and a settings row arrives without its
 * device-local columns (purchase identity, created_at), which would fail.
 */
export function buildWrite(table: string, row: Row, exists: boolean): [string, RowValue[]] {
  const columns = Object.keys(row);
  if (exists) {
    const updates = columns.filter((c) => c !== 'id');
    if (!updates.length) return ['SELECT 1', []];
    return [
      `UPDATE "${table}" SET ${updates.map((c) => `"${c}" = ?`).join(', ')} WHERE id = ?`,
      [...updates.map((c) => row[c] ?? null), row.id ?? null],
    ];
  }
  return [
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c] ?? null),
  ];
}

/** A new, unique revision: this phone's id and a time-ordered counter. */
export function makeRev(deviceId: string, nowMs: number, counter: number): string {
  return `${nowMs.toString(36)}.${counter.toString(36)}.${deviceId}`;
}

export interface RevEntry {
  table: string;
  id: string;
  rev: string;
}

export interface RevDiff {
  /** Rows the cloud has at a revision this phone has not applied. */
  changed: RevEntry[];
  /** Rows this phone had from the cloud that are no longer there. */
  removed: { table: string; id: string }[];
}

/** One key for a (table, id) pair, for sets and maps. */
export function rowKey(table: string, id: string): string {
  return `${table}\u0000${id}`;
}

/** Compares the cloud's revisions with the ones this phone last saw. */
export function diffRevs(remote: Iterable<RevEntry>, local: Iterable<RevEntry>): RevDiff {
  const localRevs = new Map<string, string>();
  for (const entry of local) localRevs.set(rowKey(entry.table, entry.id), entry.rev);
  const changed: RevEntry[] = [];
  const seen = new Set<string>();
  for (const entry of remote) {
    const k = rowKey(entry.table, entry.id);
    seen.add(k);
    if (localRevs.get(k) !== entry.rev) changed.push(entry);
  }
  const removed: { table: string; id: string }[] = [];
  for (const entry of local) {
    if (!seen.has(rowKey(entry.table, entry.id)))
      removed.push({ table: entry.table, id: entry.id });
  }
  return { changed, removed };
}

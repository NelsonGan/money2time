/**
 * Web Dashboard patches: what changed since a copy a browser already holds,
 * so a change made from the browser comes back as a few rows instead of the
 * whole export. Pure functions over the backup's shape; the browser applies
 * a patch with the same rules (src/lib/cloud/patch.ts in the website repo).
 *
 * A patch is JSON, gzipped and sent like any other transfer:
 *
 *   { patch: 1, exportedAt,
 *     tables: { <table>: { put?: Row[], del?: string[] } | { all: Row[] | null } },
 *     assets?: { put?: { path, base64 }[], del?: string[] } }
 *
 * Tables whose rows all carry a string `id` change row by row: `put`
 * replaces the row with that id or adds it at the end, `del` removes ids.
 * Any other table (join tables, a table with no ids) is sent whole when
 * anything in it changed, and `all: null` means the table is gone. Assets
 * change file by file, by path. Tables the patch does not name are unchanged.
 *
 * A copy kept past the screen's visit is kept as a hash of each row instead
 * of the row (`hashIndex`, `writeIndex`): a few bytes per row on disk, ids
 * and hashes only, and still enough to tell which rows changed.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[] | undefined>;
type Asset = { path: string; base64: string };

/** What a patch is made against: the backup's shape, as the export builds it. */
export type PatchSource = {
  exportedAt?: string | null;
  tables: object;
  userAssets?: Asset[];
};

type TableIndex =
  | { kind: 'absent' }
  | { kind: 'rows'; rows: Map<string, string> }
  | { kind: 'whole'; json: string };

/**
 * A copy as a browser holds it, ready to diff against: each row as JSON, by
 * id, and each photo's base64 by path. `hashed`: each of those strings is its
 * `contentHash` instead. `head` is the backup's other top-level fields (its
 * format version), which a patch does not carry: a copy whose head differs
 * from the data now is not patched (`sameFormat`).
 */
export type BackupIndex = {
  tables: Map<string, TableIndex>;
  assets: Map<string, string>;
  head?: string;
  hashed?: boolean;
};

type TablePatch = { put?: Row[]; del?: string[] } | { all: Row[] | null };

export type BackupPatch = {
  patch: 1;
  exportedAt: string | null;
  tables: Record<string, TablePatch>;
  assets?: { put?: Asset[]; del?: string[] };
};

/**
 * A 64-bit hash of a row's JSON or a photo's base64 (two 32-bit lanes, after
 * cyrb53). Only compared with another one of these, never stored as data.
 */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
}

/**
 * Whether a string from the index (`before`) describes the same content as
 * `after`. Against a hashed index, `hash` is `after`'s hash when already made.
 */
function same(base: BackupIndex, before: string | undefined, after: string, hash?: string) {
  if (before === undefined) return false;
  return base.hashed ? before === (hash ?? contentHash(after)) : before === after;
}

/** Rows keyed by a unique string `id`, or null when any row has none. */
function keyedRows(rows: Row[]): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const row of rows) {
    const id = row?.id;
    if (typeof id !== 'string' || out.has(id)) return null;
    out.set(id, JSON.stringify(row));
  }
  return out;
}

function indexTable(rows: Row[] | undefined): TableIndex {
  if (!Array.isArray(rows)) return { kind: 'absent' };
  const keyed = keyedRows(rows);
  return keyed ? { kind: 'rows', rows: keyed } : { kind: 'whole', json: JSON.stringify(rows) };
}

function assetIndex(assets: Asset[] | undefined): Map<string, string> {
  return new Map((assets ?? []).map((asset) => [asset.path, asset.base64]));
}

/** The top-level fields a patch leaves as they were: all but the tables, photos and export time. */
function headOf(data: PatchSource): string {
  const { tables: _tables, userAssets: _assets, exportedAt: _at, ...rest } = data;
  return JSON.stringify(rest);
}

/** Whether `next` can be patched onto the copy `base` describes: the same backup format. */
export function sameFormat(base: BackupIndex, next: PatchSource): boolean {
  return base.head === headOf(next);
}

export function indexBackup(data: PatchSource): BackupIndex {
  const tables = new Map<string, TableIndex>();
  for (const [name, rows] of Object.entries(data.tables as Tables)) {
    tables.set(name, indexTable(rows));
  }
  return { tables, assets: assetIndex(data.userAssets), head: headOf(data) };
}

/**
 * The whole export as JSON, built from the index's row strings so a copy is
 * serialized once whether it is sent whole or kept to patch against. Parses
 * to the same backup as `JSON.stringify(data)`; only the key order differs.
 */
export function exportJson(data: PatchSource, index: BackupIndex): string {
  const { tables: _tables, ...rest } = data;
  const tables: string[] = [];
  for (const [name, table] of index.tables) {
    if (table.kind === 'absent') continue;
    const rows = table.kind === 'rows' ? `[${[...table.rows.values()].join(',')}]` : table.json;
    tables.push(`${JSON.stringify(name)}:${rows}`);
  }
  const head = JSON.stringify(rest);
  return `${head.slice(0, -1)}${head.length > 2 ? ',' : ''}"tables":{${tables.join(',')}}}`;
}

/**
 * A table's hashes from the ones a copy before it had: a row the same as in
 * that copy keeps its hash, and only a changed or new one is hashed, so a
 * patch costs no more to keep than to make.
 */
function carryTable(after: TableIndex, before: TableIndex, known?: TableIndex): TableIndex {
  if (after.kind === 'absent') return after;
  if (after.kind === 'whole') {
    const kept = before.kind === 'whole' && known?.kind === 'whole' && before.json === after.json;
    return { kind: 'whole', json: kept ? known.json : contentHash(after.json) };
  }
  const rows = new Map<string, string>();
  const old = before.kind === 'rows' && known?.kind === 'rows' ? before.rows : null;
  const oldHashes = known?.kind === 'rows' ? known.rows : null;
  for (const [id, json] of after.rows) {
    const kept = old?.get(id) === json ? oldHashes?.get(id) : undefined;
    rows.set(id, kept ?? contentHash(json));
  }
  return { kind: 'rows', rows };
}

export type DiffOptions = {
  /** `next`'s index, when made already. */
  index?: BackupIndex;
  /** Against a hashed `base`: `next`'s hashes (`hashIndex` of `index`), made a slice at a time. */
  hashes?: BackupIndex;
  /** Against a plain `base`: its hashes, so `next`'s come out too, hashing only what changed. */
  baseHashes?: BackupIndex;
};

/**
 * The patch that turns the copy `base` describes into `next`, the index of
 * `next`, which the following patch is made against, and, when `base`'s
 * hashes are known (`opts`), `next`'s hashes, to keep after the visit.
 * Hashing every row of a large copy is the slow part, so against a hashed
 * `base` the caller hashes `next` ahead, a slice at a time.
 */
export function diffBackup(
  base: BackupIndex,
  next: PatchSource,
  opts: DiffOptions = {},
): { patch: BackupPatch; index: BackupIndex; hashes?: BackupIndex } {
  const nextTables = next.tables as Tables;
  const index: BackupIndex = {
    tables: new Map(),
    assets: opts.index?.assets ?? assetIndex(next.userAssets),
    head: headOf(next),
  };
  const ahead = base.hashed ? opts.hashes : undefined;
  const carry = !base.hashed ? opts.baseHashes : undefined;
  const hashes: BackupIndex | undefined = carry
    ? { tables: new Map(), assets: new Map(), head: index.head, hashed: true }
    : ahead;
  const tables: Record<string, TablePatch> = {};
  const names = new Set([...base.tables.keys(), ...Object.keys(nextTables)]);
  for (const name of names) {
    const before = base.tables.get(name) ?? { kind: 'absent' };
    const rows = nextTables[name];
    const after = opts.index?.tables.get(name) ?? indexTable(rows);
    const known = ahead?.tables.get(name);
    index.tables.set(name, after);
    if (carry) hashes!.tables.set(name, carryTable(after, before, carry.tables.get(name)));
    if (after.kind === 'absent') {
      if (before.kind !== 'absent') tables[name] = { all: null };
      continue;
    }
    if (after.kind === 'rows' && before.kind === 'rows') {
      const put: Row[] = [];
      for (const row of rows!) {
        const id = row.id as string;
        const hash = known?.kind === 'rows' ? known.rows.get(id) : undefined;
        if (!same(base, before.rows.get(id), after.rows.get(id)!, hash)) put.push(row);
      }
      const del = [...before.rows.keys()].filter((id) => !after.rows.has(id));
      if (put.length || del.length) {
        tables[name] = { ...(put.length ? { put } : {}), ...(del.length ? { del } : {}) };
      }
      continue;
    }
    // Changed shape, or a table without ids: whole, if it changed at all.
    const json = after.kind === 'whole' ? after.json : JSON.stringify(rows);
    const hash = after.kind === 'whole' && known?.kind === 'whole' ? known.json : undefined;
    if (before.kind !== 'whole' || !same(base, before.json, json, hash)) {
      tables[name] = { all: rows! };
    }
  }

  const put: Asset[] = [];
  for (const [path, base64] of index.assets) {
    const before = base.assets.get(path);
    if (!same(base, before, base64, ahead?.assets.get(path))) put.push({ path, base64 });
    if (carry) {
      const kept = before === base64 ? carry.assets.get(path) : undefined;
      hashes!.assets.set(path, kept ?? contentHash(base64));
    }
  }
  const del = [...base.assets.keys()].filter((path) => !index.assets.has(path));

  const patch: BackupPatch = { patch: 1, exportedAt: next.exportedAt ?? null, tables };
  if (put.length || del.length) {
    patch.assets = { ...(put.length ? { put } : {}), ...(del.length ? { del } : {}) };
  }
  return hashes ? { patch, index, hashes } : { patch, index };
}

/**
 * The index with each row and photo replaced by its hash, to keep after the
 * visit. `pause` runs every few thousand rows, so a large copy does not hold
 * up the screen.
 */
export async function hashIndex(
  index: BackupIndex,
  pause: () => Promise<void>,
): Promise<BackupIndex> {
  if (index.hashed) return index;
  // Every few thousand rows, without a promise per row.
  let done = 0;
  const tables = new Map<string, TableIndex>();
  for (const [name, table] of index.tables) {
    if (table.kind === 'rows') {
      const rows = new Map<string, string>();
      for (const [id, json] of table.rows) {
        rows.set(id, contentHash(json));
        if (++done % 2000 === 0) await pause();
      }
      tables.set(name, { kind: 'rows', rows });
    } else if (table.kind === 'whole') {
      tables.set(name, { kind: 'whole', json: contentHash(table.json) });
      if (++done % 2000 === 0) await pause();
    } else {
      tables.set(name, table);
    }
  }
  const assets = new Map<string, string>();
  for (const [path, base64] of index.assets) {
    assets.set(path, contentHash(base64));
    if (++done % 2000 === 0) await pause();
  }
  return { tables, assets, head: index.head, hashed: true };
}

/**
 * A hashed index as text, for a file: each table is `[id, hash, …]` for rows
 * by id or one hash for a whole table, and an absent table is left out.
 */
export function writeIndex(index: BackupIndex): string {
  if (!index.hashed) throw new Error('Only a hashed index is written');
  const tables: Record<string, string | string[]> = {};
  for (const [name, table] of index.tables) {
    if (table.kind === 'rows') tables[name] = [...table.rows].flat();
    else if (table.kind === 'whole') tables[name] = table.json;
  }
  return JSON.stringify({ v: 1, head: index.head, tables, assets: [...index.assets].flat() });
}

function pairs(value: unknown): Map<string, string> | null {
  if (!Array.isArray(value) || value.length % 2 !== 0) return null;
  const out = new Map<string, string>();
  for (let i = 0; i < value.length; i += 2) {
    const key: unknown = value[i];
    const hash: unknown = value[i + 1];
    if (typeof key !== 'string' || typeof hash !== 'string') return null;
    out.set(key, hash);
  }
  return out;
}

/** Reads `writeIndex`'s text back; null for anything else. */
export function readIndex(text: string): BackupIndex | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { v, head, tables: rawTables, assets: rawAssets } = parsed as Record<string, unknown>;
  if (v !== 1 || typeof head !== 'string') return null;
  if (!rawTables || typeof rawTables !== 'object' || Array.isArray(rawTables)) return null;
  const tables = new Map<string, TableIndex>();
  for (const [name, table] of Object.entries(rawTables)) {
    if (typeof table === 'string') {
      tables.set(name, { kind: 'whole', json: table });
      continue;
    }
    const rows = pairs(table);
    if (!rows) return null;
    tables.set(name, { kind: 'rows', rows });
  }
  const assets = pairs(rawAssets);
  return assets ? { tables, assets, head, hashed: true } : null;
}

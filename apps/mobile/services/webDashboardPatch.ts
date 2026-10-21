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

/** A copy as a browser holds it, ready to diff against: each row as JSON, by id. */
export type BackupIndex = {
  tables: Map<string, TableIndex>;
  assets: Map<string, string>;
};

type TablePatch = { put?: Row[]; del?: string[] } | { all: Row[] | null };

export type BackupPatch = {
  patch: 1;
  exportedAt: string | null;
  tables: Record<string, TablePatch>;
  assets?: { put?: Asset[]; del?: string[] };
};

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

export function indexBackup(data: PatchSource): BackupIndex {
  const tables = new Map<string, TableIndex>();
  for (const [name, rows] of Object.entries(data.tables as Tables)) {
    tables.set(name, indexTable(rows));
  }
  return { tables, assets: assetIndex(data.userAssets) };
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
 * The patch that turns the copy `base` describes into `next`, and the index
 * of `next`, which the following patch is made against.
 */
export function diffBackup(
  base: BackupIndex,
  next: PatchSource,
): { patch: BackupPatch; index: BackupIndex } {
  const nextTables = next.tables as Tables;
  const index: BackupIndex = { tables: new Map(), assets: assetIndex(next.userAssets) };
  const tables: Record<string, TablePatch> = {};
  const names = new Set([...base.tables.keys(), ...Object.keys(nextTables)]);
  for (const name of names) {
    const before = base.tables.get(name) ?? { kind: 'absent' };
    const rows = nextTables[name];
    const after = indexTable(rows);
    index.tables.set(name, after);
    if (after.kind === 'absent') {
      if (before.kind !== 'absent') tables[name] = { all: null };
      continue;
    }
    if (after.kind === 'rows' && before.kind === 'rows') {
      const put: Row[] = [];
      for (const row of rows!) {
        const id = row.id as string;
        if (before.rows.get(id) !== after.rows.get(id)) put.push(row);
      }
      const del = [...before.rows.keys()].filter((id) => !after.rows.has(id));
      if (put.length || del.length) {
        tables[name] = { ...(put.length ? { put } : {}), ...(del.length ? { del } : {}) };
      }
      continue;
    }
    // Changed shape, or a table without ids: whole, if it changed at all.
    const json = after.kind === 'whole' ? after.json : JSON.stringify(rows);
    if (before.kind !== 'whole' || before.json !== json) tables[name] = { all: rows! };
  }

  const put: Asset[] = [];
  for (const [path, base64] of index.assets) {
    if (base.assets.get(path) !== base64) put.push({ path, base64 });
  }
  const del = [...base.assets.keys()].filter((path) => !index.assets.has(path));

  const patch: BackupPatch = { patch: 1, exportedAt: next.exportedAt ?? null, tables };
  if (put.length || del.length) {
    patch.assets = { ...(put.length ? { put } : {}), ...(del.length ? { del } : {}) };
  }
  return { patch, index };
}

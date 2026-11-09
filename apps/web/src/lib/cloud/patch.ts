/**
 * Applies a patch from the phone: only what changed since a copy this
 * browser holds, so a change saved from here comes back as a few rows
 * instead of the whole export. The rules mirror the app's
 * services/webDashboardPatch.ts, which describes the format:
 *
 * - `{ put, del }` for a table whose rows all have an id: `put` replaces the
 *   row with that id, or adds it at the end; `del` removes ids.
 * - `{ all }` replaces a table whole; `all: null` removes it.
 * - `assets` changes the photos the same way, by path.
 *
 * Tables and photos the patch does not name are kept as they are.
 */

import type { BackupFile } from "@/lib/backup/types";

type Row = Record<string, unknown>;
type Asset = { path: string; base64: string };

type TablePatch = { put?: unknown; del?: unknown; all?: unknown };

type BackupPatch = {
  patch: 1;
  exportedAt?: unknown;
  tables?: Record<string, TablePatch>;
  assets?: { put?: unknown; del?: unknown };
};

class PatchError extends Error {}

function isPatch(value: unknown): value is BackupPatch {
  return !!value && typeof value === "object" && (value as { patch?: unknown }).patch === 1;
}

function rowsOf(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new PatchError("rows");
  return value.filter((row): row is Row => !!row && typeof row === "object");
}

function idsOf(value: unknown): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) throw new PatchError("ids");
  return new Set(value as string[]);
}

/** `put` and `del` against a list keyed by `key`, keeping the existing order. */
function merge<T>(current: T[], put: T[], del: Set<string>, key: (item: T) => unknown): T[] {
  const replaced = new Map<unknown, T>();
  for (const item of put) replaced.set(key(item), item);
  const out: T[] = [];
  for (const item of current) {
    const id = key(item);
    if (del.has(id as string)) continue;
    if (replaced.has(id)) {
      out.push(replaced.get(id)!);
      replaced.delete(id);
    } else {
      out.push(item);
    }
  }
  // What was not there before goes at the end, as the phone lists new rows.
  for (const item of replaced.values()) out.push(item);
  return out;
}

/** The backup with the patch applied, as plain JSON data; `readBackup` checks it after. */
export function applyPatch(backup: BackupFile, text: string): Record<string, unknown> {
  let patch: unknown;
  try {
    patch = JSON.parse(text);
  } catch {
    throw new PatchError("json");
  }
  if (!isPatch(patch)) throw new PatchError("shape");
  const tables: Record<string, unknown> = { ...backup.tables };
  for (const [name, change] of Object.entries(patch.tables ?? {})) {
    if (!change || typeof change !== "object" || name === "__proto__") throw new PatchError("table");
    if ("all" in change) {
      if (change.all === null) delete tables[name];
      else tables[name] = rowsOf(change.all);
      continue;
    }
    const current = tables[name] === undefined ? [] : rowsOf(tables[name]);
    const put = change.put === undefined ? [] : rowsOf(change.put);
    if (put.some((row) => typeof row.id !== "string")) throw new PatchError("id");
    tables[name] = merge(current, put, idsOf(change.del), (row) => row.id);
  }
  let userAssets = backup.userAssets ?? [];
  if (patch.assets) {
    const put = patch.assets.put === undefined ? [] : patch.assets.put;
    if (
      !Array.isArray(put) ||
      put.some((asset) => !asset || typeof asset.path !== "string" || typeof asset.base64 !== "string")
    ) {
      throw new PatchError("assets");
    }
    userAssets = merge<Asset>(userAssets, put as Asset[], idsOf(patch.assets.del), (asset) => asset.path);
  }
  return {
    ...backup,
    exportedAt: typeof patch.exportedAt === "string" ? patch.exportedAt : backup.exportedAt,
    userAssets,
    tables,
  };
}

/**
 * Web Dashboard edits: Albums (trips): create, edit, delete, and add or remove transactions.
 * Planned on the phone like the app's own editor; applied by
 * features/settings/lib/webDashboardApply/album.ts.
 *
 *   create        { album: { name, startDate, endDate, transactionIds } }   (CreateAlbumScreen)
 *   update        { id, at, album: { name, startDate, endDate } }          (EditAlbumDetailsScreen)
 *   delete        { id, at }                                               (AlbumDetailScreen)
 *   transactions  { id, at, add, remove }                                  (AddAlbumTransactionsScreen)
 *   reorder       { ids }  every album, in the new order                   (AlbumsScreen drag)
 *   active        { id }   the album new transactions go to, or null       (AlbumsScreen)
 *
 * The cover photo and the location stay on the phone: the web has no photo
 * upload and no offline place search, so a new album gets neither and an edit
 * leaves both as they are. The app's picker offers expenses only, so only
 * expenses can be added.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import type { Album } from '~/types';

import type { EditModule, ModuleOp, PlanTools, Result } from '../webDashboardEdits';
import { isAt, isDayKey, isId, isRecord, MAX_EDIT_ROWS } from './shared';

/** What the planner reads from the app (the apply module's `select`). */
export type AlbumExtra = { albums: Album[] };

type Details = { name: string; startDate: string | null; endDate: string | null };

type AlbumOp =
  | { entity: 'module:album'; op: 'create'; album: Details & { transactionIds: string[] } }
  | { entity: 'module:album'; op: 'update'; id: string; at: string | null; album: Details }
  | { entity: 'module:album'; op: 'delete'; id: string; at: string | null }
  | {
      entity: 'module:album';
      op: 'transactions';
      id: string;
      at: string | null;
      add: string[];
      remove: string[];
    }
  | { entity: 'module:album'; op: 'reorder'; ids: string[] }
  | { entity: 'module:album'; op: 'active'; id: string | null };

const MAX_NAME = 80;

const isDayOrNull = (value: unknown): value is string | null => value === null || isDayKey(value);
const hasKeys = (value: Record<string, unknown>, keys: string) =>
  Object.keys(value).sort().join(',') === keys;

/** Distinct ids, at most a batch's worth; null otherwise. */
function readIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_EDIT_ROWS || !value.every(isId)) return null;
  return new Set(value).size === value.length ? value : null;
}

function readDetails(value: unknown, keys: string): Details | null {
  if (!isRecord(value) || !hasKeys(value, keys)) return null;
  const { name, startDate, endDate } = value;
  if (typeof name !== 'string' || name.length > MAX_NAME) return null;
  if (!isDayOrNull(startDate) || !isDayOrNull(endDate)) return null;
  return { name, startDate, endDate };
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const entity = 'module:album';
  const { op } = raw;
  if (op === 'reorder') {
    const ids = readIds(raw.ids);
    return hasKeys(raw, 'entity,ids,op') && ids?.length ? { entity, op, ids } : null;
  }
  if (op === 'active') {
    const id = raw.id ?? null;
    return hasKeys(raw, 'entity,id,op') && (id === null || isId(id)) ? { entity, op, id } : null;
  }
  if (op === 'create') {
    if (!hasKeys(raw, 'album,entity,op')) return null;
    const details = readDetails(raw.album, 'endDate,name,startDate,transactionIds');
    const transactionIds = isRecord(raw.album) ? readIds(raw.album.transactionIds) : null;
    return details && transactionIds ? { entity, op, album: { ...details, transactionIds } } : null;
  }
  if (!isId(raw.id) || !isAt(raw.at)) return null;
  if (op === 'update') {
    if (!hasKeys(raw, 'album,at,entity,id,op')) return null;
    const album = readDetails(raw.album, 'endDate,name,startDate');
    return album ? { entity, op, id: raw.id, at: raw.at, album } : null;
  }
  if (op === 'delete') {
    return hasKeys(raw, 'at,entity,id,op') ? { entity, op, id: raw.id, at: raw.at } : null;
  }
  if (op === 'transactions') {
    if (!hasKeys(raw, 'add,at,entity,id,op,remove')) return null;
    const add = readIds(raw.add);
    const remove = readIds(raw.remove);
    if (!add || !remove || add.length + remove.length === 0) return null;
    const removing = new Set(remove);
    if (add.some((id) => removing.has(id))) return null;
    return { entity, op, id: raw.id, at: raw.at, add, remove };
  }
  return null;
}

/** Each must be a live expense on the phone, as the app's picker lists them. */
function checkExpenses(tools: PlanTools, ids: string[]): Result<true> {
  const byId = new Map(tools.lookup.transactions.map((tx) => [tx.id, tx]));
  for (const id of ids) {
    const tx = byId.get(id);
    if (!tx || tx.deletedAt) return tools.refuse('conflict');
    if (tx.type !== 'expense') return tools.refuse('invalid');
  }
  return tools.ok(true);
}

function checkDetails(details: Details): Details | null {
  const name = details.name.trim();
  if (!name) return null;
  return { name, startDate: details.startDate, endDate: details.endDate };
}

export const albumModule: EditModule = {
  entity: 'module:album',
  read,
  rowIds: (raw) => {
    const op = raw as unknown as AlbumOp;
    if (op.op === 'create') return op.album.transactionIds;
    return op.op === 'transactions' ? op.add : [];
  },
  size: (raw) => {
    const op = raw as unknown as AlbumOp;
    if (op.op === 'create') return 1 + op.album.transactionIds.length;
    if (op.op === 'reorder') return op.ids.length;
    return op.op === 'transactions' ? op.add.length + op.remove.length : 1;
  },
  plan: (tools, raw, steps) => {
    const op = raw as unknown as AlbumOp;
    const extra = tools.extra as AlbumExtra;
    const live = extra.albums.filter((album) => !album.deletedAt);

    if (op.op === 'create') {
      const details = checkDetails(op.album);
      if (!details) return tools.refuse('invalid');
      // AlbumsScreen's checkLimit('albums', albums.length) before the create screen opens.
      const made = tools.created.albums ?? 0;
      if (!tools.lookup.isPro && live.length + made >= PRO_LIMITS.FREE_MAX_ALBUMS) {
        return tools.refuse('pro_required', 'albums');
      }
      const checked = checkExpenses(tools, op.album.transactionIds);
      if (!checked.ok) return checked;
      tools.created.albums = made + 1;
      steps.push({
        kind: 'module',
        entity: 'module:album',
        action: 'create',
        payload: { ...details, transactionIds: op.album.transactionIds },
      });
      return tools.ok(1);
    }

    if (op.op === 'reorder') {
      // AlbumsScreen's drag: the whole list in its new order, saved by reorderAlbums.
      if (!tools.claim('albums:order')) return tools.refuse('invalid');
      const have = new Set(live.map((album) => album.id));
      if (op.ids.length !== have.size || !op.ids.every((id) => have.has(id))) {
        return tools.refuse('conflict');
      }
      steps.push({
        kind: 'module',
        entity: 'module:album',
        action: 'reorder',
        payload: { ids: op.ids },
      });
      return tools.ok(op.ids.length);
    }
    if (op.op === 'active') {
      // AlbumsScreen's "Auto-add new transactions to": one album, or none.
      if (!tools.claim('albums:active')) return tools.refuse('invalid');
      // The album is read as it is now: the same batch must not also change it.
      if (op.id !== null && !tools.claim(`album:${op.id}`)) return tools.refuse('invalid');
      if (op.id !== null && !live.some((album) => album.id === op.id)) {
        return tools.refuse('conflict');
      }
      steps.push({
        kind: 'module',
        entity: 'module:album',
        action: 'active',
        payload: { id: op.id },
      });
      return tools.ok(1);
    }

    if (!tools.claim(`album:${op.id}`)) return tools.refuse('invalid');
    const current = live.find((album) => album.id === op.id);
    // Gone on the phone, or changed there since the browser's copy.
    if (!current || current.updatedAt !== op.at) return tools.refuse('conflict');

    if (op.op === 'delete') {
      steps.push({
        kind: 'module',
        entity: 'module:album',
        action: 'delete',
        payload: { id: op.id },
      });
      return tools.ok(1);
    }
    if (op.op === 'update') {
      const details = checkDetails(op.album);
      if (!details) return tools.refuse('invalid');
      steps.push({
        kind: 'module',
        entity: 'module:album',
        action: 'update',
        payload: { id: op.id, ...details },
      });
      return tools.ok(1);
    }
    const checked = checkExpenses(tools, op.add);
    if (!checked.ok) return checked;
    steps.push({
      kind: 'module',
      entity: 'module:album',
      action: 'transactions',
      payload: { id: op.id, add: op.add, remove: op.remove },
    });
    return tools.ok(op.add.length + op.remove.length);
  },
};

/**
 * Web Dashboard edits: a shared album's bills, which anyone in the album can
 * add to, change and delete (README: Album members and shared albums >
 * Anyone in it can change it). Planned on the phone with the rules of the
 * app's editor for such a bill (EditTransactionScreen, the album's bulk Edit,
 * the Activity tab); applied by
 * features/settings/lib/webDashboardApply/albumBill.ts through the group, so
 * a change reaches everyone in the album.
 *
 *   update  { id, at, set }        one bill: the group's fields (day, title,
 *                                  currency, payer, shares) and the user's own
 *                                  (category, longer note, account, mood,
 *                                  reimbursable)
 *   bulk    { rows, set }          the album's bulk Edit: day and title for
 *                                  everyone, category and account the user's own
 *   delete  { rows }               deletes bills for everyone (payments stay)
 *   restore { albumId, billId }    brings back a deleted bill (Activity's Restore)
 *
 * `set.shares` is the whole bill, one row per member with their share
 * (`{ memberId, amount }`), and `set.paidBy` the member who paid; the two go
 * together, and the bill's amount is what the shares add up to, as
 * `billFromRows` makes it. Anyone still in the album can be on a bill, and
 * anyone already on it stays (`billPeople`). A save that names none of the
 * group's fields changes the user's own entry only and is never sent to the
 * group (`saveAlbumBillOwnFields`). Only a phone naming `shared-albums` in
 * `meta.features` takes this module; an older one refuses it as unknown.
 */

import type { TransactionWithRelations } from '~/types';

import type { EditModule, EditRow, EditStep, ModuleOp, PlanTools } from '../webDashboardEdits';
import {
  type Checks,
  isAt,
  isCurrency,
  isDayKey,
  isId,
  isMoney,
  isRecord,
  isText,
  MAX_NOTE,
  readFields,
} from './shared';

/** A member of a shared album, as the planner reads one. */
export type AlbumBillMember = {
  id: string;
  name: string;
  /** Still in the album (`isCurrentMember`): only they are put on a bill. */
  current: boolean;
};

/** A bill of the group, as the planner reads one. */
export type AlbumBillRecord = {
  id: string;
  date: string;
  note: string | null;
  currency: string;
  paidBy: string;
  shares: { memberId: string; amount: number }[];
  deleted: boolean;
};

/** One shared album's group on this phone. */
export type AlbumBillGroup = {
  /** The group's id, which is its album's. */
  id: string;
  /** The user's own member while they are still in the album; null and nothing can change. */
  selfId: string | null;
  members: AlbumBillMember[];
  bills: AlbumBillRecord[];
};

/** What the planner reads from the app (the apply module's `select`). */
export type AlbumBillExtra = { groups: AlbumBillGroup[] };

type Share = { memberId: string; amount: number };

/** The bill's fields a web save can name, the group's and the user's own. */
export type AlbumBillFields = {
  date?: string;
  note?: string;
  currency?: string;
  paidBy?: string;
  shares?: Share[];
  categoryId?: string | null;
  details?: string;
  accountId?: string | null;
  sentiment?: 'happy' | 'neutral' | 'sad';
  reimbursable?: boolean;
};

type BulkFields = { date?: string; note?: string; categoryId?: string; accountId?: string };

type AlbumBillOp =
  | {
      entity: 'module:albumbill';
      op: 'update';
      id: string;
      at: string | null;
      set: AlbumBillFields;
    }
  | { entity: 'module:albumbill'; op: 'bulk'; rows: EditRow[]; set: BulkFields }
  | { entity: 'module:albumbill'; op: 'delete'; rows: EditRow[] }
  | { entity: 'module:albumbill'; op: 'restore'; albumId: string; billId: string };

/** A shared album's people: the Worker's limit, the owner and 20 others. */
const MAX_SHARES = 21;
const MAX_DETAILS = 2000;
/** The group's fields: naming any of them sends the bill to the group. */
const GROUP_KEYS = ['date', 'note', 'currency', 'paidBy', 'shares'] as const;
const OWN_KEYS = ['categoryId', 'details', 'accountId', 'sentiment', 'reimbursable'] as const;

function readShares(value: unknown): Share[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SHARES) return null;
  const seen = new Set<string>();
  const shares: Share[] = [];
  for (const row of value) {
    if (!isRecord(row) || Object.keys(row).sort().join(',') !== 'amount,memberId') return null;
    if (!isId(row.memberId) || seen.has(row.memberId)) return null;
    if (!isMoney(row.amount) || row.amount < 0) return null;
    seen.add(row.memberId);
    shares.push({ memberId: row.memberId, amount: row.amount });
  }
  return shares;
}

const FIELD_KEYS: Checks = {
  date: isDayKey,
  note: (v) => isText(v, MAX_NOTE),
  currency: isCurrency,
  paidBy: isId,
  shares: (v) => readShares(v) !== null,
  categoryId: (v) => v === null || isId(v),
  details: (v) => isText(v, MAX_DETAILS),
  accountId: (v) => v === null || isId(v),
  sentiment: (v) => v === 'happy' || v === 'neutral' || v === 'sad',
  reimbursable: (v) => typeof v === 'boolean',
};

const BULK_KEYS: Checks = {
  date: isDayKey,
  note: (v) => isText(v, MAX_NOTE),
  categoryId: isId,
  accountId: isId,
};

function readRows(value: unknown): EditRow[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: EditRow[] = [];
  for (const row of value) {
    if (!isRecord(row) || Object.keys(row).sort().join(',') !== 'at,id') return null;
    if (!isId(row.id) || !isAt(row.at)) return null;
    rows.push({ id: row.id, at: row.at });
  }
  return rows;
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const keys = Object.keys(raw).sort().join(',');
  const entity = 'module:albumbill' as const;
  if (op === 'update') {
    if (keys !== 'at,entity,id,op,set' || !isId(raw.id) || !isAt(raw.at)) return null;
    const set = readFields<AlbumBillFields>(raw.set, FIELD_KEYS);
    if (!set || !Object.keys(set).length) return null;
    // The payer and the shares are one thing: who paid and who owes them.
    if ('paidBy' in set !== 'shares' in set) return null;
    return { entity, op, id: raw.id, at: raw.at, set };
  }
  if (op === 'bulk') {
    if (keys !== 'entity,op,rows,set') return null;
    const rows = readRows(raw.rows);
    const set = readFields<BulkFields>(raw.set, BULK_KEYS);
    return rows && set && Object.keys(set).length ? { entity, op, rows, set } : null;
  }
  if (op === 'delete') {
    if (keys !== 'entity,op,rows') return null;
    const rows = readRows(raw.rows);
    return rows ? { entity, op, rows } : null;
  }
  if (op === 'restore') {
    if (keys !== 'albumId,billId,entity,op' || !isId(raw.albumId) || !isId(raw.billId)) {
      return null;
    }
    return { entity, op, albumId: raw.albumId, billId: raw.billId };
  }
  return null;
}

const cents = (value: number) => Math.round(value * 100);

/**
 * The bill's entry on this phone and its group, checked as one: it is the
 * row the browser saw, a shared album's bill, and that album is shared here
 * with the user still in it.
 */
function billOf(
  tools: PlanTools,
  extra: AlbumBillExtra,
  row: EditRow,
):
  | { ok: true; tx: TransactionWithRelations; group: AlbumBillGroup; bill: AlbumBillRecord }
  | { ok: false; error: 'invalid' | 'conflict' } {
  if (!tools.claim(`tx:${row.id}`)) return { ok: false, error: 'invalid' };
  const tx = tools.lookup.transactions.find((item) => item.id === row.id);
  // Gone on the phone, or changed there since the browser's copy.
  if (!tx || tx.deletedAt || tx.updatedAt !== row.at) return { ok: false, error: 'conflict' };
  const group = tx.albumGroupId ? extra.groups.find((item) => item.id === tx.albumGroupId) : null;
  // Not a shared album's bill (any more), or one the user can no longer change.
  if (!group?.selfId) return { ok: false, error: 'invalid' };
  const bill = group.bills.find((item) => item.id === tx.id);
  if (!bill || bill.deleted) return { ok: false, error: 'conflict' };
  return { ok: true, tx, group, bill };
}

/** Whether the user's own account goes on this entry: a bill they paid, or one they paid back. */
function takesAccount(tx: TransactionWithRelations): boolean {
  const payer = (tx.splits ?? []).find((split) => !split.deletedAt && split.isPayer);
  return !payer || !!payer.paidAt;
}

function planUpdate(
  tools: PlanTools,
  op: Extract<AlbumBillOp, { op: 'update' }>,
  extra: AlbumBillExtra,
  steps: EditStep[],
) {
  const found = billOf(tools, extra, op);
  if (!found.ok) return tools.refuse(found.error);
  const { tx, group, bill } = found;
  const { set } = op;
  // The user's own fields, as the app's editor checks them.
  if ('categoryId' in set) {
    const category = set.categoryId ? tools.findCategory(set.categoryId) : null;
    if (set.categoryId && category?.type !== 'expense') return tools.refuse('invalid');
  }
  if (set.accountId != null && !tools.findAccount(set.accountId)) return tools.refuse('invalid');
  const own: Record<string, unknown> = {};
  for (const key of OWN_KEYS) if (key in set) own[key] = set[key];
  if (!GROUP_KEYS.some((key) => key in set)) {
    // Only the user's own fields: saved on their entry alone, nothing sent or logged.
    steps.push({
      kind: 'module',
      entity: 'module:albumbill',
      action: 'own',
      payload: { id: tx.id, own },
    });
    return tools.ok(1);
  }

  const paidBy = set.paidBy ?? bill.paidBy;
  const shares = set.shares ?? bill.shares;
  // Anyone still in the album can be on a bill, and anyone already on it stays.
  const keep = new Set([bill.paidBy, ...bill.shares.map((share) => share.memberId)]);
  const people = new Map(
    group.members
      .filter((member) => member.current || keep.has(member.id))
      .map((member) => [member.id, member]),
  );
  if (!people.has(paidBy) || shares.some((share) => !people.has(share.memberId))) {
    return tools.refuse('invalid');
  }
  const total = shares.reduce((sum, share) => sum + cents(share.amount), 0);
  if (total <= 0) return tools.refuse('invalid');
  // A bill split with nobody else is not a shared album's: the app takes it
  // out of the group, which the web does not offer.
  const selfId = group.selfId!;
  if (paidBy === selfId && shares.every((share) => share.memberId === selfId || !share.amount)) {
    return tools.refuse('invalid');
  }
  const currency = set.currency ?? bill.currency;
  if (currency !== bill.currency && !tools.lookup.currencies.includes(currency)) {
    return tools.refuse('invalid');
  }
  steps.push({
    kind: 'module',
    entity: 'module:albumbill',
    action: 'save',
    payload: {
      id: tx.id,
      groupId: group.id,
      date: set.date ?? null,
      note: 'note' in set ? (set.note ?? '').trim() : (bill.note ?? ''),
      currency,
      // The split editor's rows for the whole bill, as `saveAlbumBill` takes them.
      rows: [
        ...shares.map((share) => ({
          personName: share.memberId === selfId ? null : (people.get(share.memberId)?.name ?? null),
          amount: share.amount,
          isSelf: share.memberId === selfId,
          isPayer: share.memberId === paidBy && paidBy !== selfId,
          albumMemberId: share.memberId === selfId ? null : share.memberId,
        })),
        // A payer with no share of their own still paid.
        ...(shares.some((share) => share.memberId === paidBy) || paidBy === selfId
          ? []
          : [
              {
                personName: people.get(paidBy)?.name ?? null,
                amount: 0,
                isSelf: false,
                isPayer: true,
                albumMemberId: paidBy,
              },
            ]),
      ],
      own,
    },
  });
  return tools.ok(1);
}

function planBulk(
  tools: PlanTools,
  op: Extract<AlbumBillOp, { op: 'bulk' }>,
  extra: AlbumBillExtra,
  steps: EditStep[],
) {
  const { set } = op;
  if (set.categoryId && tools.findCategory(set.categoryId)?.type !== 'expense') {
    return tools.refuse('invalid');
  }
  if (set.accountId && !tools.findAccount(set.accountId)) return tools.refuse('invalid');
  const ids: string[] = [];
  for (const row of op.rows) {
    const found = billOf(tools, extra, row);
    if (!found.ok) return tools.refuse(found.error);
    // An account goes only where it is the user's: a bill they paid, or paid back.
    if (set.accountId && !takesAccount(found.tx)) return tools.refuse('invalid');
    ids.push(found.tx.id);
  }
  steps.push({
    kind: 'module',
    entity: 'module:albumbill',
    action: 'bulk',
    payload: { ids, ...set, ...(set.note !== undefined ? { note: set.note.trim() } : {}) },
  });
  return tools.ok(ids.length);
}

function planDelete(
  tools: PlanTools,
  op: Extract<AlbumBillOp, { op: 'delete' }>,
  extra: AlbumBillExtra,
  steps: EditStep[],
) {
  const ids: string[] = [];
  for (const row of op.rows) {
    const found = billOf(tools, extra, row);
    if (!found.ok) return tools.refuse(found.error);
    ids.push(found.tx.id);
  }
  steps.push({ kind: 'module', entity: 'module:albumbill', action: 'delete', payload: { ids } });
  return tools.ok(ids.length);
}

function planRestore(
  tools: PlanTools,
  op: Extract<AlbumBillOp, { op: 'restore' }>,
  extra: AlbumBillExtra,
  steps: EditStep[],
) {
  if (!tools.claim(`albumbill:${op.billId}`)) return tools.refuse('invalid');
  const group = extra.groups.find((item) => item.id === op.albumId);
  if (!group?.selfId) return tools.refuse('invalid');
  const bill = group.bills.find((item) => item.id === op.billId);
  // Already back (someone restored it first), or never this album's.
  if (!bill) return tools.refuse('invalid');
  if (!bill.deleted) return tools.refuse('conflict');
  steps.push({
    kind: 'module',
    entity: 'module:albumbill',
    action: 'restore',
    payload: { groupId: group.id, billId: bill.id },
  });
  return tools.ok(1);
}

export const albumBillModule: EditModule = {
  entity: 'module:albumbill',
  read,
  rowIds: (raw) => {
    const op = raw as unknown as AlbumBillOp;
    if (op.op === 'update') return [op.id];
    if (op.op === 'restore') return [];
    return op.rows.map((row) => row.id);
  },
  size: (raw) => {
    const op = raw as unknown as AlbumBillOp;
    if (op.op === 'update') return 1 + (op.set.shares?.length ?? 0);
    if (op.op === 'restore') return 1;
    return op.rows.length;
  },
  plan: (tools, raw, steps) => {
    const op = raw as unknown as AlbumBillOp;
    const extra = tools.extra as AlbumBillExtra;
    switch (op.op) {
      case 'update':
        return planUpdate(tools, op, extra, steps);
      case 'bulk':
        return planBulk(tools, op, extra, steps);
      case 'delete':
        return planDelete(tools, op, extra, steps);
      case 'restore':
        return planRestore(tools, op, extra, steps);
    }
  },
};

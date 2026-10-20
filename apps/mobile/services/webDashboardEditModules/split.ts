/**
 * Web Dashboard edits: Split Bill on an expense, and settling a friend's share
 * (SplitBillModal, Who owes you). Planned on the phone like the app's own
 * editor; applied by features/settings/lib/webDashboardApply/split.ts.
 *
 *   create   { tx, splits }                  a new expense saved with its split rows
 *   update   { id, at, set, splits }         an existing expense and its split rows
 *   settle   { id, txId, at, paybackAccountId? }   mark one share paid
 *   unsettle { id, txId, at }                undo a paid share
 *   remove   { id, txId, at }                remove a share still owed (Settle Up's bin)
 *   payback  { id, txId, at, paybackAccountId }    the account a share is paid back to
 *   default_payback { accountId }            Settle Up settings' "Default paid to"
 *
 * `splits` are the Split Bill page's rows: Me and the friends, each with a name
 * and an amount, and the account a friend pays back to. They follow the
 * editor's save (`resolveSplitSaveRoute`): rows with a friend save through the
 * split writer, and no rows on an expense that had splits clears them. The
 * unpaid rows must add up to the expense's amount, as the page's sum bar asks
 * before Done. On an update an existing row keeps its id; `paid` flips a saved
 * friend's share as the editor's Mark paid / Undo do, and a paid share stays
 * as it was. `set` is the transaction's change, as the transaction editor
 * sends it, saved after the splits as the app's edit screen does. The
 * transaction is named here only, so the same batch must not also update it.
 * `at` is the expense's `updated_at` for create/update, and the share's own
 * for the share ops. Itemized receipt splits and tax & service stay in the
 * app.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import type { TransactionSplit, TransactionWithRelations } from '~/types';

import type { EditModule, EditStep, ModuleOp, PlanTools, TxFields } from '../webDashboardEdits';

/** What the planner reads from the app (the apply module's `select`). */
export type SplitExtra = {
  /** Expenses with a friend's share still unpaid: the free plan's split-bill count. */
  unpaidBills: number;
};

export type SplitRow = {
  /** A saved row's id; absent for a new row. */
  id?: string;
  name: string;
  amount: number;
  isSelf: boolean;
  /** The account a friend pays back to; null falls back to the expense's account. */
  paybackAccountId: string | null;
  /** Update only: the share is paid. */
  paid?: boolean;
};

/** A split row as AppContext's split writers take it (`SplitDraftInput`). */
export type SplitDraftPayload = {
  id?: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  paybackAccountId: string | null;
  sortOrder: number;
};

type SplitOp =
  | { entity: 'module:split'; op: 'create'; tx: TxFields; splits: SplitRow[] }
  | {
      entity: 'module:split';
      op: 'update';
      id: string;
      at: string | null;
      set: TxFields;
      splits: SplitRow[];
    }
  | {
      entity: 'module:split';
      op: 'settle';
      id: string;
      txId: string;
      at: string | null;
      paybackAccountId?: string;
    }
  | { entity: 'module:split'; op: 'unsettle'; id: string; txId: string; at: string | null }
  | { entity: 'module:split'; op: 'remove'; id: string; txId: string; at: string | null }
  | {
      entity: 'module:split';
      op: 'payback';
      id: string;
      txId: string;
      at: string | null;
      paybackAccountId: string;
    }
  | { entity: 'module:split'; op: 'default_payback'; accountId: string };

const MAX_ROWS = 50;
const MAX_NAME = 80;
const MAX_AMOUNT = 1e12;
const EPSILON = 0.005;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;
const isAt = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT;
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const isDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The transaction editor's fields, as the core planner reads them. */
const TX_KEYS: Record<keyof TxFields, (value: unknown) => boolean> = {
  type: (v) => v === 'expense' || v === 'income' || v === 'transfer' || v === 'balance_adjustment',
  amount: isMoney,
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  toAmount: (v) => v === null || (isMoney(v) && v >= 0),
  date: isDay,
  accountId: (v) => v === null || isId(v),
  fromAccountId: (v) => v === null || isId(v),
  toAccountId: (v) => v === null || isId(v),
  categoryId: (v) => v === null || isId(v),
  note: (v) => isText(v, 500),
  details: (v) => isText(v, 2000),
  sentiment: (v) => v === 'happy' || v === 'neutral' || v === 'sad',
  reimbursable: (v) => typeof v === 'boolean',
  countsAsExpense: (v) => typeof v === 'boolean',
};

function readTx(value: unknown): TxFields | null {
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const check = Object.prototype.hasOwnProperty.call(TX_KEYS, key)
      ? TX_KEYS[key as keyof TxFields]
      : undefined;
    if (!check || !check(item)) return null;
  }
  return value as TxFields;
}

function readRows(value: unknown, update: boolean): SplitRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const rows: SplitRow[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const allowed = update
      ? ['id', 'name', 'amount', 'isSelf', 'paybackAccountId', 'paid']
      : ['name', 'amount', 'isSelf', 'paybackAccountId'];
    if (Object.keys(row).some((key) => !allowed.includes(key))) return null;
    if ('id' in row && !isId(row.id)) return null;
    if (!isText(row.name, MAX_NAME)) return null;
    if (!isMoney(row.amount) || row.amount < 0) return null;
    if (typeof row.isSelf !== 'boolean') return null;
    if (row.paybackAccountId !== null && !isId(row.paybackAccountId)) return null;
    if ('paid' in row && typeof row.paid !== 'boolean') return null;
    rows.push(row as SplitRow);
  }
  return rows;
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const keys = Object.keys(raw).sort().join(',');
  const entity = 'module:split' as const;
  if (op === 'create') {
    if (keys !== 'entity,op,splits,tx') return null;
    const tx = readTx(raw.tx);
    const splits = readRows(raw.splits, false);
    return tx && splits ? { entity, op, tx, splits } : null;
  }
  if (op === 'update') {
    if (keys !== 'at,entity,id,op,set,splits' || !isId(raw.id) || !isAt(raw.at)) return null;
    const set = readTx(raw.set);
    const splits = readRows(raw.splits, true);
    return set && splits ? { entity, op, id: raw.id, at: raw.at, set, splits } : null;
  }
  if (op === 'default_payback') {
    if (keys !== 'accountId,entity,op' || !isId(raw.accountId)) return null;
    return { entity, op, accountId: raw.accountId };
  }
  if (op === 'settle' || op === 'unsettle' || op === 'remove' || op === 'payback') {
    const withAccount = op === 'payback' || (op === 'settle' && 'paybackAccountId' in raw);
    const expected = withAccount ? 'at,entity,id,op,paybackAccountId,txId' : 'at,entity,id,op,txId';
    if (keys !== expected || !isId(raw.id) || !isId(raw.txId) || !isAt(raw.at)) return null;
    if (withAccount && !isId(raw.paybackAccountId)) return null;
    return withAccount
      ? {
          entity,
          op,
          id: raw.id,
          txId: raw.txId,
          at: raw.at,
          paybackAccountId: raw.paybackAccountId as string,
        }
      : { entity, op, id: raw.id, txId: raw.txId, at: raw.at };
  }
  return null;
}

const liveSplits = (tx: TransactionWithRelations): TransactionSplit[] =>
  (tx.splits ?? []).filter((split) => !split.deletedAt);

function localDay(stored: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return stored.slice(0, 10);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** SplitBillModal's rows as `toSplitDraftInputs` turns them into the writer's input. */
function drafts(rows: SplitRow[], fallbackAccountId: string | null): SplitDraftPayload[] {
  return rows.map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    personName: row.name.trim() || null,
    amount: row.amount,
    isSelf: row.isSelf,
    paybackAccountId: row.paybackAccountId ?? fallbackAccountId ?? null,
    sortOrder: index,
  }));
}

/** Me and at least one friend, as the Split Bill page always has once a friend is added. */
function rowsShapeOk(rows: SplitRow[]): boolean {
  return rows.filter((row) => row.isSelf).length === 1 && rows.some((row) => !row.isSelf);
}

/** The sum bar's check: the unpaid rows add up to the expense's amount. */
function sumMatches(rows: SplitRow[], amount: number): boolean {
  const unpaid = rows.reduce((sum, row) => (row.paid ? sum : sum + row.amount), 0);
  return Math.abs(Math.round(unpaid * 100) / 100 - amount) < EPSILON;
}

/**
 * The editor's split-bill gate (`checkLimit('split_bills', getUnpaidSplitBillCount())`)
 * when a split bill is started.
 */
function overSplitLimit(tools: PlanTools, extra: SplitExtra): boolean {
  const made = tools.created.split_bills ?? 0;
  if (
    !tools.lookup.isPro &&
    extra.unpaidBills + made >= PRO_LIMITS.FREE_MAX_UNSETTLED_SPLIT_BILLS
  ) {
    return true;
  }
  tools.created.split_bills = made + 1;
  return false;
}

function planCreate(
  tools: PlanTools,
  op: Extract<SplitOp, { op: 'create' }>,
  extra: SplitExtra,
  steps: EditStep[],
) {
  const { lookup } = tools;
  // A free plan over its account limit can no longer add entries, as in the app.
  if (
    !lookup.isPro &&
    countAccountsTowardFreeLimit(lookup.accounts) > PRO_LIMITS.FREE_MAX_ACCOUNTS
  ) {
    return tools.refuse('pro_required', 'accounts');
  }
  if (op.tx.date !== undefined && !tools.isDayKey(op.tx.date)) return tools.refuse('invalid');
  const payload = tools.transactionPayload(op.tx, null);
  if (!payload.ok) return payload;
  const input = payload.value;
  // Split Bill is only on an expense; a new bill has no paid share yet.
  if (input.type !== 'expense' || !rowsShapeOk(op.splits)) return tools.refuse('invalid');
  if (!sumMatches(op.splits, input.amount as number)) return tools.refuse('invalid');
  for (const row of op.splits) {
    if (row.paybackAccountId && !tools.findAccount(row.paybackAccountId)) {
      return tools.refuse('invalid');
    }
  }
  if (overSplitLimit(tools, extra)) return tools.refuse('pro_required', 'split_bills');
  steps.push({
    kind: 'module',
    entity: 'module:split',
    action: 'create',
    payload: { input, splits: drafts(op.splits, (input.accountId as string | null) ?? null) },
  });
  return tools.ok(1);
}

function planUpdate(
  tools: PlanTools,
  op: Extract<SplitOp, { op: 'update' }>,
  extra: SplitExtra,
  steps: EditStep[],
) {
  if (!tools.claim(`tx:${op.id}`)) return tools.refuse('invalid');
  const current = tools.lookup.transactions.find((tx) => tx.id === op.id);
  // Gone on the phone, or changed there since the browser's copy.
  if (!current || current.deletedAt || current.updatedAt !== op.at) {
    return tools.refuse('conflict');
  }
  const { set } = op;
  // A refund and its expense stay in step, as the core planner keeps them.
  const moves = 'amount' in set || 'currency' in set || 'type' in set || 'accountId' in set;
  if (moves && (current.reimbursementOfId || current.reimbursementTransactionId)) {
    return tools.refuse('amount_locked');
  }
  if (set.date !== undefined && !tools.isDayKey(set.date)) return tools.refuse('invalid');
  const payload = tools.transactionPayload(set, current);
  if (!payload.ok) return payload;
  const next = payload.value;
  const amount = next.amount as number;
  const accountId = (next.accountId as string | null) ?? null;

  const prior = liveSplits(current);
  const priorById = new Map(prior.map((split) => [split.id, split]));
  const rows = op.splits;
  const route = rows.length ? 'splits' : 'clear';
  if (route === 'splits' && (next.type !== 'expense' || !rowsShapeOk(rows))) {
    return tools.refuse('invalid');
  }
  // Nothing to write or remove: a plain transaction update.
  if (route === 'clear' && prior.length === 0) return tools.refuse('invalid');
  // A settled share cannot be swiped away; only leaving expense drops the bill whole.
  if (route === 'clear' && next.type === 'expense' && prior.some((split) => split.paidAt)) {
    return tools.refuse('invalid');
  }

  const markPaid: { id: string; paybackAccountId: string | null }[] = [];
  const markUnpaid: string[] = [];
  const kept = new Set<string>();
  for (const row of rows) {
    if (!row.id) {
      // Only a saved share can be marked paid from the web.
      if (row.paid) return tools.refuse('invalid');
      if (row.paybackAccountId && !tools.findAccount(row.paybackAccountId)) {
        return tools.refuse('invalid');
      }
      continue;
    }
    const before = priorById.get(row.id);
    if (!before || before.isSelf !== row.isSelf || !tools.claim(`split:${row.id}`)) {
      return tools.refuse('invalid');
    }
    kept.add(row.id);
    const wasPaid = !!before.paidAt;
    const isPaid = !!row.paid;
    if (row.isSelf && isPaid) return tools.refuse('invalid');
    if (wasPaid && isPaid) {
      // A settled share is read only on the Split Bill page.
      if (
        Math.abs(row.amount - before.amount) >= EPSILON ||
        (row.paybackAccountId ?? null) !== (before.paybackAccountId ?? null)
      ) {
        return tools.refuse('invalid');
      }
      continue;
    }
    // A share keeps the account it was saved with, even one since deleted.
    const changedPayback = row.paybackAccountId !== (before.paybackAccountId ?? null);
    if (changedPayback && row.paybackAccountId && !tools.findAccount(row.paybackAccountId)) {
      return tools.refuse('invalid');
    }
    if (isPaid && !wasPaid) {
      // As EditTransactionScreen stages it: the row's account, else the expense's.
      const payback = row.paybackAccountId ?? accountId;
      if (!accountId || !tools.findAccount(payback)) return tools.refuse('invalid');
      markPaid.push({ id: row.id, paybackAccountId: payback });
    } else if (!isPaid && wasPaid) {
      markUnpaid.push(row.id);
    }
  }
  if (route === 'splits') {
    // The page keeps Me by its id, and a settled share cannot be swiped away.
    for (const split of prior) {
      if (kept.has(split.id)) continue;
      if (split.isSelf || split.paidAt) return tools.refuse('invalid');
    }
    if (!sumMatches(rows, amount)) return tools.refuse('invalid');
    // Re-opening a bill that is already counted is never gated.
    const startsUnsettled = prior.some(
      (split) => !split.isSelf && !split.paidAt && split.amount > 0,
    );
    if (!startsUnsettled && overSplitLimit(tools, extra)) {
      return tools.refuse('pro_required', 'split_bills');
    }
  }

  // The transaction's own change: only what differs, as the core planner sends it.
  const input: Record<string, unknown> = {};
  const before = current as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    const same =
      key === 'date'
        ? localDay(current.date) === localDay(String(value))
        : (value ?? null) === (before[key] ?? null);
    if (!same) input[key] = value;
  }
  // Mark paid / Undo move the amount; the editor's final amount is written last.
  if (markPaid.length || markUnpaid.length) input.amount = amount;
  if ('accountId' in input || 'currency' in input || 'amount' in input) {
    input.accountAmount = next.accountAmount ?? null;
  }

  steps.push({
    kind: 'module',
    entity: 'module:split',
    action: 'update',
    payload: {
      id: current.id,
      splits:
        route === 'splits'
          ? drafts(
              rows.map((row) => {
                // Me keeps the name it was saved with.
                const saved = row.id ? priorById.get(row.id) : undefined;
                return row.isSelf && saved ? { ...row, name: saved.personName ?? '' } : row;
              }),
              accountId,
            )
          : [],
      markPaid,
      markUnpaid,
      input,
    },
  });
  return tools.ok(1);
}

function planSettle(
  tools: PlanTools,
  op: Extract<SplitOp, { op: 'settle' | 'unsettle' | 'remove' | 'payback' }>,
  steps: EditStep[],
) {
  if (!tools.claim(`split:${op.id}`)) return tools.refuse('invalid');
  const parent = tools.lookup.transactions.find((tx) => tx.id === op.txId);
  const split = parent ? liveSplits(parent).find((item) => item.id === op.id) : undefined;
  if (!parent || parent.deletedAt || !split || split.updatedAt !== op.at) {
    return tools.refuse('conflict');
  }
  if (split.isSelf) return tools.refuse('invalid');
  if (op.op === 'remove' || op.op === 'payback') {
    // Settle Up offers these on a share still owed: the bin (deleteSplit, after
    // "Remove this request?") and the account chip (updateSplitPaybackAccount).
    if (split.paidAt) return tools.refuse('invalid');
    if (op.op === 'payback' && !tools.findAccount(op.paybackAccountId)) {
      return tools.refuse('invalid');
    }
    steps.push({
      kind: 'module',
      entity: 'module:split',
      action: op.op,
      payload:
        op.op === 'payback'
          ? { splitId: split.id, paybackAccountId: op.paybackAccountId }
          : { splitId: split.id },
    });
    return tools.ok(1);
  }
  if (op.op === 'unsettle') {
    if (!split.paidAt) return tools.refuse('invalid');
    steps.push({
      kind: 'module',
      entity: 'module:split',
      action: 'unsettle',
      payload: { splitId: split.id },
    });
    return tools.ok(1);
  }
  if (split.paidAt || !parent.accountId) return tools.refuse('invalid');
  // markSplitPaid's account: the one picked, else the share's, else the expense's.
  const payback = op.paybackAccountId ?? split.paybackAccountId ?? parent.accountId;
  if (!tools.findAccount(payback)) return tools.refuse('invalid');
  steps.push({
    kind: 'module',
    entity: 'module:split',
    action: 'settle',
    payload: op.paybackAccountId
      ? { splitId: split.id, paybackAccountId: op.paybackAccountId }
      : { splitId: split.id },
  });
  return tools.ok(1);
}

export const splitModule: EditModule = {
  entity: 'module:split',
  read,
  rowIds: (raw) => {
    const op = raw as unknown as SplitOp;
    if (op.op === 'update') return [op.id];
    if (op.op === 'create' || op.op === 'default_payback') return [];
    return [op.txId];
  },
  size: (raw) => {
    const op = raw as unknown as SplitOp;
    return op.op === 'create' || op.op === 'update' ? 1 + op.splits.length : 1;
  },
  plan: (tools, raw, steps) => {
    const op = raw as unknown as SplitOp;
    const extra = tools.extra as SplitExtra | undefined;
    if (!extra) return tools.refuse('invalid');
    switch (op.op) {
      case 'create':
        return planCreate(tools, op, extra, steps);
      case 'update':
        return planUpdate(tools, op, extra, steps);
      case 'default_payback':
        // Settle Up settings' "Default paid to": updateSettings({ defaultPaybackAccountId }).
        if (!tools.claim('settings:defaultPayback') || !tools.findAccount(op.accountId)) {
          return tools.refuse('invalid');
        }
        steps.push({
          kind: 'module',
          entity: 'module:split',
          action: 'default_payback',
          payload: { accountId: op.accountId },
        });
        return tools.ok(1);
      default:
        return planSettle(tools, op, steps);
    }
  },
};

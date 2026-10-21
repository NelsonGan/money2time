/**
 * Changes made in the Web Dashboard, checked on the phone before any of them
 * is saved. Pure functions over what the phone already holds, so the rules
 * are tested without a database; `webDashboard.native.ts` reads what it needs
 * and the screen saves the plan through AppContext, the same calls the app's
 * own editors make.
 *
 * A browser sends one batch at a time:
 *
 *   { type: 'edit', id, token, ops: [ { entity, op, … }, … ] }
 *
 *   transaction  create { tx }          update { rows: [{ id, at }], set }   delete { rows }
 *   account      create { account }     update { id, at, set }              delete { id, at }
 *   group        create { name }        update { id, name }                 delete { id }
 *   category     create { category }    update { id, at, set }              delete { id, at, reassignTo? }
 *   recurring    create { rule }        update { id, at, set }              delete { id, at }
 *
 * `token` is the single-use edit token sent with the data on the browser's
 * screen, so an edit is always made against the phone's latest copy and a
 * replayed one is refused. `at` is each row's `updated_at` in that copy: a row
 * changed or gone on the phone since refuses the whole batch. A batch is saved
 * whole or not at all, and each change follows the rules of the app's own
 * editor for it: the payload it builds per transaction type, what a free plan
 * allows, what may change on a loan or a goal.
 */

import { getCardDesignTemplate } from '~/constants/cardDesigns';
import { PRO_LIMITS } from '~/constants/proLimits';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import type {
  Account,
  AccountGroup,
  Category,
  RecurringTransactionRule,
  TransactionSentiment,
  TransactionWithRelations,
} from '~/types';
import { flowTypeForBalanceDelta } from '~/utils/accountBalances';

import { EDIT_MODULES } from './webDashboardEditModules';
import {
  changedFields,
  type Checks,
  isAt,
  isCurrency,
  isDayKey,
  isId,
  isLogo,
  isMoney,
  isRecord,
  isText,
  localDay,
  MAX_EDIT_ROWS,
  readFields,
  readTx,
  validIcon,
} from './webDashboardEditModules/shared';

export { isDayKey, MAX_EDIT_ROWS };

const MAX_OPS = 50;
const MAX_NOTE = 500;
/** The app limits no name; this only keeps a batch inside one message. */
const MAX_NAME = 200;
const PATTERNS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Pattern = (typeof PATTERNS)[number];
type TxType = 'expense' | 'income' | 'transfer' | 'balance_adjustment';
type Flow = 'expense' | 'income';

export type EditRow = { id: string; at: string | null };

/** A transaction as the web editor describes it; on update, only the fields being changed. */
export type TxFields = {
  type?: TxType;
  amount?: number;
  /** The entry currency of an expense or income; a transfer is in its from account's. */
  currency?: string;
  /** Credited amount of a cross-currency transfer, in the to account's currency. */
  toAmount?: number | null;
  /** A day, `YYYY-MM-DD`. An update keeps the row's own time of day on it. */
  date?: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string;
  details?: string;
  sentiment?: TransactionSentiment;
  reimbursable?: boolean;
  countsAsExpense?: boolean;
};

export type AccountFields = {
  name?: string;
  type?: 'debit' | 'credit';
  /** The group's name, as accounts store it, or null for ungrouped. */
  group?: string | null;
  logoId?: string | null;
  /** A built-in card design (`<genre>/<name>`), or null for the plain card. */
  cardDesign?: string | null;
  currency?: string;
  /** New account: its starting balance. Existing one: the balance it should show now. */
  balance?: number;
  /** How a changed balance is recorded, as the app asks: an adjustment, or income/expense. */
  balanceRecord?: 'difference' | 'flow';
  includeInTotals?: boolean;
  creditStatementDay?: number | null;
  creditDueDay?: number | null;
};

export type CategoryFields = {
  name?: string;
  type?: Flow;
  parentId?: string | null;
  icon?: string;
};

export type RuleFields = {
  name?: string;
  type?: 'expense' | 'income' | 'transfer';
  amount?: number;
  /** An expense or income rule's currency; it keeps its own when absent. */
  currency?: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string;
  logoId?: string | null;
  pattern?: Pattern;
  interval?: number;
  /** The next run, `YYYY-MM-DD`. */
  nextRunDate?: string;
  /** The last day it may run, `YYYY-MM-DD`, or null for never ending. */
  endDate?: string | null;
  isActive?: boolean;
};

export type EditOp =
  | { entity: 'transaction'; op: 'create'; tx: TxFields }
  | { entity: 'transaction'; op: 'update'; rows: EditRow[]; set: TxFields }
  | { entity: 'transaction'; op: 'delete'; rows: EditRow[] }
  | { entity: 'account'; op: 'create'; account: AccountFields }
  | { entity: 'account'; op: 'update'; id: string; at: string | null; set: AccountFields }
  | { entity: 'account'; op: 'delete'; id: string; at: string | null }
  | { entity: 'group'; op: 'create'; name: string }
  | { entity: 'group'; op: 'update'; id: string; name: string; at?: string | null }
  | { entity: 'group'; op: 'delete'; id: string; at?: string | null }
  | { entity: 'category'; op: 'create'; category: CategoryFields }
  | { entity: 'category'; op: 'update'; id: string; at: string | null; set: CategoryFields }
  | { entity: 'category'; op: 'delete'; id: string; at: string | null; reassignTo?: string | null }
  | { entity: 'recurring'; op: 'create'; rule: RuleFields }
  | { entity: 'recurring'; op: 'update'; id: string; at: string | null; set: RuleFields }
  | { entity: 'recurring'; op: 'delete'; id: string; at: string | null }
  | ModuleOp;

/**
 * An op for an entity a module plans (goals, budgets, items, …): see
 * `webDashboardEditModules/`. Its fields are the module's to read.
 */
export type ModuleOp = { entity: `module:${string}`; op: string; [key: string]: unknown };

export type EditRequest = { id: string; token: string; ops: EditOp[] };

/**
 * Why a batch was refused. `stale`: the browser's copy is not the phone's
 * latest. `conflict`: something it names changed on the phone or is gone.
 * `amount_locked`: an amount the app keeps in step with something else (shared
 * splits, a refund). `pro_required`: past what a free plan allows (`feature`
 * names the limit). `off`: this browser may not make changes. `invalid`:
 * anything else the app's editor would not save. `failed`: nothing was saved.
 * `busy`: too many edits are waiting. `unknown`: saving failed partway, so
 * some of the batch may be saved (it is saved step by step, not atomically).
 */
export type EditRefusal =
  | 'stale'
  | 'conflict'
  | 'amount_locked'
  | 'pro_required'
  | 'off'
  | 'invalid'
  | 'failed'
  | 'busy'
  | 'unknown';

export type ProFeature =
  | 'accounts'
  | 'categories'
  | 'recurring'
  | 'reimbursements'
  | 'goals'
  | 'loans'
  | 'items'
  | 'albums'
  | 'budget_templates'
  | 'split_bills'
  | 'subcurrencies'
  | 'wage_entries';

/** One thing to save, in AppContext's terms. Applied in order. */
export type EditStep =
  | { kind: 'tx.create'; input: Record<string, unknown> }
  | { kind: 'tx.update'; updates: { id: string; input: Record<string, unknown> }[] }
  | { kind: 'tx.delete'; ids: string[] }
  | { kind: 'account.create'; input: Record<string, unknown> }
  | {
      kind: 'account.update';
      id: string;
      input: Record<string, unknown>;
      /** Convert the account to this currency (`changeAccountCurrency`). */
      currency?: string;
      /** A balance correction, recorded as the app's editor records one. */
      adjustment?: { type: 'balance_adjustment' | Flow; amount: number; currency: string };
    }
  | { kind: 'account.delete'; id: string }
  | { kind: 'group.create'; name: string }
  | { kind: 'group.rename'; id: string; name: string }
  | { kind: 'group.delete'; id: string }
  | { kind: 'category.create'; input: Record<string, unknown> }
  | { kind: 'category.update'; id: string; input: Record<string, unknown> }
  | { kind: 'category.delete'; id: string; reassignTo?: string }
  | { kind: 'recurring.create'; input: Record<string, unknown> }
  | { kind: 'recurring.update'; id: string; input: Record<string, unknown> }
  | { kind: 'recurring.delete'; id: string }
  /** A module's step, applied by its counterpart in `features/settings/lib/webDashboardApply/`. */
  | { kind: 'module'; entity: string; action: string; payload: Record<string, unknown> };

export type EditPlan = { steps: EditStep[]; count: number; kinds: string[] };

/** Everything a plan is checked against, read on the phone. */
export type EditLookup = {
  /** The live transactions the batch names (missing or deleted ones left out). */
  transactions: TransactionWithRelations[];
  accounts: Account[];
  accountGroups: AccountGroup[];
  categories: Category[];
  recurringRules: RecurringTransactionRule[];
  /** Each account's balance now, in its own currency. */
  balances: Map<string, number>;
  reportingCurrency: string;
  /** Currencies the app lets an entry be in: the main one, added ones, account ones. */
  currencies: string[];
  isPro: boolean;
  /** `amount` in `from` as `to` at the cached rate, or null without one. */
  convert: (amount: number, from: string, to: string) => number | null;
  /** Whether a bundled category icon id exists (the web offers the default pack). */
  isCategoryIcon: (id: string) => boolean;
  /** The icon the app suggests for a name, as its editor does for a new top-level category. */
  suggestIcon: (name: string) => string | null;
  now: Date;
  /**
   * What each module reads from the app, by module entity (its `select`): read
   * for the modules the batch names only.
   */
  extras: Record<string, unknown>;
};

/**
 * What a module gets to plan its ops with: the phone's data, the shared
 * checks, and the same answers the built-in entities give.
 */
export type PlanTools = {
  /** The phone's data, with what this batch's earlier ops changed (groups, deleted rows). */
  lookup: EditLookup;
  /** This module's data from the app (its `select`). */
  extra: unknown;
  liveAccounts: Account[];
  liveCategories: Category[];
  findAccount: (id: string | null | undefined) => Account | null;
  findCategory: (id: string | null | undefined) => Category | null;
  /** Whether an account group of this name exists, counting this batch's creates and renames. */
  groupExists: (name: string) => boolean;
  /** False when the batch already named this key: one thing twice is refused. */
  claim: (key: string) => boolean;
  /** An account or category this batch deletes: later ops in it can no longer use it. */
  forget: (kind: 'account' | 'category', id: string) => void;
  /** What this batch has created so far, per counter, for free-plan limits. */
  created: Record<string, number>;
  refuse: (error: EditRefusal, feature?: ProFeature) => Refuse;
  ok: <T>(value: T) => Result<T>;
  /** A transaction payload as the app's editor builds it (see `transactionPayload`). */
  transactionPayload: (
    fields: TxFields,
    current: TransactionWithRelations | null,
  ) => Result<Record<string, unknown>>;
};

/** A module: how one more entity's ops are read and planned. */
export type EditModule = {
  /** `module:<name>`, as the web sends it. */
  entity: `module:${string}`;
  /** The op as it arrived, or null when it is not of this module's shape. */
  read: (raw: Record<string, unknown>) => ModuleOp | null;
  /** Transaction ids the op names, read before it is planned. */
  rowIds?: (op: ModuleOp) => string[];
  /** Rows the op touches, for the batch's row limit; 1 by default. */
  size?: (op: ModuleOp) => number;
  plan: (tools: PlanTools, op: ModuleOp, steps: EditStep[]) => Result<number>;
};

export type Refuse = { ok: false; error: EditRefusal; feature?: ProFeature };
export type Result<T> = { ok: true; value: T } | Refuse;
const refuse = (error: EditRefusal, feature?: ProFeature): Refuse =>
  feature ? { ok: false, error, feature } : { ok: false, error };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

const isDay = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 31;
/** An uploaded logo stays only where the row already has it: the web cannot upload one. */
const keepsUpload = (next: string | null | undefined, current: string | null | undefined) =>
  !next?.startsWith('custom:') || next === current;

// ------------------------------------------------------------------ reading --

const ACCOUNT_KEYS: Checks = {
  name: (v) => isText(v, MAX_NAME),
  cardDesign: (v) => v === null || isText(v, 200),
  type: (v) => v === 'debit' || v === 'credit',
  group: (v) => v === null || isText(v, MAX_NAME),
  logoId: isLogo,
  currency: isCurrency,
  balance: isMoney,
  balanceRecord: (v) => v === 'difference' || v === 'flow',
  includeInTotals: (v) => typeof v === 'boolean',
  creditStatementDay: (v) => v === null || isDay(v),
  creditDueDay: (v) => v === null || isDay(v),
};

const CATEGORY_KEYS: Checks = {
  name: (v) => isText(v, MAX_NAME),
  type: (v) => v === 'expense' || v === 'income',
  parentId: (v) => v === null || isId(v),
  icon: (v) => isText(v, 64),
};

const RULE_KEYS: Checks = {
  name: (v) => isText(v, MAX_NAME),
  type: (v) => v === 'expense' || v === 'income' || v === 'transfer',
  amount: (v) => isMoney(v) && v >= 0,
  accountId: (v) => v === null || isId(v),
  fromAccountId: (v) => v === null || isId(v),
  toAccountId: (v) => v === null || isId(v),
  categoryId: (v) => v === null || isId(v),
  note: (v) => isText(v, MAX_NOTE),
  logoId: isLogo,
  currency: isCurrency,
  pattern: (v) => PATTERNS.includes(v as Pattern),
  interval: (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 999,
  nextRunDate: isDayKey,
  endDate: (v) => v === null || isDayKey(v),
  isActive: (v) => typeof v === 'boolean',
};

function readRows(value: unknown): EditRow[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: EditRow[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isId(row.id) || !isAt(row.at)) return null;
    rows.push({ id: row.id, at: row.at });
  }
  return rows;
}

function readOp(raw: Record<string, unknown>): EditOp | null {
  const { entity, op } = raw;
  const module = EDIT_MODULES.find((item) => item.entity === entity);
  if (module) return typeof op === 'string' ? module.read(raw) : null;
  if (entity === 'transaction') {
    if (op === 'create') {
      const tx = readTx(raw.tx);
      return tx ? { entity, op, tx } : null;
    }
    const rows = readRows(raw.rows);
    if (!rows) return null;
    if (op === 'delete') return { entity, op, rows };
    const set = readTx(raw.set);
    return op === 'update' && set && Object.keys(set).length ? { entity, op, rows, set } : null;
  }
  if (entity === 'group') {
    if (op === 'create') return isText(raw.name, MAX_NAME) ? { entity, op, name: raw.name } : null;
    if (!isId(raw.id)) return null;
    // `at` is optional: older web builds sent none.
    if (raw.at !== undefined && !isAt(raw.at)) return null;
    const at = raw.at as string | null | undefined;
    if (op === 'delete') return { entity, op, id: raw.id, ...(at !== undefined ? { at } : {}) };
    return op === 'update' && isText(raw.name, MAX_NAME)
      ? { entity, op, id: raw.id, name: raw.name, ...(at !== undefined ? { at } : {}) }
      : null;
  }
  const spec =
    entity === 'account'
      ? { key: 'account', checks: ACCOUNT_KEYS }
      : entity === 'category'
        ? { key: 'category', checks: CATEGORY_KEYS }
        : entity === 'recurring'
          ? { key: 'rule', checks: RULE_KEYS }
          : null;
  if (!spec) return null;
  if (op === 'create') {
    const value = readFields<Record<string, unknown>>(raw[spec.key], spec.checks);
    return value ? ({ entity, op, [spec.key]: value } as EditOp) : null;
  }
  if (!isId(raw.id) || !isAt(raw.at)) return null;
  if (op === 'delete') {
    if (entity !== 'category') return { entity, op, id: raw.id, at: raw.at } as EditOp;
    const reassignTo = raw.reassignTo ?? null;
    if (reassignTo !== null && !isId(reassignTo)) return null;
    return { entity, op, id: raw.id, at: raw.at, reassignTo };
  }
  const set = readFields<Record<string, unknown>>(raw.set, spec.checks);
  return op === 'update' && set && Object.keys(set).length
    ? ({ entity, op, id: raw.id, at: raw.at, set } as EditOp)
    : null;
}

/** Reads an edit message as it arrived; anything not of this shape is refused. */
export function readEditRequest(
  message: unknown,
): { kind: 'request'; request: EditRequest } | { kind: 'invalid' } {
  if (!isRecord(message) || typeof message.id !== 'string' || !/^[\w-]{16}$/.test(message.id)) {
    return { kind: 'invalid' };
  }
  if (typeof message.token !== 'string' || !Array.isArray(message.ops)) return { kind: 'invalid' };
  if (message.ops.length === 0 || message.ops.length > MAX_OPS) return { kind: 'invalid' };
  const ops: EditOp[] = [];
  for (const raw of message.ops) {
    const op = isRecord(raw) ? readOp(raw) : null;
    if (!op) return { kind: 'invalid' };
    ops.push(op);
  }
  return { kind: 'request', request: { id: message.id, token: message.token, ops } };
}

/** The transaction ids a request names, for reading those rows before it is planned. */
export function editTransactionIds(request: EditRequest): string[] {
  return request.ops.flatMap((op) => {
    if (op.entity === 'transaction') return op.op !== 'create' ? op.rows.map((row) => row.id) : [];
    const module = EDIT_MODULES.find((item) => item.entity === op.entity);
    return module?.rowIds?.(op as ModuleOp) ?? [];
  });
}

// -------------------------------------------------------------------- dates --

/** A new entry's date: now for today, else the day's local midnight, as the app's editor stores it. */
export function createdAt(day: string, now: Date = new Date()): string {
  if (localDay(now) === day) return now.toISOString();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function dayStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** A rule's end date: the end of that local day, as the app's rule editor stores it. */
function dayEnd(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

// ----------------------------------------------------------------- planning --

type Ctx = EditLookup & {
  liveAccounts: Account[];
  liveCategories: Category[];
  /** What this batch adds so far, for the free plan's limits. */
  created: { accounts: number; categories: number; rules: number } & Record<string, number>;
  /** Everything the batch names, so one named twice is refused. */
  named: Set<string>;
  /** Account groups this batch creates, by name. */
  newGroups: string[];
};

/**
 * The `updated_at` of a row an earlier op in the batch changes: no browser's
 * copy has it, so a later op naming that row by its old `at` is a conflict.
 */
const CHANGED_IN_BATCH = 'changed-in-this-batch';

const findAccount = (ctx: Ctx, id: string | null | undefined) =>
  id ? (ctx.liveAccounts.find((item) => item.id === id) ?? null) : null;
const findCategory = (ctx: Ctx, id: string | null | undefined) =>
  id ? (ctx.liveCategories.find((item) => item.id === id) ?? null) : null;

/** "Parent / Child", the name the app's editor gives a subcategory. */
function categoryLabel(ctx: Ctx, id: string): string | null {
  const category = findCategory(ctx, id);
  if (!category) return null;
  const parent = findCategory(ctx, category.parentId);
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

/** Takes a deleted account or category out of what the rest of the batch may use. */
function forget(ctx: Ctx, kind: 'account' | 'category', id: string) {
  if (kind === 'account') ctx.liveAccounts = ctx.liveAccounts.filter((item) => item.id !== id);
  else ctx.liveCategories = ctx.liveCategories.filter((item) => item.id !== id);
}

function claim(ctx: Ctx, key: string): boolean {
  if (ctx.named.has(key)) return false;
  ctx.named.add(key);
  return true;
}

/**
 * What a transaction becomes: the row as it is with the change on top, checked
 * the way the app's editor checks a save, and turned into the payload that
 * editor builds for its type.
 */
function transactionPayload(
  ctx: Ctx,
  fields: TxFields,
  current: TransactionWithRelations | null,
): Result<Record<string, unknown>> {
  // A legacy adjustment is stored as a transfer on one account with no ends;
  // the app edits it as an adjustment and keeps its stored type.
  const legacyAdjustment =
    current?.type === 'transfer' &&
    !!current.accountId &&
    !current.fromAccountId &&
    !current.toAccountId;
  const currentType: TxType | undefined = legacyAdjustment
    ? 'balance_adjustment'
    : (current?.type as TxType | undefined);
  const type: TxType = fields.type ?? currentType ?? 'expense';
  // An adjustment comes from a balance change and stays one, as in the app.
  if ((currentType === 'balance_adjustment') !== (type === 'balance_adjustment')) {
    return refuse('invalid');
  }
  // What the app's convert gives without a rate: the amount as it is.
  const convert = (value: number, from: string, to: string) =>
    ctx.convert(value, from, to) ?? value;
  const pick = <K extends keyof TxFields>(key: K, fallback: TxFields[K]): TxFields[K] =>
    key in fields ? fields[key] : fallback;
  const amount = pick('amount', current?.amount);
  if (amount === undefined) return refuse('invalid');
  if (type !== 'balance_adjustment' && amount < 0) return refuse('invalid');
  const note = (pick('note', current?.note ?? '') ?? '').trim();
  const details = (pick('details', current?.details ?? '') ?? '').trim();
  // An update sends the picked day and keeps the row's own time on it.
  const date = fields.date
    ? current
      ? fields.date
      : createdAt(fields.date, ctx.now)
    : (current?.date ?? ctx.now.toISOString());
  const common = { date, note: note || null, details: details || null };

  if (type === 'balance_adjustment') {
    const account = findAccount(ctx, current?.accountId);
    if (!account) return refuse('invalid');
    return ok({
      ...common,
      type: legacyAdjustment ? 'transfer' : type,
      amount,
      currency: account.currency,
      accountId: account.id,
      categoryId: null,
      fromAccountId: null,
      toAccountId: null,
      sentiment: 'neutral',
      reimbursable: false,
    });
  }

  if (type === 'transfer') {
    const from = findAccount(ctx, pick('fromAccountId', current?.fromAccountId ?? null));
    const to = findAccount(ctx, pick('toAccountId', current?.toAccountId ?? null));
    if (!from || !to || from.id === to.id) return refuse('invalid');
    const counts = pick('countsAsExpense', current?.countsAsExpense ?? false) ?? false;
    const categoryId = counts ? (pick('categoryId', current?.categoryId ?? null) ?? null) : null;
    // A category the row already has may since have been deleted; it stays, as in the app.
    const keptCategory = !!current && categoryId === current.categoryId;
    if (categoryId && !keptCategory && findCategory(ctx, categoryId)?.type !== 'expense') {
      return refuse('invalid');
    }
    let toAmount: number | null = null;
    if (from.currency !== to.currency) {
      const kept = current?.type === 'transfer' && !('amount' in fields) ? current.toAmount : null;
      // Zero received means "convert", as the app's editor reads an empty field.
      const given = pick('toAmount', kept ?? null);
      toAmount = given && given > 0 ? given : convert(amount, from.currency, to.currency);
    }
    return ok({
      ...common,
      type,
      amount,
      currency: from.currency,
      toAmount,
      fromAccountId: from.id,
      toAccountId: to.id,
      accountId: null,
      categoryId,
      countsAsExpense: counts,
      sentiment: 'neutral',
      reimbursable: false,
    });
  }

  // Expense or income: an account and a category, as the editor requires.
  const account = findAccount(ctx, pick('accountId', current?.accountId ?? null));
  const categoryId = pick('categoryId', current?.categoryId ?? null) ?? null;
  // The row's own category stays even if it has since been deleted or is of
  // the other type, as the app's editor saves such a row unchanged.
  const keptCategory =
    !!current && !!categoryId && categoryId === current.categoryId && current.type === type;
  const category = findCategory(ctx, categoryId);
  if (!account || !categoryId || (!keptCategory && (!category || category.type !== type))) {
    return refuse('invalid');
  }
  // An entry keeps its own currency unless one is chosen: the editor sends the
  // one it shows, and a bulk account change never re-labels an amount.
  const currency = fields.currency ?? (current ? current.currency : account.currency);
  if (currency !== current?.currency && !ctx.currencies.includes(currency)) {
    return refuse('invalid');
  }
  // The value in the account's currency, re-frozen only when the money moves.
  const moves = !current || 'amount' in fields || 'currency' in fields || 'accountId' in fields;
  const accountAmount = !moves
    ? (current?.accountAmount ?? null)
    : currency !== account.currency
      ? convert(amount, currency, account.currency)
      : null;
  const reimbursable =
    type === 'expense' ? (pick('reimbursable', current?.reimbursable ?? false) ?? false) : false;
  // A paid-back expense stays reimbursable: the app makes the tick read only.
  if (current?.reimbursedAt && current.reimbursable && !reimbursable && type === 'expense') {
    return refuse('invalid');
  }
  // Pending reimbursement is Pro; clearing it never is.
  if (reimbursable && !current?.reimbursable && !ctx.isPro) {
    return refuse('pro_required', 'reimbursements');
  }
  const sentiment =
    type === 'expense'
      ? (pick('sentiment', current?.sentiment ?? 'neutral') ?? 'neutral')
      : 'neutral';
  return ok({
    ...common,
    // An empty note on a new entry becomes the category's name, as the editor saves it.
    note: note || (current ? null : categoryLabel(ctx, categoryId)),
    type,
    amount,
    currency,
    accountAmount,
    accountId: account.id,
    categoryId,
    fromAccountId: null,
    toAccountId: null,
    countsAsExpense: false,
    sentiment,
    reimbursable,
  });
}

const BULK_KEYS: (keyof TxFields)[] = ['date', 'note', 'categoryId', 'accountId'];

function planTransaction(
  ctx: Ctx,
  op: Extract<EditOp, { entity: 'transaction' }>,
  steps: EditStep[],
): Result<number> {
  if (op.op === 'create') {
    // A free plan over its account limit can no longer add entries, as in the app.
    if (!ctx.isPro && countAccountsTowardFreeLimit(ctx.accounts) > PRO_LIMITS.FREE_MAX_ACCOUNTS) {
      return refuse('pro_required', 'accounts');
    }
    const payload = transactionPayload(ctx, op.tx, null);
    if (!payload.ok) return payload;
    steps.push({ kind: 'tx.create', input: payload.value });
    return ok(1);
  }
  const byId = new Map(ctx.transactions.map((tx) => [tx.id, tx]));
  const rows: TransactionWithRelations[] = [];
  for (const row of op.rows) {
    if (!claim(ctx, `tx:${row.id}`)) return refuse('invalid');
    const current = byId.get(row.id);
    // Gone on the phone, or changed there since the browser's copy.
    if (!current || current.deletedAt || current.updatedAt !== row.at) return refuse('conflict');
    rows.push(current);
  }
  if (op.op === 'delete') {
    steps.push({ kind: 'tx.delete', ids: rows.map((tx) => tx.id) });
    return ok(rows.length);
  }
  const { set } = op;
  const bulk = rows.length > 1;
  // Many rows change only as a bulk edit changes them: the app's bulk sheet
  // (day, note, category) and the web's bulk toolbar (those, and the account).
  if (bulk && Object.keys(set).some((key) => !BULK_KEYS.includes(key as keyof TxFields))) {
    return refuse('invalid');
  }
  const updates: { id: string; input: Record<string, unknown> }[] = [];
  for (const current of rows) {
    const flow = current.type === 'expense' || current.type === 'income';
    if (bulk && !flow && 'accountId' in set) return refuse('invalid');
    if (bulk && !flow && 'categoryId' in set && !current.countsAsExpense) return refuse('invalid');
    // A bulk move keeps each amount as it is, so only into an account of the row's currency.
    if (bulk && set.accountId && findAccount(ctx, set.accountId)?.currency !== current.currency) {
      return refuse('invalid');
    }
    // The app keeps these amounts in step with something else: shared splits,
    // or the expense a refund pays back.
    const moves = 'amount' in set || 'currency' in set || 'type' in set || 'accountId' in set;
    // (A paid-back expense may change: the app moves its refund with it.)
    if (moves && ((current.splits?.length ?? 0) > 0 || current.reimbursementOfId)) {
      return refuse('amount_locked');
    }
    const payload = transactionPayload(ctx, set, current);
    if (!payload.ok) return payload;
    const input = changedFields(payload.value, current);
    if (Object.keys(input).length) updates.push({ id: current.id, input });
  }
  if (updates.length) steps.push({ kind: 'tx.update', updates });
  return ok(rows.length);
}

function groupExists(ctx: Ctx, group: string | null | undefined): boolean {
  return (
    !group ||
    ctx.newGroups.includes(group) ||
    ctx.accountGroups.some((item) => !item.deletedAt && item.name === group)
  );
}

/**
 * What a group rename or delete does to the rest of the batch's view, as
 * `accountGroupsRepository` does it: the group gets its new name or goes, and
 * every account in it follows (renamed into it, or ungrouped), with a new
 * `updated_at`.
 */
function changeGroup(ctx: Ctx, id: string, name: string | null) {
  const group = ctx.accountGroups.find((item) => item.id === id);
  if (!group) return;
  const old = group.name;
  ctx.accountGroups = ctx.accountGroups.map((item) =>
    item.id !== id
      ? item
      : name === null
        ? { ...item, deletedAt: CHANGED_IN_BATCH, updatedAt: CHANGED_IN_BATCH }
        : { ...item, name, updatedAt: CHANGED_IN_BATCH },
  );
  ctx.liveAccounts = ctx.liveAccounts.map((account) =>
    account.accountGroup === old
      ? { ...account, accountGroup: name, updatedAt: CHANGED_IN_BATCH }
      : account,
  );
}

function planAccount(
  ctx: Ctx,
  op: Extract<EditOp, { entity: 'account' }>,
  steps: EditStep[],
): Result<number> {
  if (op.op === 'create') {
    const fields = op.account;
    const name = fields.name?.trim();
    if (!name) return refuse('invalid');
    if (
      !ctx.isPro &&
      countAccountsTowardFreeLimit(ctx.accounts) + ctx.created.accounts >=
        PRO_LIMITS.FREE_MAX_ACCOUNTS
    ) {
      return refuse('pro_required', 'accounts');
    }
    const type = fields.type ?? 'debit';
    if (!keepsUpload(fields.logoId, null)) return refuse('invalid');
    if (fields.cardDesign != null && !getCardDesignTemplate(fields.cardDesign)) {
      return refuse('invalid');
    }
    const currency = fields.currency ?? ctx.reportingCurrency;
    if (!ctx.currencies.includes(currency) || !groupExists(ctx, fields.group)) {
      return refuse('invalid');
    }
    ctx.created.accounts++;
    steps.push({
      kind: 'account.create',
      input: {
        name,
        type,
        accountGroup: fields.group ?? null,
        logoId: fields.logoId ?? null,
        cardDesign: fields.cardDesign ?? null,
        currency,
        startingBalance: fields.balance ?? 0,
        includeInTotals: fields.includeInTotals ?? true,
        creditStatementDay: type === 'credit' ? (fields.creditStatementDay ?? 25) : null,
        creditDueDay: type === 'credit' ? (fields.creditDueDay ?? 1) : null,
      },
    });
    return ok(1);
  }
  if (!claim(ctx, `account:${op.id}`)) return refuse('invalid');
  const current = findAccount(ctx, op.id);
  if (!current || current.updatedAt !== op.at) return refuse('conflict');
  if (op.op === 'delete') {
    steps.push({ kind: 'account.delete', id: current.id });
    forget(ctx, 'account', current.id);
    return ok(1);
  }
  const { set } = op;
  // A type never changes once made, as in the app's editor.
  if (set.type && set.type !== current.type) return refuse('invalid');
  // A loan's or a goal's money is edited in its own editor in the app.
  const special = current.type === 'loan' || current.type === 'goal';
  const money = 'balance' in set || 'currency' in set;
  if (special && money) return refuse('invalid');
  const credit = 'creditStatementDay' in set || 'creditDueDay' in set;
  if (credit && current.type !== 'credit') return refuse('invalid');
  const input: Record<string, unknown> = {};
  if (set.name !== undefined) {
    if (!set.name.trim()) return refuse('invalid');
    input.name = set.name.trim();
  }
  if ('group' in set) {
    if (!groupExists(ctx, set.group)) return refuse('invalid');
    input.accountGroup = set.group ?? null;
  }
  if ('logoId' in set) {
    if (!keepsUpload(set.logoId, current.logoId)) return refuse('invalid');
    input.logoId = set.logoId ?? null;
  }
  if ('cardDesign' in set) {
    const design = set.cardDesign ?? null;
    // A built-in design, the plain card, or the account's own upload kept as it is.
    if (design !== null && design !== current.cardDesign && !getCardDesignTemplate(design)) {
      return refuse('invalid');
    }
    input.cardDesign = design;
  }
  if (set.includeInTotals !== undefined) input.includeInTotals = set.includeInTotals;
  if ('creditStatementDay' in set) input.creditStatementDay = set.creditStatementDay ?? null;
  if ('creditDueDay' in set) input.creditDueDay = set.creditDueDay ?? null;
  const step: Extract<EditStep, { kind: 'account.update' }> = {
    kind: 'account.update',
    id: current.id,
    input,
  };
  if (set.currency && set.currency !== current.currency) {
    // The change converts the balance at the latest rate; a balance is not set with it.
    if (!ctx.currencies.includes(set.currency) || 'balance' in set) return refuse('invalid');
    step.currency = set.currency;
  }
  if (set.balance !== undefined) {
    const now = ctx.balances.get(current.id) ?? current.startingBalance;
    const delta = set.balance - now;
    if (Math.abs(delta) > 0.000001) {
      // The app asks how a changed balance is recorded; so must the web.
      if (!set.balanceRecord) return refuse('invalid');
      step.adjustment =
        set.balanceRecord === 'difference'
          ? { type: 'balance_adjustment', amount: delta, currency: current.currency }
          : {
              type: flowTypeForBalanceDelta(current.type, delta),
              amount: Math.abs(delta),
              currency: current.currency,
            };
    }
  }
  if (Object.keys(input).length || step.currency || step.adjustment) steps.push(step);
  return ok(1);
}

function planGroup(
  ctx: Ctx,
  op: Extract<EditOp, { entity: 'group' }>,
  steps: EditStep[],
): Result<number> {
  const live = ctx.accountGroups.filter((group) => !group.deletedAt);
  // Gone, or changed on the phone since the browser's copy (when it says which copy).
  const stale = (id: string, at: string | null | undefined) => {
    const group = live.find((item) => item.id === id);
    return !group || (at !== undefined && group.updatedAt !== at);
  };
  if (op.op === 'delete') {
    if (!claim(ctx, `group:${op.id}`)) return refuse('invalid');
    if (stale(op.id, op.at)) return refuse('conflict');
    steps.push({ kind: 'group.delete', id: op.id });
    changeGroup(ctx, op.id, null);
    return ok(1);
  }
  const name = op.name.trim();
  // The database treats group names without case, so "cards" is "Cards".
  const lower = name.toLocaleLowerCase();
  const taken =
    ctx.newGroups.some((item) => item.toLocaleLowerCase() === lower) ||
    live.some(
      (group) =>
        group.name.toLocaleLowerCase() === lower && (op.op === 'create' || group.id !== op.id),
    );
  if (!name || taken) return refuse('invalid');
  if (op.op === 'create') {
    steps.push({ kind: 'group.create', name });
    ctx.newGroups.push(name);
    return ok(1);
  }
  if (!claim(ctx, `group:${op.id}`)) return refuse('invalid');
  if (stale(op.id, op.at)) return refuse('conflict');
  steps.push({ kind: 'group.rename', id: op.id, name });
  changeGroup(ctx, op.id, name);
  return ok(1);
}

function planCategory(
  ctx: Ctx,
  op: Extract<EditOp, { entity: 'category' }>,
  steps: EditStep[],
): Result<number> {
  if (op.op === 'create') {
    const fields = op.category;
    const name = fields.name?.trim();
    if (!name || !fields.type) return refuse('invalid');
    if (
      !ctx.isPro &&
      ctx.liveCategories.length + ctx.created.categories >= PRO_LIMITS.FREE_MAX_CATEGORIES
    ) {
      return refuse('pro_required', 'categories');
    }
    const parent = findCategory(ctx, fields.parentId);
    if (fields.parentId && (!parent || parent.parentId || parent.type !== fields.type)) {
      return refuse('invalid');
    }
    let icon = fields.icon ?? '';
    if (!validIcon(icon, ctx.isCategoryIcon)) return refuse('invalid');
    // A new top-level category gets an icon, as the app's editor gives one.
    if (!icon && !parent) icon = ctx.suggestIcon(name) ?? 'meal';
    ctx.created.categories++;
    steps.push({
      kind: 'category.create',
      input: { name, icon, parentId: parent?.id ?? null, type: fields.type, isDefault: false },
    });
    return ok(1);
  }
  if (!claim(ctx, `category:${op.id}`)) return refuse('invalid');
  const current = findCategory(ctx, op.id);
  if (!current || current.updatedAt !== op.at) return refuse('conflict');
  if (op.op === 'delete') {
    let reassignTo: string | undefined;
    if (op.reassignTo) {
      const target = findCategory(ctx, op.reassignTo);
      if (!target || target.id === current.id || target.type !== current.type) {
        return refuse('invalid');
      }
      reassignTo = target.id;
    }
    steps.push({ kind: 'category.delete', id: current.id, reassignTo });
    forget(ctx, 'category', current.id);
    return ok(1);
  }
  const { set } = op;
  if (set.type && set.type !== current.type) return refuse('invalid');
  const input: Record<string, unknown> = {};
  if (set.name !== undefined) {
    if (!set.name.trim()) return refuse('invalid');
    input.name = set.name.trim();
  }
  if (set.icon !== undefined && set.icon !== current.icon) {
    if (!validIcon(set.icon, ctx.isCategoryIcon)) return refuse('invalid');
    input.icon = set.icon;
  }
  if ('parentId' in set && (set.parentId ?? null) !== current.parentId) {
    if (set.parentId) {
      const parent = findCategory(ctx, set.parentId);
      const hasChildren = ctx.liveCategories.some((item) => item.parentId === current.id);
      // Two levels at most, one type, never under itself.
      if (
        !parent ||
        parent.id === current.id ||
        parent.parentId ||
        parent.type !== current.type ||
        hasChildren
      ) {
        return refuse('invalid');
      }
    }
    input.parentId = set.parentId ?? null;
  }
  if (Object.keys(input).length) steps.push({ kind: 'category.update', id: current.id, input });
  return ok(1);
}

function rulePayload(
  ctx: Ctx,
  fields: RuleFields,
  current: RecurringTransactionRule | null,
): Result<Record<string, unknown>> {
  const pick = <K extends keyof RuleFields>(key: K, fallback: RuleFields[K]): RuleFields[K] =>
    key in fields ? fields[key] : fallback;
  const type = pick('type', current?.type) ?? 'expense';
  const name = (pick('name', current?.name) ?? '').trim();
  const amount = pick('amount', current?.amount);
  if (!name || amount === undefined) return refuse('invalid');
  const nextRunDate = fields.nextRunDate ? dayStart(fields.nextRunDate) : current?.nextRunDate;
  if (!nextRunDate) return refuse('invalid');
  const endDate =
    'endDate' in fields
      ? fields.endDate
        ? dayEnd(fields.endDate)
        : null
      : (current?.endDate ?? null);
  // Checked only when the dates change: a rule that ran past its end keeps a
  // next run after it, and the app still lets it be renamed or resumed.
  const datesChange = 'nextRunDate' in fields || 'endDate' in fields;
  if (datesChange && endDate && endDate < nextRunDate) return refuse('invalid');
  const logoId = pick('logoId', current?.logoId ?? null) ?? null;
  if (!keepsUpload(logoId, current?.logoId)) return refuse('invalid');
  const note = (pick('note', current?.note ?? '') ?? '').trim();
  const base = {
    name,
    type,
    amount,
    note: note || null,
    logoId,
    recurrencePattern: pick('pattern', current?.recurrencePattern) ?? 'monthly',
    recurrenceInterval: pick('interval', current?.recurrenceInterval) ?? 1,
    nextRunDate,
    endDate,
    isActive: pick('isActive', current?.isActive ?? true) ?? true,
  };
  if (type === 'transfer') {
    const from = findAccount(ctx, pick('fromAccountId', current?.fromAccountId ?? null));
    const to = findAccount(ctx, pick('toAccountId', current?.toAccountId ?? null));
    if (!from || !to || from.id === to.id) return refuse('invalid');
    // A repayment into a loan reports the way the loan says, as in the app.
    const counted = to.type === 'loan' && !!to.loanCountAsExpense;
    return ok({
      ...base,
      currency: from.currency,
      fromAccountId: from.id,
      toAccountId: to.id,
      accountId: null,
      categoryId: counted ? (to.loanPaymentCategoryId ?? null) : null,
      countsAsExpense: counted,
    });
  }
  const account = findAccount(ctx, pick('accountId', current?.accountId ?? null));
  const category = findCategory(ctx, pick('categoryId', current?.categoryId ?? null));
  if (!account || !category || category.type !== type) return refuse('invalid');
  // A rule keeps its own currency (a foreign subscription is not redenominated)
  // unless one is chosen; a new rule starts in its account's, as the editor does.
  const currency =
    fields.currency ??
    (current && current.type !== 'transfer' ? current.currency : account.currency);
  if (currency !== current?.currency && !ctx.currencies.includes(currency))
    return refuse('invalid');
  return ok({
    ...base,
    // An empty note becomes the category's name, as the app's editor saves it.
    note: note || categoryLabel(ctx, category.id),
    currency,
    accountId: account.id,
    categoryId: category.id,
    fromAccountId: null,
    toAccountId: null,
    countsAsExpense: false,
  });
}

function planRule(
  ctx: Ctx,
  op: Extract<EditOp, { entity: 'recurring' }>,
  steps: EditStep[],
): Result<number> {
  if (op.op === 'create') {
    const live = ctx.recurringRules.filter((rule) => !rule.deletedAt).length;
    if (!ctx.isPro && live + ctx.created.rules >= PRO_LIMITS.FREE_MAX_RECURRING_RULES) {
      return refuse('pro_required', 'recurring');
    }
    const payload = rulePayload(ctx, op.rule, null);
    if (!payload.ok) return payload;
    ctx.created.rules++;
    steps.push({ kind: 'recurring.create', input: payload.value });
    return ok(1);
  }
  if (!claim(ctx, `rule:${op.id}`)) return refuse('invalid');
  const current = ctx.recurringRules.find((rule) => rule.id === op.id && !rule.deletedAt);
  if (!current || current.updatedAt !== op.at) return refuse('conflict');
  if (op.op === 'delete') {
    steps.push({ kind: 'recurring.delete', id: current.id });
    return ok(1);
  }
  const payload = rulePayload(ctx, op.set, current);
  if (!payload.ok) return payload;
  steps.push({ kind: 'recurring.update', id: current.id, input: payload.value });
  return ok(1);
}

/**
 * Checks a request against the phone's data and turns it into what to save,
 * or says why not. Nothing is saved when any part of it is refused.
 */
export function planEdit(
  request: EditRequest,
  lookup: EditLookup,
): { ok: true; plan: EditPlan } | Refuse {
  const moduleOf = (entity: string) => EDIT_MODULES.find((item) => item.entity === entity);
  const rowCount = request.ops.reduce((sum, op) => {
    if (op.entity === 'transaction') return sum + (op.op !== 'create' ? op.rows.length : 1);
    return sum + (moduleOf(op.entity)?.size?.(op as ModuleOp) ?? 1);
  }, 0);
  if (rowCount > MAX_EDIT_ROWS) return refuse('invalid');
  const ctx: Ctx = {
    ...lookup,
    liveAccounts: lookup.accounts.filter((item) => !item.deletedAt),
    liveCategories: lookup.categories.filter((item) => !item.deletedAt),
    created: { accounts: 0, categories: 0, rules: 0 },
    named: new Set(),
    newGroups: [],
  };
  const steps: EditStep[] = [];
  const kinds = new Set<string>();
  let count = 0;
  const tools = (entity: string): PlanTools => ({
    lookup: ctx,
    extra: lookup.extras[entity],
    liveAccounts: ctx.liveAccounts,
    liveCategories: ctx.liveCategories,
    findAccount: (id) => findAccount(ctx, id),
    findCategory: (id) => findCategory(ctx, id),
    groupExists: (name) => groupExists(ctx, name),
    claim: (key) => claim(ctx, key),
    forget: (kind, id) => forget(ctx, kind, id),
    created: ctx.created,
    refuse,
    ok,
    transactionPayload: (fields, current) => transactionPayload(ctx, fields, current),
  });
  for (const op of request.ops) {
    const module = moduleOf(op.entity);
    const result = module
      ? module.plan(tools(op.entity), op as ModuleOp, steps)
      : op.entity === 'transaction'
        ? planTransaction(ctx, op, steps)
        : op.entity === 'account'
          ? planAccount(ctx, op, steps)
          : op.entity === 'group'
            ? planGroup(ctx, op, steps)
            : op.entity === 'category'
              ? planCategory(ctx, op, steps)
              : op.entity === 'recurring'
                ? planRule(ctx, op, steps)
                : refuse('invalid');
    if (!result.ok) return result;
    count += result.value;
    kinds.add(`${op.entity.replace(/^module:/, '')}_${op.op}`);
  }
  return { ok: true, plan: { steps, count, kinds: [...kinds] } };
}

/** What a batch did, for analytics: `transaction_update`, or `mixed`. */
export function planKind(plan: EditPlan): string {
  return plan.kinds.length === 1 ? plan.kinds[0] : 'mixed';
}

/**
 * The checks every Web Dashboard edit planner shares: the core planner
 * (`webDashboardEdits.ts`) and each module here. Values live in this file, not
 * in the planner, so a module never imports a value from the file that
 * imports it (only types cross that way).
 */

import type { TransactionSentiment, TransactionWithRelations } from '~/types';

import type { TxFields } from '../webDashboardEdits';

/** Rows one batch may touch: an edit message must fit the relay's 64 KB text frame. */
export const MAX_EDIT_ROWS = 500;
export const MAX_AMOUNT = 1e12;
const MAX_NOTE = 500;
const MAX_DETAILS = 2000;
const SENTIMENTS: TransactionSentiment[] = ['happy', 'neutral', 'sad'];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;
/** A row's `updated_at` as the browser's copy has it. */
export const isAt = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
export const isCurrency = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value);
export const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT;
export const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

/** A real calendar day, `YYYY-MM-DD`. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1970 &&
    y <= 2200 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** `YYYY-MM`, as the app's month pickers build one. */
export function isMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1970 && year <= 2200;
}

/** A catalog logo, or an uploaded one (which a plan only lets a row keep), or none. */
export const isLogo = (value: unknown) =>
  value === null ||
  (typeof value === 'string' &&
    (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(value) || /^custom:[\w./-]{1,200}$/.test(value)));

/** The day a date falls on, on this phone. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day a stored date falls on, on this phone. */
export function storedDay(stored: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const date = new Date(stored);
  return Number.isNaN(date.getTime()) ? stored.slice(0, 10) : localDay(date);
}

/**
 * No icon, an emoji, or a bundled icon of the default pack, as the web offers
 * them (the other packs are Pro and app-only).
 */
export function validIcon(icon: string, isCategoryIcon: (id: string) => boolean): boolean {
  if (icon === '') return true;
  if (icon.startsWith('emoji:')) {
    const glyph = icon.slice('emoji:'.length);
    return glyph.length > 0 && glyph.length <= 16 && !/[\x00-\x7f]/.test(glyph);
  }
  return !icon.includes('/') && isCategoryIcon(icon);
}

export type Checks = Record<string, (value: unknown) => boolean>;

/** The transaction editor's fields, each of the shape it sends. */
export const TX_KEYS: Checks = {
  type: (v) => v === 'expense' || v === 'income' || v === 'transfer' || v === 'balance_adjustment',
  amount: isMoney,
  currency: isCurrency,
  toAmount: (v) => v === null || (isMoney(v) && v >= 0),
  date: isDayKey,
  accountId: (v) => v === null || isId(v),
  fromAccountId: (v) => v === null || isId(v),
  toAccountId: (v) => v === null || isId(v),
  categoryId: (v) => v === null || isId(v),
  note: (v) => isText(v, MAX_NOTE),
  details: (v) => isText(v, MAX_DETAILS),
  sentiment: (v) => SENTIMENTS.includes(v as TransactionSentiment),
  reimbursable: (v) => typeof v === 'boolean',
  countsAsExpense: (v) => typeof v === 'boolean',
};

/** Only known keys, each of the right shape; null if anything is off. */
export function readFields<T>(value: unknown, checks: Checks): T | null {
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    // Own keys only: `constructor` or `toString` must not pass as a field.
    const check = Object.prototype.hasOwnProperty.call(checks, key) ? checks[key] : undefined;
    if (!check || !check(item)) return null;
  }
  return value as T;
}

export const readTx = (value: unknown) => readFields<TxFields>(value, TX_KEYS);

/**
 * Only what changes, so an update does not re-freeze a snapshot or rewrite a
 * time it did not touch.
 */
export function changedFields(
  next: Record<string, unknown>,
  current: TransactionWithRelations,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const before = current as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    const same =
      key === 'date'
        ? storedDay(current.date) === storedDay(String(value))
        : (value ?? null) === (before[key] ?? null);
    if (!same) out[key] = value;
  }
  // A new account or currency carries the value in the account's currency with it.
  if ('accountId' in out || 'currency' in out || 'amount' in out) {
    out.accountAmount = next.accountAmount ?? null;
  }
  return out;
}

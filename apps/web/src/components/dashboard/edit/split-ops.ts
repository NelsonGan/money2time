/**
 * Split Bill and Settle Up changes, as the phone's `module:split` reads them
 * (the app's services/webDashboardEditModules/split.ts), and the split rows as
 * the backup stores them. Nothing here changes data by itself.
 */

import type { Model } from "@/lib/backup/model";
import { billPayer } from "../../../lib/backup/split-payer.ts";
import type { TransactionSplitRow } from "@/lib/backup/types";
import type { TxFields } from "@/lib/cloud/edits";

/** One Split Bill row as the phone takes it. `id` and `paid` only on an update. */
type SplitRowOp = {
  id?: string;
  name: string;
  amount: number;
  isSelf: boolean;
  paybackAccountId: string | null;
  paid?: boolean;
};

export type SplitOp =
  | { entity: "module:split"; op: "create"; tx: TxFields; splits: SplitRowOp[] }
  | { entity: "module:split"; op: "update"; id: string; at: string | null; set: TxFields; splits: SplitRowOp[] }
  | { entity: "module:split"; op: "settle"; id: string; txId: string; at: string | null; paybackAccountId?: string }
  | { entity: "module:split"; op: "unsettle" | "remove"; id: string; txId: string; at: string | null }
  | { entity: "module:split"; op: "payback"; id: string; txId: string; at: string | null; paybackAccountId: string }
  | { entity: "module:split"; op: "default_payback"; accountId: string };

/** A split row with the columns the backup carries beyond the shared type. */
export type SplitRecord = TransactionSplitRow & {
  payback_account_id?: string | null;
  paid_transaction_id?: string | null;
  sort_order?: number | null;
};

/** Settle Up's "Default paid to": the setting, else the first account, as the app shows it. */
export function defaultPaybackId(model: Model): string | null {
  const picked = (model.raw.settings?.[0] as { default_payback_account_id?: string | null } | undefined)?.default_payback_account_id;
  return (picked && model.accountById.has(picked) ? picked : null) ?? model.accounts[0]?.id ?? null;
}

/** The most rows (Me and the friends) one bill has, as the phone's split module takes them (its MAX_ROWS). */
export const MAX_SPLIT_ROWS = 50;

/** A transaction's live split rows, in the Split Bill page's order. */
export function splitsOf(model: Model, txId: string): SplitRecord[] {
  return (model.raw.transaction_splits ?? [])
    .filter((row) => row.transaction_id === txId && !row.deleted_at)
    .map((row) => row as SplitRecord)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Expenses with a friend's share still owed, or that a friend paid and the
 * user has not paid back: what the free plan counts (the app's
 * `countUnpaidSplitBills`). A shared album's bills are not counted: sharing an
 * album has no free limit, and its bills are other people's to add.
 */
export function unpaidSplitBills(model: Pick<Model, "txById" | "raw" | "splitOwed">): number {
  const counts = (txId: string) => {
    const tx = model.txById.get(txId);
    return !!tx && !tx.albumGroupId;
  };
  const bills = new Set<string>();
  for (const row of model.raw.transaction_splits ?? []) {
    if (row.deleted_at || row.is_self || row.paid_at || !(row.amount > 0) || !counts(row.transaction_id)) continue;
    bills.add(row.transaction_id);
  }
  for (const debt of model.splitOwed) if (counts(debt.txId)) bills.add(debt.txId);
  return bills.size;
}

/**
 * The friend who paid a saved bill, or null when the user did. Such a bill is
 * changed in the app: its rows mean something else there (see
 * lib/backup/split-payer.ts), and the phone refuses a split edit of one.
 */
export function payerOf(model: Model, txId: string): SplitRecord | null {
  return billPayer(splitsOf(model, txId));
}

// -------------------------------------------- the Split Bill page's arithmetic --

/**
 * The share a split row belongs to: the id of its first row. Paying part of a
 * share in the app writes the payment as its own paid row pointing back with
 * `part_of_split_id`, and leaves the rest owed on the first row.
 */
export const splitShareKey = (row: { id: string; part_of_split_id?: string | null }) => row.part_of_split_id ?? row.id;

/** A row as the Split Bill sheet holds it; the amount is text while it is typed. */
export type SplitDraftRow = {
  key: string;
  id?: string;
  /** The share a saved friend's row belongs to (`splitShareKey`); absent on Me and new rows. */
  shareKey?: string;
  name: string;
  amount: string;
  isSelf: boolean;
  paybackAccountId: string | null;
  paid: boolean;
  paidAt: string | null;
};

/**
 * A row's amount as the sheet keeps it: always with a decimal point, whatever
 * this browser's mark (the sheet turns a typed comma into one), so it reads
 * the same everywhere; 0 when it is not a number yet.
 */
export const num = (text: string) => {
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
};

/** `total` in cents across `count` shares, the first ones taking the leftover cents. */
export function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

/**
 * What each row owes so every share comes out the same, `paidBack[i]` being
 * what row i's share has already paid (the app's `evenOwedAmounts`): `owed`
 * plus everything paid back is shared evenly, and each row owes its portion
 * less what it paid. A row that paid its whole portion or more owes nothing
 * and leaves the rest to the others, so the result always adds up to `owed`.
 */
export function evenOwedAmounts(owed: number, paidBack: readonly number[]): number[] {
  const owedCents = Math.max(0, Math.round(owed * 100));
  const paidCents = paidBack.map((value) => Math.max(0, Math.round(value * 100)));
  const result = paidCents.map(() => 0);
  let active = paidCents.map((_, index) => index);
  for (;;) {
    if (active.length === 0) return result.map((cents) => cents / 100);
    const pool = owedCents + active.reduce((sum, index) => sum + paidCents[index], 0);
    const base = Math.floor(pool / active.length);
    const remainder = pool - base * active.length;
    const portion = (slot: number) => base + (slot < remainder ? 1 : 0);
    const covered = active.filter((index, slot) => paidCents[index] >= portion(slot));
    if (covered.length === 0) {
      active.forEach((index, slot) => {
        result[index] = portion(slot) - paidCents[index];
      });
      return result.map((cents) => cents / 100);
    }
    active = active.filter((index) => !covered.includes(index));
  }
}

/**
 * Spread `owed` evenly over the unpaid rows `include` picks, one portion per
 * share (the app's `spreadOverShares`): a friend who paid part of their share
 * owes their portion less what they paid, and a share owing on two rows gets
 * its portion on the first and nothing on the other (the phone folds them).
 * Rows from a phone that predates part payments are each their own share.
 */
export function spreadOverShares(rows: SplitDraftRow[], owed: number, include: (row: SplitDraftRow, index: number) => boolean): SplitDraftRow[] {
  const shareOf = (row: SplitDraftRow, index: number) => row.shareKey ?? `row:${index}`;
  const paidByShare = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!row.paid) return;
    const key = shareOf(row, index);
    paidByShare.set(key, (paidByShare.get(key) ?? 0) + num(row.amount));
  });
  const slots: number[] = [];
  const extra: number[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (row.paid || !include(row, index)) return;
    const key = shareOf(row, index);
    if (seen.has(key)) extra.push(index);
    else {
      seen.add(key);
      slots.push(index);
    }
  });
  if (!slots.length) return rows;
  const portions = evenOwedAmounts(
    owed,
    slots.map((index) => paidByShare.get(shareOf(rows[index], index)) ?? 0),
  );
  return rows.map((row, index) => {
    const slot = slots.indexOf(index);
    if (slot >= 0) return { ...row, amount: (portions[slot] ?? 0).toFixed(2) };
    return extra.includes(index) ? { ...row, amount: (0).toFixed(2) } : row;
  });
}

/** Split evenly: the total across every unpaid row, one portion per share; paid rows are settled. */
export function evenAcrossUnpaid(rows: SplitDraftRow[], total: number): SplitDraftRow[] {
  return spreadOverShares(rows, total, () => true);
}

/** A friend's amount changed: Me takes what is left, never below zero. */
export function balanceSelf(rows: SplitDraftRow[], total: number, changed?: number): SplitDraftRow[] {
  const self = rows.findIndex((row) => row.isSelf);
  if (self < 0 || changed === self) return rows;
  const others = rows.reduce((sum, row, i) => (i === self || row.paid ? sum : sum + num(row.amount)), 0);
  const mine = Math.max(0, Math.round((total - others) * 100) / 100);
  return rows.map((row, i) => (i === self ? { ...row, amount: mine.toFixed(2) } : row));
}

/** Me's amount changed: the rest spreads evenly across the unpaid friends. */
export function balanceFriends(rows: SplitDraftRow[], total: number): SplitDraftRow[] {
  const self = rows.findIndex((row) => row.isSelf);
  if (self < 0) return rows;
  const remaining = Math.max(0, Math.round((total - Math.max(0, num(rows[self].amount))) * 100) / 100);
  return spreadOverShares(rows, remaining, (_row, i) => i !== self);
}

/** The sum bar's unpaid total, to the cent. */
export function unpaidSum(rows: SplitDraftRow[]): number {
  return Math.round(rows.reduce((sum, row) => (row.paid ? sum : sum + num(row.amount)), 0) * 100) / 100;
}

export const hasFriend = (rows: SplitDraftRow[]) => rows.some((row) => !row.isSelf);

/** The rows as the phone takes them. */
export function rowsForOp(rows: SplitDraftRow[], update: boolean): SplitRowOp[] {
  return rows.map((row) => {
    const out: SplitRowOp = { name: row.name.trim(), amount: Math.round(num(row.amount) * 100) / 100, isSelf: row.isSelf, paybackAccountId: row.paybackAccountId };
    if (update && row.id) {
      out.id = row.id;
      out.paid = row.paid;
    }
    return out;
  });
}

/** The rows a saved bill opens with. */
export function draftRows(records: SplitRecord[]): SplitDraftRow[] {
  return records.map((row) => ({
    key: row.id,
    id: row.id,
    shareKey: row.is_self ? undefined : splitShareKey(row),
    name: row.person_name ?? "",
    amount: row.amount.toFixed(2),
    isSelf: !!row.is_self,
    paybackAccountId: row.payback_account_id ?? null,
    paid: !!row.paid_at,
    paidAt: row.paid_at ?? null,
  }));
}

let counter = 0;
/** A key for a row the sheet adds; the phone gives it its id. */
export const newRowKey = () => `new-${Date.now().toString(36)}-${(counter += 1)}`;

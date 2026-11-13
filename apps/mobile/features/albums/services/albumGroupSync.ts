// A shared album's group in the user's own ledger. The group holds whole
// bills and the payments between its members; this keeps the user's own side
// of each bill in step with it, as ordinary split bills (`localBill` in
// ../lib/albumGroup.ts says what that is). It is the only writer of those
// entries: adding or changing a bill, marking a share paid and undoing it all
// write the group's rows first, and the entries follow from there, on this
// phone and on everyone else's. So applying the same group twice changes
// nothing, and two phones of one person write the same rows.
// See README.md > Album members and shared albums.

import { sharedAlbumFor } from '~/features/cloudSync/services/sharedLedgerStore';
import { buildPaybackTransferNote } from '~/features/transactions/lib/settleUp';
import { rescaleSplitAdjustedAmounts } from '~/features/transactions/lib/splitAmountSnapshot';
import { paybackTransferAmounts } from '~/features/transactions/lib/splitPayments';
import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
import {
  type CreateTransactionInput,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import type {
  AlbumExpense,
  AlbumMember,
  AlbumSettlement,
  RateTable,
  TransactionSplit,
} from '~/types';
import { convert } from '~/utils/currency';
import { dayKeyFromDateLocal, normalizeMoneyAmount } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { localBill, type LocalPayment, settlementsByBill } from '../lib/albumGroup';
import { selfMember } from '../lib/albumPeople';
import { openShares, simplifyDebts } from '../lib/groupDebts';

/** What the open ledger and the user's settings give the group's entries. */
export interface GroupEnv {
  /** The Cloud Sync account this phone is in its groups as. */
  userId: string;
  /** The name the user's own row carries ("Me"). */
  meLabel: string;
  rateTable: RateTable;
  reportingCurrency: string;
  currencyOf: (accountId: string) => string | null;
  /** The account a new entry lands on, or null without one. */
  defaultAccountId: string | null;
  /** The account money paid back lands in, or null to use the bill's own. */
  defaultPaybackAccountId: string | null;
  /** The user's own expense category for another phone's (by name, then icon), or a fallback. */
  categoryIdFor: (name: string | null, icon: string | null) => string | null;
}

/** What only this phone knows about a write it is about to project. */
interface ProjectHints {
  /** A bill the editor is saving: the fields that are the user's own. */
  entry?: Pick<
    CreateTransactionInput,
    'accountId' | 'categoryId' | 'details' | 'receiptUri' | 'sentiment' | 'reimbursable'
  >;
  /** The account a settlement just recorded here moved through, by settlement id. */
  accounts?: ReadonlyMap<string, string | null>;
}

interface TxRow {
  id: string;
  ledger_id: string;
  type: string;
  amount: number;
  currency: string;
  reporting_currency: string | null;
  reporting_amount: number | null;
  fx_rate: number | null;
  to_amount: number | null;
  account_amount: number | null;
  date: string;
  account_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  note: string | null;
  album_group_id: string | null;
  deleted_at: string | null;
}

const TX_COLUMNS =
  'id, ledger_id, type, amount, currency, reporting_currency, reporting_amount, fx_rate, to_amount, account_amount, date, account_id, from_account_id, to_account_id, category_id, note, album_group_id, deleted_at';

function readTx(id: string): TxRow | null {
  return getSQLite().getFirstSync<TxRow>(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`, [
    id,
  ]);
}

/**
 * What bringing a whole group in step reads, in a few statements up front
 * instead of several for every bill: the entries its bills already have,
 * their shares, the entries its payments made, and which entries the album
 * holds. Most passes then write nothing.
 */
interface Preloaded {
  entries: Map<string, TxRow>;
  splits: Map<string, TransactionSplit[]>;
  /** The entries payments made (or would make), by id; an id read and not found is null. */
  linked: Map<string, TxRow | null>;
  inAlbum: Set<string>;
}

/** The entries with these ids, in parts: a statement takes only so many values. */
function readTxs(ids: readonly string[]): Map<string, TxRow> {
  const db = getSQLite();
  const rows = new Map<string, TxRow>();
  for (let start = 0; start < ids.length; start += 400) {
    const part = ids.slice(start, start + 400);
    for (const row of db.getAllSync<TxRow>(
      `SELECT ${TX_COLUMNS} FROM transactions WHERE id IN (${part.map(() => '?').join(', ')})`,
      part,
    )) {
      rows.set(row.id, row);
    }
  }
  return rows;
}

function preload(
  groupId: string,
  billIds: string[],
  paid: ReadonlyMap<string, readonly AlbumSettlement[]>,
): Preloaded {
  const db = getSQLite();
  const entries = readTxs(billIds);
  const splits = new Map<string, TransactionSplit[]>();
  const held = [...entries.keys()];
  for (let start = 0; start < held.length; start += 400) {
    const part = transactionSplitsRepository.listByTransactionIds(held.slice(start, start + 400));
    for (const [id, rows] of part) splits.set(id, rows);
  }
  // Every id a payment's entry can have: the one a share row already names,
  // else the one it would be made with (`linkedIdFor`).
  const linkedIds = new Set<string>();
  for (const rows of splits.values()) {
    for (const split of rows) if (split.paidTransactionId) linkedIds.add(split.paidTransactionId);
  }
  for (const billId of billIds) {
    for (const payment of paid.get(billId) ?? []) {
      linkedIds.add(linkedIdFor(billId, 'received', payment.id));
      linkedIds.add(linkedIdFor(billId, 'sent_part', payment.id));
    }
  }
  const found = readTxs([...linkedIds]);
  const linked = new Map<string, TxRow | null>(
    [...linkedIds].map((id) => [id, found.get(id) ?? null]),
  );
  const inAlbum = new Set(
    db
      .getAllSync<{
        transaction_id: string;
      }>(
        'SELECT transaction_id FROM album_transactions WHERE album_id = ? AND deleted_at IS NULL',
        [groupId],
      )
      .map((row) => row.transaction_id),
  );
  return { entries, splits, linked, inAlbum };
}

/** The id of the entry a payment makes: a transfer for money received, an expense for a part sent. */
function linkedIdFor(billId: string, kind: 'received' | 'sent_part', settlementId: string): string {
  return `${billId}:${kind === 'received' ? 't' : 'x'}:${settlementId}`;
}

const sameMoney = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.round(a * 100) === Math.round(b * 100);

/**
 * Whether this phone keeps the group's entries now: the album is in the main
 * ledger, which is open (the entries land on its accounts and categories).
 * A shared album lives only in the main ledger, so a group whose id names an
 * album of another ledger (one a member of a shared ledger could know) never
 * writes there; one in the main ledger is caught up when it is opened.
 */
function albumIsOpen(groupId: string): boolean {
  const row = getSQLite().getFirstSync<{ ledger_id: string; deleted_at: string | null }>(
    'SELECT ledger_id, deleted_at FROM albums WHERE id = ?',
    [groupId],
  );
  return (
    !!row &&
    !row.deleted_at &&
    row.ledger_id === DEFAULT_LEDGER_ID &&
    getActiveLedgerId() === DEFAULT_LEDGER_ID
  );
}

/**
 * Whether an entry that already has a bill's id is that bill. A bill's id is
 * whatever its group says, so it could name any entry on this phone. Only one
 * the group already holds is taken, or, before it is marked (a group joined
 * again after leaving it), a live expense of this very album. Any other entry
 * with that id is left exactly as it is, and the bill is passed over.
 */
function isGroupsEntry(row: TxRow, groupId: string, loaded: Preloaded | null): boolean {
  if (row.album_group_id) return row.album_group_id === groupId;
  if (row.deleted_at || row.type !== 'expense') return false;
  return loaded ? loaded.inAlbum.has(row.id) : isInAlbum(groupId, row.id);
}

function isInAlbum(albumId: string, transactionId: string): boolean {
  return !!getSQLite().getFirstSync(
    'SELECT 1 FROM album_transactions WHERE album_id = ? AND transaction_id = ? AND deleted_at IS NULL',
    [albumId, transactionId],
  );
}

/** Brings a soft-deleted entry back, so a deterministic id can be written again. */
function reviveTx(id: string): void {
  getSQLite().runSync('UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
    nowIso(),
    id,
  ]);
}

function ensureInAlbum(albumId: string, transactionId: string): boolean {
  const db = getSQLite();
  if (isInAlbum(albumId, transactionId)) return false;
  const now = nowIso();
  // One id per album and entry, so two phones add the same row.
  db.runSync(
    `INSERT INTO album_transactions (id, album_id, transaction_id, sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 0, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
    [`${albumId}:${transactionId}`, albumId, transactionId, now, now],
  );
  return true;
}

/** The frozen currency figures of an expense of `amount`, keeping the rates `existing` froze. */
function expenseAmounts(
  env: GroupEnv,
  existing: TxRow | null,
  amount: number,
  currency: string,
  accountId: string | null,
): Pick<
  CreateTransactionInput,
  'amount' | 'reportingCurrency' | 'reportingAmount' | 'fxRate' | 'accountAmount'
> {
  const accountCurrency = accountId ? env.currencyOf(accountId) : null;
  const sameShape =
    existing &&
    existing.currency === currency &&
    existing.account_id === accountId &&
    existing.reporting_currency != null;
  if (sameShape) {
    const scaled = rescaleSplitAdjustedAmounts(
      {
        amount: existing.amount,
        reportingAmount: existing.reporting_amount,
        accountAmount: existing.account_amount,
      },
      amount,
      () => ({
        reportingRate:
          existing.fx_rate ??
          convert(1, currency, existing.reporting_currency ?? currency, env.rateTable).rateUsed,
        accountRate:
          accountCurrency && accountCurrency !== currency
            ? convert(1, currency, accountCurrency, env.rateTable).rateUsed
            : null,
      }),
    );
    return {
      amount: scaled.amount,
      reportingCurrency: existing.reporting_currency,
      reportingAmount: scaled.reportingAmount,
      fxRate: existing.fx_rate,
      accountAmount: scaled.accountAmount,
    };
  }
  const reporting = convert(amount, currency, env.reportingCurrency, env.rateTable);
  return {
    amount: normalizeMoneyAmount(amount),
    reportingCurrency: env.reportingCurrency,
    reportingAmount: reporting.value,
    fxRate: reporting.rateUsed ?? (currency === env.reportingCurrency ? 1 : null),
    accountAmount:
      accountCurrency && accountCurrency !== currency
        ? convert(amount, currency, accountCurrency, env.rateTable).value
        : null,
  };
}

/** Writes an expense as it should be: made, brought back, or changed where it differs. */
function writeExpense(
  id: string,
  existing: TxRow | null,
  input: CreateTransactionInput & { albumGroupId: string | null },
): boolean {
  if (!existing) {
    transactionsRepository.createWithId(id, input);
    return true;
  }
  if (existing.deleted_at) reviveTx(id);
  const changed =
    !!existing.deleted_at ||
    existing.type !== input.type ||
    !sameMoney(existing.amount, input.amount) ||
    existing.currency !== input.currency ||
    !sameMoney(existing.reporting_amount, input.reportingAmount) ||
    !sameMoney(existing.account_amount, input.accountAmount) ||
    existing.date !== input.date ||
    (existing.account_id ?? null) !== (input.accountId ?? null) ||
    (existing.category_id ?? null) !== (input.categoryId ?? null) ||
    (existing.note ?? null) !== (input.note ?? null) ||
    (existing.album_group_id ?? null) !== (input.albumGroupId ?? null);
  if (changed) transactionsRepository.update(id, input);
  return changed;
}

interface DesiredSplit {
  id: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  isPayer: boolean;
  shareAmount: number | null;
  albumMemberId: string | null;
  partOfSplitId: string | null;
  paidAt: string | null;
  settlementId: string | null;
  paybackAccountId: string | null;
  paidTransactionId: string | null;
  sortOrder: number;
}

function writeSplit(transactionId: string, row: DesiredSplit, existing: TransactionSplit | null) {
  if (existing) {
    const same =
      (existing.personName ?? null) === (row.personName ?? null) &&
      sameMoney(existing.amount, row.amount) &&
      existing.isSelf === row.isSelf &&
      existing.isPayer === row.isPayer &&
      sameMoney(existing.shareAmount, row.shareAmount) &&
      (existing.albumMemberId ?? null) === row.albumMemberId &&
      (existing.partOfSplitId ?? null) === row.partOfSplitId &&
      (existing.paidAt ?? null) === row.paidAt &&
      (existing.settlementId ?? null) === row.settlementId &&
      (existing.paybackAccountId ?? null) === row.paybackAccountId &&
      (existing.paidTransactionId ?? null) === row.paidTransactionId &&
      existing.sortOrder === row.sortOrder;
    if (same) return false;
  }
  const now = nowIso();
  // An upsert, so a row removed before (same member, same id) comes back.
  getSQLite().runSync(
    `INSERT INTO transaction_splits
       (id, transaction_id, person_name, amount, is_self, payback_account_id, paid_at,
        paid_transaction_id, part_of_split_id, is_payer, share_amount, album_member_id,
        settlement_id, sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       person_name = excluded.person_name, amount = excluded.amount, is_self = excluded.is_self,
       payback_account_id = excluded.payback_account_id, paid_at = excluded.paid_at,
       paid_transaction_id = excluded.paid_transaction_id,
       part_of_split_id = excluded.part_of_split_id, is_payer = excluded.is_payer,
       share_amount = excluded.share_amount, album_member_id = excluded.album_member_id,
       settlement_id = excluded.settlement_id, sort_order = excluded.sort_order,
       updated_at = excluded.updated_at, deleted_at = NULL`,
    [
      row.id,
      transactionId,
      row.personName,
      normalizeMoneyAmount(row.amount),
      row.isSelf ? 1 : 0,
      row.paybackAccountId,
      row.paidAt,
      row.paidTransactionId,
      row.partOfSplitId,
      row.isPayer ? 1 : null,
      row.shareAmount == null ? null : normalizeMoneyAmount(row.shareAmount),
      row.albumMemberId,
      row.settlementId,
      row.sortOrder,
      now,
      now,
    ],
  );
  return true;
}

/** Removes the user's side of a bill: the entry, its shares and the entries its payments made. */
function removeLocalBill(tx: TxRow, splits: readonly TransactionSplit[]): void {
  const linked = splits.flatMap((split) =>
    split.paidTransactionId ? [split.paidTransactionId] : [],
  );
  transactionSplitsRepository.softDeleteByTransactionId(tx.id);
  transactionsRepository.softDeleteMany([tx.id, ...linked]);
}

/**
 * Brings the user's own side of one bill in step with the group. Returns
 * whether anything was written.
 */
function projectExpense(
  expense: AlbumExpense,
  settlements: readonly AlbumSettlement[],
  members: readonly AlbumMember[],
  env: GroupEnv,
  hints: ProjectHints,
  loaded: Preloaded | null,
): boolean {
  const groupId = expense.groupId;
  const self = selfMember(members, env.userId);
  const bill = expense.deletedAt ? null : localBill(expense, settlements, self?.id ?? null);
  const existing = loaded ? (loaded.entries.get(expense.id) ?? null) : readTx(expense.id);
  // An entry with this id that is not the group's: never written into.
  if (existing && !isGroupsEntry(existing, groupId, loaded)) return false;
  const live = existing && !existing.deleted_at ? existing : null;
  const splits = !live
    ? []
    : loaded
      ? (loaded.splits.get(expense.id) ?? [])
      : transactionSplitsRepository.listByTransactionId(expense.id);

  // Whether this account made the bill's last change (a phone of the user's).
  const changedByUser = expense.createdBy === env.userId;

  if (!bill) {
    // Not the user's bill (any more): their side of it goes. Only an entry
    // the group has marked as its own is touched. A bill with payments on it
    // cannot be deleted or changed, so no money that moved goes with it
    // (README: Who can change what).
    if (!live || live.album_group_id !== groupId) return false;
    removeLocalBill(live, splits);
    return true;
  }

  let changed = false;
  const nameOf = (memberId: string) =>
    members.find((member) => member.id === memberId)?.name ?? null;
  // What this phone chose for a payment it already holds: the account, and
  // the entry it made for it.
  const prior = new Map<string, { accountId: string | null; linkedId: string | null }>();
  for (const split of splits) {
    if (split.settlementId) {
      prior.set(split.settlementId, {
        accountId: split.paybackAccountId,
        linkedId: split.paidTransactionId,
      });
    }
  }
  const payments = new Map(bill.payments.map((payment) => [payment.settlementId, payment]));
  const paymentAccount = (payment: LocalPayment, fallback: string | null): string | null => {
    const known = prior.get(payment.settlementId);
    if (known) return known.accountId;
    if (hints.accounts?.has(payment.settlementId)) {
      return hints.accounts.get(payment.settlementId) ?? null;
    }
    return fallback;
  };

  // --- The entry itself ---------------------------------------------------
  const finalPayment = bill.payments.find((payment) => payment.kind === 'sent_final') ?? null;
  // A bill the user paid is on the account this phone's editor just picked,
  // else the one the entry already has, else, new and saved by the user, on
  // their default account. One the user paid that someone else wrote (they
  // joined under a name it was already paid by) lands on no account until
  // they say which account it left (`needsAccountConfirm`). An entry already
  // here never falls back to the default account: the account the user's
  // other phone gave it is on its way.
  const accountId =
    bill.kind === 'paid'
      ? (hints.entry?.accountId ??
        live?.account_id ??
        (changedByUser && !live ? env.defaultAccountId : null))
      : finalPayment
        ? paymentAccount(finalPayment, env.defaultAccountId)
        : null;
  const categoryId =
    hints.entry?.categoryId ??
    live?.category_id ??
    env.categoryIdFor(expense.categoryName, expense.categoryIcon);
  const amounts = expenseAmounts(env, live, bill.amount, expense.currency, accountId);
  const wrote = writeExpense(expense.id, existing, {
    type: 'expense',
    ...amounts,
    currency: expense.currency,
    date: expense.date,
    accountId,
    categoryId,
    note: expense.note,
    ...(live
      ? null
      : {
          details: hints.entry?.details ?? null,
          receiptUri: hints.entry?.receiptUri ?? null,
          sentiment: hints.entry?.sentiment ?? 'neutral',
          reimbursable: hints.entry?.reimbursable ?? false,
        }),
    albumGroupId: groupId,
  });
  changed = wrote || changed;
  if (!loaded?.inAlbum.has(expense.id)) changed = ensureInAlbum(groupId, expense.id) || changed;
  // Unchanged, the entry is the one already read.
  const tx = !wrote && live ? live : readTx(expense.id)!;

  // --- Its shares ----------------------------------------------------------
  // The row a phone already has for the user or a member, the one with the
  // group's own id first: when two sets of rows meet (another phone of the
  // user's wrote one), every phone keeps the same set.
  const pick = (candidates: TransactionSplit[], id: string) =>
    candidates.find((split) => split.id === id) ?? candidates[0];
  const selfRow = pick(
    splits.filter((split) => split.isSelf),
    `${expense.id}:self`,
  );
  const rootOf = (memberId: string) =>
    pick(
      splits.filter(
        (split) => !split.isSelf && !split.partOfSplitId && split.albumMemberId === memberId,
      ),
      `${expense.id}:${memberId}`,
    );
  const rootId = (memberId: string) => rootOf(memberId)?.id ?? `${expense.id}:${memberId}`;
  const partId = (settlementId: string) =>
    splits.find((split) => !!split.partOfSplitId && split.settlementId === settlementId)?.id ??
    `${expense.id}:${settlementId}`;
  // The user's row first, then the others in the bill's order.
  const order = new Map(
    expense.shares
      .filter((share) => share.memberId !== self?.id)
      .map((share, index) => [share.memberId, index + 1]),
  );

  // Where a member's share is expected to be paid back to: what the share's
  // own row says, else the user's "paid to" account, else the bill's own.
  const expectedAccount = (memberId: string) =>
    rootOf(memberId)?.paybackAccountId ?? env.defaultPaybackAccountId ?? tx.account_id;

  // Entries a payment needs beside the bill: a transfer for money paid back
  // into another account, an expense for a part of the user's share.
  const linked = new Map<string, { id: string; payment: LocalPayment; accountId: string | null }>();
  const desired: DesiredSplit[] = bill.splits.map((row) => {
    const payment = row.settlementId ? (payments.get(row.settlementId) ?? null) : null;
    let paybackAccountId: string | null = null;
    let paidTransactionId: string | null = null;
    if (payment?.kind === 'received') {
      paybackAccountId = paymentAccount(payment, expectedAccount(payment.memberId));
      if (tx.account_id && paybackAccountId && paybackAccountId !== tx.account_id) {
        paidTransactionId =
          prior.get(payment.settlementId)?.linkedId ??
          linkedIdFor(expense.id, 'received', payment.settlementId);
        linked.set(paidTransactionId, {
          id: paidTransactionId,
          payment,
          accountId: paybackAccountId,
        });
      }
    } else if (payment?.kind === 'sent_part') {
      paybackAccountId = paymentAccount(payment, env.defaultAccountId);
      paidTransactionId =
        prior.get(payment.settlementId)?.linkedId ??
        linkedIdFor(expense.id, 'sent_part', payment.settlementId);
      linked.set(paidTransactionId, {
        id: paidTransactionId,
        payment,
        accountId: paybackAccountId,
      });
    } else if (payment?.kind === 'sent_final') {
      paybackAccountId = accountId;
    } else if (row.role === 'member' && bill.kind === 'paid') {
      paybackAccountId = expectedAccount(row.memberId!);
    }
    return {
      id:
        row.role === 'self'
          ? (selfRow?.id ?? `${expense.id}:self`)
          : row.role === 'member'
            ? rootId(row.memberId!)
            : partId(row.settlementId!),
      // The user's own row keeps the word it was first written with: two
      // phones in different languages would otherwise rewrite it forever.
      personName:
        row.role === 'self' ? (selfRow?.personName ?? env.meLabel) : nameOf(row.memberId!),
      amount: row.amount,
      isSelf: row.role === 'self',
      isPayer: row.isPayer,
      shareAmount: row.shareAmount,
      albumMemberId: row.memberId,
      partOfSplitId: row.partOf ? rootId(row.partOf) : null,
      paidAt: row.paidAt,
      settlementId: row.settlementId,
      paybackAccountId,
      paidTransactionId,
      sortOrder: row.role === 'self' ? 0 : (order.get(row.memberId!) ?? expense.shares.length + 1),
    };
  });
  const byId = new Map(splits.map((split) => [split.id, split]));
  const keep = new Set(desired.map((row) => row.id));
  for (const split of splits) {
    if (keep.has(split.id)) continue;
    transactionSplitsRepository.softDelete(split.id);
    changed = true;
  }
  for (const row of desired) {
    changed = writeSplit(expense.id, row, byId.get(row.id) ?? null) || changed;
  }

  // --- The entries its payments make ---------------------------------------
  for (const entry of linked.values()) {
    const before = loaded?.linked.has(entry.id)
      ? (loaded.linked.get(entry.id) ?? null)
      : readTx(entry.id);
    // The entry a payment makes is never a bill of a group.
    if (before?.album_group_id) continue;
    if (entry.payment.kind === 'received') {
      const fromCurrency =
        (tx.account_id ? env.currencyOf(tx.account_id) : null) || expense.currency;
      const transfer = paybackTransferAmounts({
        share: entry.payment.amount,
        billCurrency: expense.currency,
        billAmount: tx.amount,
        billAccountAmount: tx.account_amount,
        fromCurrency,
        toCurrency: (entry.accountId ? env.currencyOf(entry.accountId) : null) || fromCurrency,
        rateTable: env.rateTable,
      });
      // An existing payment froze its exchange rate when money moved. Syncs,
      // renames and fresh market rates must not reprice that transfer.
      if (
        before?.type === 'transfer' &&
        before.currency === transfer.currency &&
        before.from_account_id === tx.account_id &&
        before.to_account_id === entry.accountId &&
        before.amount > 0
      ) {
        transfer.toAmount =
          before.to_amount == null
            ? null
            : normalizeMoneyAmount((before.to_amount * transfer.amount) / before.amount);
      }
      const input: CreateTransactionInput = {
        type: 'transfer',
        amount: transfer.amount,
        currency: transfer.currency,
        toAmount: transfer.toAmount,
        date: entry.payment.date,
        accountId: null,
        fromAccountId: tx.account_id,
        toAccountId: entry.accountId,
        categoryId: null,
        note: buildPaybackTransferNote(nameOf(entry.payment.memberId), expense.note),
      };
      if (!before) {
        transactionsRepository.createWithId(entry.id, input);
        changed = true;
      } else {
        if (before.deleted_at) reviveTx(entry.id);
        const differs =
          !!before.deleted_at ||
          before.type !== input.type ||
          before.currency !== input.currency ||
          !sameMoney(before.amount, input.amount) ||
          !sameMoney(before.to_amount, input.toAmount) ||
          before.date !== input.date ||
          before.note !== input.note ||
          before.from_account_id !== input.fromAccountId ||
          before.to_account_id !== input.toAccountId;
        if (differs) transactionsRepository.update(entry.id, input);
        changed = changed || differs;
      }
    } else {
      // A part of the user's share, paid: its own expense on the account it
      // left, on the bill's day, so the bill and its parts add up to the share.
      const partAmounts = expenseAmounts(
        env,
        before && !before.deleted_at ? before : null,
        entry.payment.amount,
        expense.currency,
        entry.accountId,
      );
      changed =
        writeExpense(entry.id, before, {
          type: 'expense',
          ...partAmounts,
          currency: expense.currency,
          date: expense.date,
          accountId: entry.accountId,
          categoryId: before?.category_id ?? tx.category_id,
          note: expense.note,
          albumGroupId: null,
        }) || changed;
      if (!loaded?.inAlbum.has(entry.id)) changed = ensureInAlbum(groupId, entry.id) || changed;
    }
  }
  // Entries of payments that are no longer there: undone, past the share, or
  // made on this entry while it was not the group's (so the group has none).
  const stale = splits.flatMap((split) =>
    split.paidTransactionId && !linked.has(split.paidTransactionId)
      ? [split.paidTransactionId]
      : [],
  );
  if (stale.length) {
    transactionsRepository.softDeleteMany(stale);
    changed = true;
  }
  return changed;
}

/**
 * Brings the user's entries in step with one group, or with one bill of it.
 * Nothing happens while this phone has no member of its own in the group
 * (joined, not yet said who they are), or while the album is in another
 * ledger than the open one. Returns whether anything was written.
 */
export function projectGroup(
  groupId: string,
  env: GroupEnv,
  options: { expenseId?: string; hints?: ProjectHints } = {},
): boolean {
  if (!sharedAlbumFor(groupId) || !albumIsOpen(groupId)) return false;
  const members = albumGroupsRepository.listAllMembers(groupId);
  if (!selfMember(members, env.userId)) return false;
  const memberIds = new Set(members.map((member) => member.id));
  const paid = settlementsByBill(albumGroupsRepository.listSettlements(groupId, memberIds));
  const expenses = albumGroupsRepository
    .listExpenses(groupId, memberIds)
    .filter((expense) => !options.expenseId || expense.id === options.expenseId);
  let changed = false;
  getSQLite().withTransactionSync(() => {
    // One bill reads its own rows; a whole group reads them all at once.
    const loaded = options.expenseId
      ? null
      : preload(
          groupId,
          expenses.map((expense) => expense.id),
          paid,
        );
    for (const expense of expenses) {
      const payments = paid.get(expense.id) ?? [];
      changed =
        projectExpense(expense, payments, members, env, options.hints ?? {}, loaded) || changed;
    }
  });
  return changed;
}

/**
 * With "Simplify group debts" on, a group where nobody owes anything on
 * balance has nothing left to pay: whatever is still open on its bills goes
 * round in a circle, so every open share is closed, as one act. Run after a
 * change made on this phone (not after a sync, or every phone would write the
 * same payments). Returns whether anything was closed; the caller projects.
 */
export function closeEvenGroup(groupId: string, env: GroupEnv): boolean {
  if (!albumGroupsRepository.simplifiesDebts(groupId)) return false;
  const memberIds = albumGroupsRepository.memberIds(groupId);
  const open = openShares(
    albumGroupsRepository.listExpenses(groupId, memberIds),
    albumGroupsRepository.listSettlements(groupId, memberIds),
  );
  if (open.length === 0 || simplifyDebts(open).length > 0) return false;
  albumGroupsRepository.createSettlements(
    groupId,
    open.map((share) => ({
      expenseId: share.expenseId,
      fromMember: share.from,
      toMember: share.to,
      amount: share.amount,
      currency: share.currency,
    })),
    { date: dayKeyFromDateLocal(new Date()), createdBy: env.userId },
  );
  return true;
}

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
import { getActiveLedgerId } from '~/lib/db/ledgerScope';
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
import { normalizeMoneyAmount } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import { groupFromLocalBill, localBill, type LocalPayment } from '../lib/albumGroup';
import { cleanPersonName, memberByName, selfMember } from '../lib/albumPeople';
import { notifyAlbumGroups } from './albumGroupStore';

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
export interface ProjectHints {
  /** A bill the editor is saving: the fields that are the user's own. */
  entry?: Pick<
    CreateTransactionInput,
    'accountId' | 'categoryId' | 'details' | 'receiptUri' | 'sentiment'
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

const sameMoney = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.round(a * 100) === Math.round(b * 100);

/**
 * Whether this phone keeps the group's entries now: the album is in the open
 * ledger (the entries land on its accounts and categories). A group whose
 * album is in another ledger is caught up when that ledger is opened.
 */
function albumIsOpen(groupId: string): boolean {
  const row = getSQLite().getFirstSync<{ ledger_id: string; deleted_at: string | null }>(
    'SELECT ledger_id, deleted_at FROM albums WHERE id = ?',
    [groupId],
  );
  return !!row && !row.deleted_at && row.ledger_id === getActiveLedgerId();
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
  const live = db.getFirstSync(
    'SELECT 1 FROM album_transactions WHERE album_id = ? AND transaction_id = ? AND deleted_at IS NULL',
    [albumId, transactionId],
  );
  if (live) return false;
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
): boolean {
  const groupId = expense.groupId;
  const self = selfMember(members, env.userId);
  const bill = expense.deletedAt ? null : localBill(expense, settlements, self?.id ?? null);
  const existing = readTx(expense.id);
  const live = existing && !existing.deleted_at ? existing : null;
  const splits = live ? transactionSplitsRepository.listByTransactionId(expense.id) : [];

  if (!bill) {
    // Not the user's bill (any more): their side of it goes. Only an entry
    // that is this group's is touched.
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
  const accountId =
    bill.kind === 'paid'
      ? (live?.account_id ?? hints.entry?.accountId ?? env.defaultAccountId)
      : finalPayment
        ? paymentAccount(finalPayment, env.defaultAccountId)
        : null;
  const categoryId =
    hints.entry?.categoryId ??
    live?.category_id ??
    env.categoryIdFor(expense.categoryName, expense.categoryIcon);
  const amounts = expenseAmounts(env, live, bill.amount, expense.currency, accountId);
  changed =
    writeExpense(expense.id, existing, {
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
          }),
      albumGroupId: groupId,
    }) || changed;
  changed = ensureInAlbum(groupId, expense.id) || changed;
  const tx = readTx(expense.id)!;

  // --- Its shares ----------------------------------------------------------
  const selfRow = splits.find((split) => split.isSelf);
  const rootOf = (memberId: string) =>
    splits.find(
      (split) => !split.isSelf && !split.partOfSplitId && split.albumMemberId === memberId,
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

  // Entries a payment needs beside the bill: a transfer for money paid back
  // into another account, an expense for a part of the user's share.
  const linked = new Map<string, { id: string; payment: LocalPayment; accountId: string | null }>();
  const desired: DesiredSplit[] = bill.splits.map((row) => {
    const payment = row.settlementId ? (payments.get(row.settlementId) ?? null) : null;
    let paybackAccountId: string | null = null;
    let paidTransactionId: string | null = null;
    if (payment?.kind === 'received') {
      paybackAccountId = paymentAccount(payment, env.defaultPaybackAccountId ?? tx.account_id);
      if (tx.account_id && paybackAccountId && paybackAccountId !== tx.account_id) {
        paidTransactionId =
          prior.get(payment.settlementId)?.linkedId ?? `${expense.id}:t:${payment.settlementId}`;
        linked.set(paidTransactionId, {
          id: paidTransactionId,
          payment,
          accountId: paybackAccountId,
        });
      }
    } else if (payment?.kind === 'sent_part') {
      paybackAccountId = paymentAccount(payment, env.defaultAccountId);
      paidTransactionId =
        prior.get(payment.settlementId)?.linkedId ?? `${expense.id}:x:${payment.settlementId}`;
      linked.set(paidTransactionId, {
        id: paidTransactionId,
        payment,
        accountId: paybackAccountId,
      });
    } else if (payment?.kind === 'sent_final') {
      paybackAccountId = accountId;
    } else if (row.role === 'member' && bill.kind === 'paid') {
      // Where an unpaid share is expected to be paid back to.
      paybackAccountId = rootOf(row.memberId!)?.paybackAccountId ?? tx.account_id;
    }
    return {
      id:
        row.role === 'self'
          ? (selfRow?.id ?? `${expense.id}:self`)
          : row.role === 'member'
            ? rootId(row.memberId!)
            : partId(row.settlementId!),
      personName: row.role === 'self' ? env.meLabel : nameOf(row.memberId!),
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
    const before = readTx(entry.id);
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
          !sameMoney(before.amount, input.amount) ||
          !sameMoney(before.to_amount, input.toAmount) ||
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
      changed = ensureInAlbum(groupId, entry.id) || changed;
    }
  }
  // Entries of payments that are no longer there (undone, or past the share).
  const stale = [...prior.values()].flatMap((known) =>
    known.linkedId && !linked.has(known.linkedId) ? [known.linkedId] : [],
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
  const settlements = albumGroupsRepository.listSettlements(groupId);
  const expenses = albumGroupsRepository
    .listExpenses(groupId)
    .filter((expense) => !options.expenseId || expense.id === options.expenseId);
  let changed = false;
  getSQLite().withTransactionSync(() => {
    for (const expense of expenses) {
      changed = projectExpense(expense, settlements, members, env, options.hints ?? {}) || changed;
    }
  });
  return changed;
}

/**
 * An album just shared from this phone: every split bill already in it
 * becomes a bill of the group, with the payments on it, and people on those
 * bills who are not in the group yet are added by name. The entries
 * themselves do not change: they are marked as the group's, and the rows
 * `projectGroup` would write are the ones already there.
 */
export function publishAlbumBills(groupId: string, env: GroupEnv): void {
  const db = getSQLite();
  let members = albumGroupsRepository.listMembers(groupId);
  const self = selfMember(members, env.userId);
  if (!self) return;
  const ids = db
    .getAllSync<{ transaction_id: string }>(
      `SELECT at.transaction_id FROM album_transactions at
       JOIN transactions t ON t.id = at.transaction_id
       WHERE at.album_id = ? AND at.deleted_at IS NULL AND t.deleted_at IS NULL
         AND t.type = 'expense' AND t.album_group_id IS NULL`,
      [groupId],
    )
    .map((row) => row.transaction_id);
  const splitsByTx = transactionSplitsRepository.listByTransactionIds(ids);
  db.withTransactionSync(() => {
    for (const id of ids) {
      const splits = splitsByTx.get(id) ?? [];
      if (!splits.some((split) => !split.isSelf)) continue;
      const tx = readTx(id);
      if (!tx) continue;
      // Who each friend's row is: the member it already names, else the one
      // of that name, else someone new by that name.
      const memberOf = (split: TransactionSplit): string | null => {
        const named = split.albumMemberId
          ? members.find((member) => member.id === split.albumMemberId && member.id !== self.id)
          : null;
        if (named) return named.id;
        const name = cleanPersonName(split.personName ?? '');
        if (!name) return null;
        const known = memberByName(members, name, self.id);
        if (known) return known.id;
        const added = albumGroupsRepository.createMember(groupId, { name });
        members = [...members, added];
        return added.id;
      };
      const built = groupFromLocalBill(tx, splits, self.id, memberOf);
      if (!built) continue;
      const category = tx.category_id
        ? db.getFirstSync<{ name: string | null; icon: string | null }>(
            'SELECT name, icon FROM categories WHERE id = ?',
            [tx.category_id],
          )
        : null;
      albumGroupsRepository.upsertExpense({
        id,
        groupId,
        date: tx.date,
        note: tx.note,
        amount: built.amount,
        currency: tx.currency,
        categoryName: category?.name ?? null,
        categoryIcon: category?.icon ?? null,
        paidBy: built.paidBy,
        shares: built.shares,
        createdBy: env.userId,
      });
      for (const payment of built.payments) {
        const settlementId = albumGroupsRepository.createSettlement({
          groupId,
          expenseId: id,
          fromMember: payment.fromMember,
          toMember: payment.toMember,
          amount: payment.amount,
          currency: tx.currency,
          date: payment.paidAt.slice(0, 10),
          createdBy: env.userId,
          createdAt: payment.paidAt,
        });
        transactionSplitsRepository.update(payment.splitId, { settlementId });
      }
      for (const split of splits) {
        if (split.isSelf) continue;
        const memberId = memberOf(split);
        if (memberId && split.albumMemberId !== memberId) {
          transactionSplitsRepository.update(split.id, { albumMemberId: memberId });
        }
      }
      transactionsRepository.update(id, { albumGroupId: groupId });
    }
  });
  notifyAlbumGroups();
}

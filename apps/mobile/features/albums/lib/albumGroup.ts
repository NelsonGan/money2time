/**
 * A shared album's group, as numbers. Pure: no database, no clock.
 *
 * The group holds whole bills (`AlbumExpense`: who paid and each member's
 * share) and the payments between members (`AlbumSettlement`). Each phone
 * keeps only its own side of a bill in its own ledger, as the split bill the
 * app always had (features/transactions/lib/splitPayer.ts):
 *
 * - **A bill the user paid** is an expense for the whole bill on their
 *   account, with each other member's share as a row that owes the user. A
 *   settlement from that member is a payback: the expense drops by it and the
 *   row, or a part of it, is paid.
 * - **A bill another member paid** is an expense for the user's own share,
 *   owed to that member, on no account until it is paid back. A settlement
 *   from the user is a pay-back: a part of it is its own expense on the
 *   account it left, and the last of it puts the bill on its account.
 * - **A bill the user has no part in** is not in their ledger at all.
 *
 * `localBill` turns one bill and its settlements into exactly those rows, so
 * every phone of every member derives the same thing from the same group, and
 * running it twice changes nothing.
 */

import { owedToPayer } from '~/features/transactions/lib/splitPayer';
import { splitShareKey } from '~/features/transactions/lib/splitPayments';
import type { AlbumExpense, AlbumSettlement, AlbumShare, TransactionSplit } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';

type Bill = Pick<AlbumExpense, 'id' | 'amount' | 'paidBy' | 'shares'>;
type Payment = Pick<
  AlbumSettlement,
  'id' | 'expenseId' | 'fromMember' | 'toMember' | 'amount' | 'date' | 'createdAt' | 'deletedAt'
>;

const cents = (value: number) => Math.round(value * 100);

// ---------------------------------------------------------------------------
// From the split editor to the group's bill

/** A row of the split editor as far as the group goes: a member and their share of the whole bill. */
export interface GroupBillRow {
  /** The member the row is for; the user's own member on the Me row. */
  memberId: string;
  amount: number;
  /** The friend who paid the bill, when the user did not. */
  isPayer?: boolean;
}

/**
 * The group's bill for the editor's rows: who paid (`selfId` unless a row is
 * the payer) and each member's share, a member with several rows (a share
 * paid in parts) folded into one. Null when nothing is shared out.
 */
export function billFromRows(
  rows: readonly GroupBillRow[],
  selfId: string,
): { paidBy: string; shares: AlbumShare[]; amount: number } | null {
  const byMember = new Map<string, number>();
  for (const row of rows) {
    const amount = Math.max(0, cents(row.amount));
    byMember.set(row.memberId, (byMember.get(row.memberId) ?? 0) + amount);
  }
  const shares = [...byMember]
    .filter(([, amount]) => amount > 0)
    .map(([memberId, amount]) => ({ memberId, amount: amount / 100 }));
  if (!shares.length) return null;
  const paidBy = rows.find((row) => row.isPayer && row.memberId !== selfId)?.memberId ?? selfId;
  return {
    paidBy,
    shares,
    amount: shares.reduce((sum, share) => sum + cents(share.amount), 0) / 100,
  };
}

// ---------------------------------------------------------------------------
// One member's own side of a bill

/** What a bill is to one member. */
type OwnSide =
  | { kind: 'none' }
  /** They paid it: the others owe them their shares. */
  | { kind: 'paid'; total: number; selfShare: number; others: AlbumShare[] }
  /** Someone else paid it: they owe that member their own share. */
  | { kind: 'owes'; selfShare: number; payer: AlbumShare; others: AlbumShare[] };

export function ownSide(bill: Bill, selfId: string | null): OwnSide {
  if (!selfId) return { kind: 'none' };
  const shareOf = (memberId: string) =>
    normalizeMoneyAmount(
      bill.shares
        .filter((share) => share.memberId === memberId)
        .reduce((sum, share) => sum + share.amount, 0),
    );
  const selfShare = shareOf(selfId);
  const members = [...new Set(bill.shares.map((share) => share.memberId))];
  if (bill.paidBy === selfId) {
    return {
      kind: 'paid',
      total: normalizeMoneyAmount(bill.amount),
      selfShare,
      others: members
        .filter((memberId) => memberId !== selfId)
        .map((memberId) => ({ memberId, amount: shareOf(memberId) }))
        .filter((share) => share.amount > 0),
    };
  }
  if (!(selfShare > 0)) return { kind: 'none' };
  return {
    kind: 'owes',
    selfShare,
    payer: { memberId: bill.paidBy, amount: shareOf(bill.paidBy) },
    others: members
      .filter((memberId) => memberId !== selfId && memberId !== bill.paidBy)
      .map((memberId) => ({ memberId, amount: shareOf(memberId) }))
      .filter((share) => share.amount > 0),
  };
}

/** A settlement as it counts toward a share: never more than was still owed. */
interface CountedPayment {
  settlementId: string;
  amount: number;
  /** When it was recorded, which is when the share was paid. */
  paidAt: string;
  /** The day the money moved. */
  date: string;
}

/**
 * The live settlements for `bill` from `fromMember` to `toMember`, oldest
 * first, each cut to what the share still owed when it came: a payment past
 * the share (an edit lowered it since) counts for nothing.
 */
function countedPayments(
  bill: Bill,
  settlements: readonly Payment[],
  fromMember: string,
  toMember: string,
  share: number,
): { payments: CountedPayment[]; left: number } {
  let left = cents(share);
  const payments: CountedPayment[] = [];
  const mine = settlements
    .filter(
      (item) =>
        !item.deletedAt &&
        item.expenseId === bill.id &&
        item.fromMember === fromMember &&
        item.toMember === toMember,
    )
    .sort((a, b) =>
      a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.id < b.id ? -1 : 1,
    );
  for (const item of mine) {
    const amount = Math.min(left, Math.max(0, cents(item.amount)));
    if (amount <= 0) continue;
    left -= amount;
    payments.push({
      settlementId: item.id,
      amount: amount / 100,
      paidAt: item.createdAt,
      date: item.date,
    });
  }
  return { payments, left: left / 100 };
}

/** What `fromMember` still owes `toMember` of a `share` of `bill`, after the payments on it. */
export function shareLeft(
  bill: Bill,
  settlements: readonly Payment[],
  fromMember: string,
  toMember: string,
  share: number,
): number {
  return countedPayments(bill, settlements, fromMember, toMember, share).left;
}

/** A split row of the user's own side of a bill, before the phone's own choices (accounts). */
interface LocalSplitRow {
  /** What the row is, for finding the row a phone already has. */
  role: 'self' | 'member' | 'payment';
  /** The member the row is with; null on the Me row. */
  memberId: string | null;
  /** `payment` rows: the member row they are a part of. */
  partOf: string | null;
  amount: number;
  isPayer: boolean;
  shareAmount: number | null;
  paidAt: string | null;
  settlementId: string | null;
}

/** A payment as the user's ledger has to show it. */
export interface LocalPayment {
  settlementId: string;
  memberId: string;
  amount: number;
  paidAt: string;
  date: string;
  /**
   * `received`: a member paid the user back (a transfer when it went to
   * another account than the bill's). `sent_part`: the user paid part of
   * their share (its own expense). `sent_final`: the user paid the last of it
   * (the bill itself takes the account).
   */
  kind: 'received' | 'sent_part' | 'sent_final';
}

/** The user's own side of a bill, as rows. */
interface LocalBill {
  kind: 'paid' | 'owes';
  /** The expense's amount now: what is left of it after the payments. */
  amount: number;
  /** `owes`: the user has paid all of it, so the bill is on an account. */
  settled: boolean;
  splits: LocalSplitRow[];
  payments: LocalPayment[];
}

/**
 * The user's own side of `bill` after `settlements`, or null when they have
 * no part in it. See the file comment for what each kind looks like.
 */
export function localBill(
  bill: Bill,
  settlements: readonly Payment[],
  selfId: string | null,
): LocalBill | null {
  const side = ownSide(bill, selfId);
  if (side.kind === 'none' || !selfId) return null;

  if (side.kind === 'paid') {
    const splits: LocalSplitRow[] = [
      {
        role: 'self',
        memberId: null,
        partOf: null,
        amount: side.selfShare,
        isPayer: false,
        shareAmount: null,
        paidAt: null,
        settlementId: null,
      },
    ];
    const payments: LocalPayment[] = [];
    let received = 0;
    for (const other of side.others) {
      const counted = countedPayments(bill, settlements, other.memberId, selfId, other.amount);
      // The last payment of a share paid in full is the share's own row, as
      // Mark paid leaves it; every payment before it is a part beside it.
      const final = counted.left > 0 ? null : (counted.payments.at(-1) ?? null);
      splits.push({
        role: 'member',
        memberId: other.memberId,
        partOf: null,
        amount: final ? final.amount : counted.left,
        isPayer: false,
        shareAmount: null,
        paidAt: final?.paidAt ?? null,
        settlementId: final?.settlementId ?? null,
      });
      for (const payment of counted.payments) {
        received += cents(payment.amount);
        payments.push({ ...payment, memberId: other.memberId, kind: 'received' });
        if (payment === final) continue;
        splits.push({
          role: 'payment',
          memberId: other.memberId,
          partOf: other.memberId,
          amount: payment.amount,
          isPayer: false,
          shareAmount: null,
          paidAt: payment.paidAt,
          settlementId: payment.settlementId,
        });
      }
    }
    return {
      kind: 'paid',
      amount: Math.max(0, cents(side.total) - received) / 100,
      settled: false,
      splits,
      payments,
    };
  }

  const counted = countedPayments(bill, settlements, selfId, side.payer.memberId, side.selfShare);
  const final = counted.left > 0 ? null : (counted.payments.at(-1) ?? null);
  // What is left on the bill: still owed, or the last payment once it is paid.
  const amount = final ? final.amount : counted.left;
  const splits: LocalSplitRow[] = [
    {
      role: 'self',
      memberId: null,
      partOf: null,
      amount,
      isPayer: false,
      shareAmount: null,
      paidAt: null,
      settlementId: null,
    },
    {
      role: 'member',
      memberId: side.payer.memberId,
      partOf: null,
      amount: 0,
      isPayer: true,
      shareAmount: side.payer.amount,
      paidAt: final?.paidAt ?? null,
      settlementId: final?.settlementId ?? null,
    },
    ...side.others.map(
      (other): LocalSplitRow => ({
        role: 'member',
        memberId: other.memberId,
        partOf: null,
        amount: 0,
        isPayer: false,
        shareAmount: other.amount,
        paidAt: null,
        settlementId: null,
      }),
    ),
  ];
  const payments: LocalPayment[] = [];
  for (const payment of counted.payments) {
    payments.push({
      ...payment,
      memberId: side.payer.memberId,
      kind: payment === final ? 'sent_final' : 'sent_part',
    });
    if (payment === final) continue;
    splits.push({
      role: 'payment',
      memberId: side.payer.memberId,
      partOf: side.payer.memberId,
      amount: 0,
      isPayer: false,
      shareAmount: payment.amount,
      paidAt: payment.paidAt,
      settlementId: payment.settlementId,
    });
  }
  return { kind: 'owes', amount, settled: final !== null, splits, payments };
}

// ---------------------------------------------------------------------------
// The whole group

type LiveBill = Pick<
  AlbumExpense,
  'id' | 'amount' | 'currency' | 'paidBy' | 'shares' | 'deletedAt'
>;
/** A group's spending in one currency, and one member's part in it. */
export interface GroupSpending {
  total: number;
  /** What the member paid for the group's bills. */
  selfPaid: number;
  /** What the bills cost the member: their own shares. */
  selfShare: number;
}

/** What the group spent, and what one member paid and their share of it, per currency. */
export function groupTotals(
  expenses: readonly LiveBill[],
  selfId: string | null,
): Map<string, GroupSpending> {
  const totals = new Map<string, GroupSpending>();
  for (const bill of expenses) {
    if (bill.deletedAt) continue;
    const entry = totals.get(bill.currency) ?? { total: 0, selfPaid: 0, selfShare: 0 };
    entry.total = normalizeMoneyAmount(entry.total + bill.amount);
    if (bill.paidBy === selfId) entry.selfPaid = normalizeMoneyAmount(entry.selfPaid + bill.amount);
    for (const share of bill.shares) {
      if (share.memberId === selfId) {
        entry.selfShare = normalizeMoneyAmount(entry.selfShare + share.amount);
      }
    }
    totals.set(bill.currency, entry);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// From an album's own split bill to the group's (when an album is shared)

/** A payment already on a split bill, as the settlement it becomes. */
interface LocalBillPayment {
  /** The paid row that holds it, which is then stamped with the settlement. */
  splitId: string;
  fromMember: string;
  toMember: string;
  amount: number;
  paidAt: string;
}

/**
 * The group's bill for a split bill the user already has, with the payments
 * on it, so that `localBill` of the result gives the same rows back.
 * `memberOf` names the member a friend's row is with, or null when it has
 * none (a nameless share): such a bill stays the user's own, and null is
 * returned.
 */
export function groupFromLocalBill(
  bill: { amount: number },
  splits: readonly TransactionSplit[],
  selfId: string,
  memberOf: (split: TransactionSplit) => string | null,
): { paidBy: string; shares: AlbumShare[]; amount: number; payments: LocalBillPayment[] } | null {
  const friends = splits.filter((split) => !split.isSelf);
  if (!friends.length) return null;
  const rows: GroupBillRow[] = [];
  const payments: LocalBillPayment[] = [];

  const owed = owedToPayer([...splits], bill.amount);
  if (owed) {
    // A friend paid: the bill is what is left of the user's share, the parts
    // paid are beside the payer's row, and the friends hold their shares.
    const payerRow = friends.find((split) => split.id === owed.splitId);
    const payerId = payerRow ? memberOf(payerRow) : null;
    if (!payerRow || !payerId) return null;
    rows.push({ memberId: selfId, amount: owed.total });
    for (const split of friends) {
      if (split.partOfSplitId) continue;
      const memberId = memberOf(split);
      if (!memberId) return null;
      rows.push({
        memberId,
        amount: split.shareAmount ?? 0,
        isPayer: split.id === payerRow.id,
      });
    }
    for (const part of owed.payments) {
      payments.push({
        splitId: part.splitId,
        fromMember: selfId,
        toMember: payerId,
        amount: part.amount,
        paidAt: part.paidAt,
      });
    }
    if (owed.paidAt) {
      payments.push({
        splitId: owed.splitId,
        fromMember: selfId,
        toMember: payerId,
        amount: owed.amount,
        paidAt: owed.paidAt,
      });
    }
  } else {
    // The user paid: every row of a friend's share (what is still owed and
    // each part paid) adds up to the share, and the expense has dropped by
    // what was paid back.
    const memberByShare = new Map<string, string>();
    for (const split of friends) {
      if (split.partOfSplitId) continue;
      const memberId = memberOf(split);
      if (!memberId) return null;
      memberByShare.set(splitShareKey(split), memberId);
    }
    let paidBack = 0;
    let friendsTotal = 0;
    for (const split of friends) {
      const memberId = memberByShare.get(splitShareKey(split)) ?? memberOf(split);
      if (!memberId) return null;
      rows.push({ memberId, amount: split.amount });
      friendsTotal += cents(split.amount);
      if (split.paidAt) {
        paidBack += cents(split.amount);
        payments.push({
          splitId: split.id,
          fromMember: memberId,
          toMember: selfId,
          amount: split.amount,
          paidAt: split.paidAt,
        });
      }
    }
    const self = splits.find((split) => split.isSelf);
    const whole = cents(bill.amount) + paidBack;
    rows.push({
      memberId: selfId,
      amount: self ? self.amount : Math.max(0, whole - friendsTotal) / 100,
    });
  }
  const built = billFromRows(rows, selfId);
  return built ? { ...built, payments } : null;
}

/** Whether a bill that still stands names the member, as its payer or with a share. */
export function memberIsOnBill(expenses: readonly AlbumExpense[], memberId: string): boolean {
  return expenses.some(
    (expense) =>
      !expense.deletedAt &&
      (expense.paidBy === memberId || expense.shares.some((share) => share.memberId === memberId)),
  );
}

/**
 * A shared album's group, as the phone sends it to a page that names
 * `shared-albums` (the app's services/webDashboardAlbumGroups.ts): its
 * members, its bills (deleted ones too) and its activity log. The backup the
 * rest of the dashboard reads holds only the user's own side of each bill
 * (a transaction with `album_group_id`); these say who is in the album, who
 * paid each bill and how it is split between them, and what everyone did.
 * An older app sends none of it: `albumGroupOf` is then null and the album
 * reads as before. Only type imports, so the tests can load it.
 */

import type { WebAlbumActivityRow, WebAlbumBillRow, WebAlbumBillSnapshot, WebAlbumMemberRow, WebAlbumShare } from "./types";

export type AlbumGroupMember = {
  id: string;
  name: string;
  isSelf: boolean;
  /** Still in the album (the app's `isCurrentMember`): only they are put on a bill. */
  current: boolean;
};

export type AlbumGroupBill = {
  id: string;
  date: string;
  note: string | null;
  amount: number;
  currency: string;
  paidBy: string;
  shares: WebAlbumShare[];
  deleted: boolean;
};

export type AlbumGroup = {
  albumId: string;
  /** The user's own member, or null until they are on its list. */
  selfId: string | null;
  /** The live members, the user first, then as the group lists them. */
  members: AlbumGroupMember[];
  bills: Map<string, AlbumGroupBill>;
  /** Newest first, as the app's `listActivity` orders it. */
  activity: WebAlbumActivityRow[];
};

type GroupTables = {
  web_album_members?: WebAlbumMemberRow[];
  web_album_bills?: WebAlbumBillRow[];
  web_album_activity?: WebAlbumActivityRow[];
};

/** An album's group, or null when the phone sent none for it (an older app, or not shared). */
export function albumGroupOf(tables: GroupTables, albumId: string): AlbumGroup | null {
  const rows = (tables.web_album_members ?? []).filter((row) => row && row.album_id === albumId);
  if (!rows.length) return null;
  const members: AlbumGroupMember[] = [...rows]
    .sort((a, b) => Number(!!b.is_self) - Number(!!a.is_self) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({ id: row.id, name: row.name ?? "", isSelf: !!row.is_self, current: !!row.current }));
  const bills = new Map<string, AlbumGroupBill>();
  for (const row of tables.web_album_bills ?? []) {
    if (!row || row.album_id !== albumId || !Array.isArray(row.shares)) continue;
    bills.set(row.id, {
      id: row.id,
      date: row.date,
      note: row.note ?? null,
      amount: row.amount,
      currency: row.currency,
      paidBy: row.paid_by,
      shares: row.shares,
      deleted: !!row.deleted,
    });
  }
  // A patch adds new rows at the end, so the order is made here.
  const activity = (tables.web_album_activity ?? [])
    .filter((row) => row && row.album_id === albumId && typeof row.created_at === "string")
    .sort((a, b) => (a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : (b.sort_order ?? 0) - (a.sort_order ?? 0)));
  return { albumId, selfId: members.find((member) => member.isSelf)?.id ?? null, members, bills, activity };
}

/**
 * The people a bill can be paid by or split with: everyone still in the
 * album, and anyone who left but is already on the bill (the app's `billPeople`).
 */
export function billPeople(group: AlbumGroup, bill: AlbumGroupBill | null): AlbumGroupMember[] {
  const keep = new Set(bill ? [bill.paidBy, ...bill.shares.map((share) => share.memberId)] : []);
  return group.members.filter((member) => member.current || keep.has(member.id));
}

/** An amount in whole cents, which is what the sums are done in. */
export const cents = (value: number) => Math.round(value * 100);

// ---------------------------------------------------------------- activity --

/** What a line needs from the page: words, names and money (the app's `ActivityContext`). */
export type ActivityContext = {
  /** A message under the dashboard's `trips.activity`, with its values. */
  t: (key: string, values?: Record<string, string>) => string;
  selfId: string | null;
  nameOf: (memberId: string | null | undefined) => string;
  money: (amount: number, currency: string) => string;
  day: (date: string) => string;
  /** Whether a bill the user paid still waits for their account. */
  needsAccount: (billId: string) => boolean;
  /** Whether a deleted bill is still deleted (and so can be restored). */
  isDeleted: (billId: string) => boolean;
};

export type ActivityLine = {
  id: string;
  actorId: string | null;
  text: string;
  /** How it moved the user's own money, when someone else did it; null otherwise. */
  mine: string | null;
  billId: string | null;
  /** A deleted bill that can be brought back from here. */
  restorable: boolean;
  createdAt: string;
};

const shareOf = (bill: WebAlbumBillSnapshot | null, memberId: string | null) =>
  !bill || !memberId ? 0 : bill.shares.filter((share) => share.memberId === memberId).reduce((sum, share) => sum + share.amount, 0);

const sameShares = (a: WebAlbumBillSnapshot, b: WebAlbumBillSnapshot) => {
  const key = (bill: WebAlbumBillSnapshot) =>
    bill.shares
      .map((share) => `${share.memberId}:${cents(share.amount)}`)
      .sort()
      .join(",");
  return key(a) === key(b);
};

function myPart(bill: WebAlbumBillSnapshot | null, selfId: string | null) {
  return { share: shareOf(bill, selfId), paid: !!bill && !!selfId && bill.paidBy === selfId };
}

/**
 * One activity entry as a line, worded as the app's Activity tab words it
 * (features/albums/lib/activityLines.ts `describeActivity`, the same rules
 * and the same message names): a change someone else made to the user's own
 * money gets a second line saying how.
 */
export function describeActivity(entry: WebAlbumActivityRow, ctx: ActivityContext): ActivityLine {
  const { t } = ctx;
  const actorId = entry.actor_member_id ?? null;
  const billId = entry.expense_id ?? null;
  const byMe = !!ctx.selfId && actorId === ctx.selfId;
  const who = (memberId: string | null | undefined, capital = true) => (memberId && memberId === ctx.selfId ? t(capital ? "you" : "you_lower") : ctx.nameOf(memberId));
  const actor = who(actorId);
  const bill = entry.bill?.after ?? entry.bill?.before ?? null;
  const title = bill?.note?.trim() || t("untitled");
  const line = (text: string, mine: string | null = null): ActivityLine => ({
    id: entry.id,
    actorId,
    text,
    // Only someone else's change is news about the user's money.
    mine: byMe ? null : mine,
    billId,
    restorable: entry.kind === "bill_deleted" && !!billId && ctx.isDeleted(billId),
    createdAt: entry.created_at,
  });

  switch (entry.kind) {
    case "bill_added":
    case "bill_restored": {
      const after = entry.bill?.after ?? null;
      if (!after) return line(t("changed_bill", { actor, title }));
      const mine = myPart(after, ctx.selfId);
      const money = ctx.money(after.amount, after.currency);
      // Someone else saying the user paid: the account is the user's to give.
      if (mine.paid && !byMe) {
        return line(
          t(entry.kind === "bill_added" ? "said_you_paid" : "restored", { actor, title, money }),
          billId && ctx.needsAccount(billId) ? t("choose_account") : t("your_share", { money: ctx.money(mine.share, after.currency) }),
        );
      }
      return line(t(entry.kind === "bill_added" ? "added" : "restored", { actor, title, money }), mine.share > 0 ? t("your_share", { money: ctx.money(mine.share, after.currency) }) : null);
    }
    case "bill_deleted": {
      const before = entry.bill?.before ?? null;
      const money = before ? ctx.money(before.amount, before.currency) : "";
      const mine = myPart(before, ctx.selfId);
      return line(t("deleted", { actor, title, money }), before && (mine.share > 0 || mine.paid) ? t("your_share_gone", { money: ctx.money(mine.share, before.currency) }) : null);
    }
    case "bill_edited": {
      const before = entry.bill?.before ?? null;
      const after = entry.bill?.after ?? null;
      if (!before || !after) return line(t("changed_bill", { actor, title }));
      const fmt = (amount: number) => ctx.money(amount, after.currency);
      let text: string;
      if (cents(before.amount) !== cents(after.amount) || before.currency !== after.currency) {
        text = t("changed_amount", { actor, title, before: ctx.money(before.amount, before.currency), after: fmt(after.amount) });
      } else if (before.paidBy !== after.paidBy) {
        text = t("changed_payer", { actor, title, before: who(before.paidBy, false), after: who(after.paidBy, false) });
      } else if (!sameShares(before, after)) {
        text = t("changed_split", { actor, title });
      } else if ((before.note ?? "") !== (after.note ?? "")) {
        text = t("renamed_bill", { actor, before: before.note?.trim() || t("untitled"), after: title });
      } else if (before.date !== after.date) {
        text = t("moved_bill", { actor, title, day: ctx.day(after.date) });
      } else {
        text = t("changed_bill", { actor, title });
      }
      // How it moved the user's money: who paid first, then their share.
      const was = myPart(before, ctx.selfId);
      const now = myPart(after, ctx.selfId);
      let mine: string | null = null;
      if (!was.paid && now.paid) {
        mine = billId && ctx.needsAccount(billId) ? t("you_paid_choose_account") : t("you_paid");
      } else if (was.paid && !now.paid) {
        mine = t("they_paid", { name: who(after.paidBy) });
      } else if (cents(was.share) !== cents(now.share)) {
        mine = now.share > 0 ? t("your_share_change", { before: fmt(was.share), after: fmt(now.share) }) : t("your_share_gone", { money: fmt(was.share) });
      }
      return line(text, mine);
    }
    case "payment_recorded":
    case "payment_undone": {
      const payment = entry.payment;
      if (!payment) return line(t("changed_bill", { actor, title }));
      const values = { actor, from: who(payment.from), to: who(payment.to, false), money: ctx.money(payment.amount, payment.currency) };
      const involvesMe = payment.from === ctx.selfId || payment.to === ctx.selfId;
      if (entry.kind === "payment_undone") return line(t("undid_payment", values), involvesMe ? t("recorded_by", { actor }) : null);
      return line(t(payment.even ? "paid_even" : "paid", values), involvesMe ? t("recorded_by", { actor }) : null);
    }
    case "member_joined":
      return line(t("joined", { name: who(entry.member_id) }));
    case "member_left":
      return line(t("left", { name: who(entry.member_id) }));
    case "member_renamed":
      return line(t("renamed_member", { before: entry.rename?.before ?? "", after: entry.rename?.after ?? "" }));
    case "simplify_changed":
      return line(t(entry.simplify ? "simplify_on" : "simplify_off", { actor }));
    case "cover_changed":
      return line(t("cover", { actor }));
    default:
      // A kind from a later app: said plainly rather than left out.
      return line(t("changed_album", { actor }));
  }
}

export type ActivityDay = { day: string; lines: ActivityLine[] };

/** The lines grouped by the day they happened on, newest day first (the lines already are). */
export function groupActivityByDay(lines: readonly ActivityLine[], dayOf: (iso: string) => string): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const line of lines) {
    const day = dayOf(line.createdAt);
    const last = days.at(-1);
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  return days;
}

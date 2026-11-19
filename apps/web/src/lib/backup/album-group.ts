/**
 * A shared album's group, as the phone sends it to a page that names
 * `shared-albums` (the app's services/webDashboardAlbumGroups.ts): its
 * members, its bills (deleted ones too) and its activity log. The backup the
 * rest of the dashboard reads holds only the user's own side of each bill
 * (a transaction with `album_group_id`); these say who is in the album, who
 * paid each bill and how it is split between them, and what everyone did.
 * An older app sends none of it: `albumGroupOf` is then null and the album
 * reads as before. Its imports end in `.ts`, so the tests can load it.
 */

import { ALBUM_CATEGORY_ICON, DEFAULT_ALBUM_CATEGORY_LIST, isAlbumCategoryKey, isDefaultAlbumCategoryKey, type AlbumCategoryDef, type AlbumCategoryKey } from "../album/categories.ts";
import type { WebAlbumActivityRow, WebAlbumBillRow, WebAlbumBillSnapshot, WebAlbumCategoryRow, WebAlbumMemberRow, WebAlbumSettlementRow, WebAlbumShare } from "./types";

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
  /** Its album category, the same for everyone (Other for one the album no longer has); null from an older app, which does not send it. */
  category: AlbumCategoryKey | null;
  paidBy: string;
  shares: WebAlbumShare[];
  deleted: boolean;
};

export type AlbumGroupPayment = {
  id: string;
  expenseId: string | null;
  fromMember: string;
  toMember: string;
  amount: number;
  currency: string;
  deleted: false;
};

export type AlbumGroup = {
  albumId: string;
  /** The user's own member, or null until they are on its list. */
  selfId: string | null;
  /** The live members, the user first, then as the group lists them. */
  members: AlbumGroupMember[];
  bills: Map<string, AlbumGroupBill>;
  /** The payments that stand; null when the phone sent none (an older app). */
  settlements: AlbumGroupPayment[] | null;
  /** Newest first, as the app's `listActivity` orders it. */
  activity: WebAlbumActivityRow[];
  /** The album's categories, in order; the eight defaults from an older app, which does not send them. */
  categories: AlbumCategoryDef[];
};

type GroupTables = {
  web_album_members?: WebAlbumMemberRow[];
  web_album_bills?: WebAlbumBillRow[];
  web_album_settlements?: WebAlbumSettlementRow[];
  web_album_activity?: WebAlbumActivityRow[];
  web_album_categories?: WebAlbumCategoryRow[];
};

/**
 * An album's categories as the phone sent them, in order: the list it worked
 * out (`listGroupCategories`, a removed default already left out), each row
 * checked again as anything of a group is, with Other always there. The
 * eight defaults when it sent none (an older app).
 */
export function albumCategoriesOf(tables: Pick<GroupTables, "web_album_categories">, albumId: string): AlbumCategoryDef[] {
  if (!tables.web_album_categories) return [...DEFAULT_ALBUM_CATEGORY_LIST];
  const seen = new Set<string>();
  const list: AlbumCategoryDef[] = [];
  for (const row of tables.web_album_categories) {
    if (!row || row.album_id !== albumId || !isAlbumCategoryKey(row.key) || seen.has(row.key)) continue;
    const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim().slice(0, 40) || null : null;
    if (!name && !isDefaultAlbumCategoryKey(row.key)) continue;
    seen.add(row.key);
    list.push({
      key: row.key,
      name,
      icon: typeof row.icon === "string" && ALBUM_CATEGORY_ICON.test(row.icon) ? row.icon : null,
      sortOrder: typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : list.length,
    });
  }
  // A phone that holds no album's list for this one (not shared there): the defaults.
  if (!list.length) return [...DEFAULT_ALBUM_CATEGORY_LIST];
  if (!seen.has("other")) list.push({ ...DEFAULT_ALBUM_CATEGORY_LIST[DEFAULT_ALBUM_CATEGORY_LIST.length - 1], sortOrder: Number.MAX_SAFE_INTEGER });
  return list.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** An album's group, or null when the phone sent none for it (an older app, or not shared). */
export function albumGroupOf(tables: GroupTables, albumId: string): AlbumGroup | null {
  const rows = (tables.web_album_members ?? []).filter((row) => row && row.album_id === albumId);
  if (!rows.length) return null;
  const members: AlbumGroupMember[] = [...rows]
    .sort((a, b) => Number(!!b.is_self) - Number(!!a.is_self) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({ id: row.id, name: row.name ?? "", isSelf: !!row.is_self, current: !!row.current }));
  const categories = albumCategoriesOf(tables, albumId);
  const keys = new Set(categories.map((category) => category.key));
  const bills = new Map<string, AlbumGroupBill>();
  for (const row of tables.web_album_bills ?? []) {
    if (!row || row.album_id !== albumId || !Array.isArray(row.shares)) continue;
    bills.set(row.id, {
      id: row.id,
      date: row.date,
      note: row.note ?? null,
      amount: row.amount,
      currency: row.currency,
      category: isAlbumCategoryKey(row.category) ? (keys.has(row.category) ? row.category : "other") : null,
      paidBy: row.paid_by,
      shares: row.shares,
      deleted: !!row.deleted,
    });
  }
  // A patch adds new rows at the end, so the order is made here.
  const activity = (tables.web_album_activity ?? [])
    .filter((row) => row && row.album_id === albumId && typeof row.created_at === "string")
    .sort((a, b) => (a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : (b.sort_order ?? 0) - (a.sort_order ?? 0)));
  const settlements = tables.web_album_settlements
    ? tables.web_album_settlements
        .filter((row) => row && row.album_id === albumId && Number.isFinite(row.amount))
        .map((row): AlbumGroupPayment => ({
          id: row.id,
          expenseId: row.expense_id ?? null,
          fromMember: row.from_member,
          toMember: row.to_member,
          amount: row.amount,
          currency: row.currency,
          deleted: false,
        }))
    : null;
  return { albumId, selfId: members.find((member) => member.isSelf)?.id ?? null, members, bills, settlements, activity, categories };
}

/**
 * The people a bill can be paid by or split with: everyone still in the
 * album, and anyone who left but is already on the bill (the app's
 * `billPeople`). For the dashboard's members and the album website's alike.
 */
export function peopleForBill<M extends { id: string }>(members: readonly M[], bill: Pick<AlbumGroupBill, "paidBy" | "shares"> | null, isCurrent: (member: M) => boolean): M[] {
  const keep = new Set(bill ? [bill.paidBy, ...bill.shares.map((share) => share.memberId)] : []);
  return members.filter((member) => isCurrent(member) || keep.has(member.id));
}

/** `peopleForBill` of the dashboard's group. */
export function billPeople(group: AlbumGroup, bill: AlbumGroupBill | null): AlbumGroupMember[] {
  return peopleForBill(group.members, bill, (member) => member.current);
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
  /** An album category's name as the album shows it now (a default's in the page's language). */
  category: (key: AlbumCategoryKey) => string;
  /** A default category's own name in the page's language (Other's for any other key); `category` without. */
  defaultCategory?: (key: AlbumCategoryKey) => string;
};

/** How a change moved the user's share: less to pay (`in`) or more (`out`). */
export type MineTone = "in" | "out";

/** The chip a `mine` note sits in, as the app draws it: green for a smaller share, rose for a bigger one. */
export const MINE_CHIP_CLASS: Record<MineTone, string> = {
  in: "bg-success-soft text-success",
  out: "bg-primary-soft text-primary",
};

export type ActivityLine = {
  id: string;
  actorId: string | null;
  text: string;
  /** How it moved the user's share, when someone else did it; null otherwise. */
  mine: string | null;
  /** Which way the share moved (meaningless while `mine` is null). */
  tone: MineTone;
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
 * share gets a short note of how ("Your share RM30 → RM40"), with which way
 * it moved.
 */
export function describeActivity(entry: WebAlbumActivityRow, ctx: ActivityContext): ActivityLine {
  const { t } = ctx;
  const actorId = entry.actor_member_id ?? null;
  const byMe = !!ctx.selfId && actorId === ctx.selfId;
  const who = (memberId: string | null | undefined, capital = true) => (memberId && memberId === ctx.selfId ? t(capital ? "you" : "you_lower") : ctx.nameOf(memberId));
  const actor = who(actorId);
  const bill = entry.bill?.after ?? entry.bill?.before ?? null;
  const title = bill?.note?.trim() || t("untitled");
  const line = (text: string, mine: string | null = null, tone: MineTone = "out"): ActivityLine => ({
    id: entry.id,
    actorId,
    text,
    // Only someone else's change is news about the user's money.
    mine: byMe ? null : mine,
    tone,
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
          t("your_share", { money: ctx.money(mine.share, after.currency) }),
        );
      }
      return line(t(entry.kind === "bill_added" ? "added" : "restored", { actor, title, money }), mine.share > 0 ? t("your_share", { money: ctx.money(mine.share, after.currency) }) : null);
    }
    case "bill_deleted": {
      const before = entry.bill?.before ?? null;
      const money = before ? ctx.money(before.amount, before.currency) : "";
      const mine = myPart(before, ctx.selfId);
      return line(t("deleted", { actor, title, money }), before && (mine.share > 0 || mine.paid) ? t("your_share_gone", { money: ctx.money(mine.share, before.currency) }) : null, "in");
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
      } else if (isAlbumCategoryKey(after.category) && before.category !== after.category) {
        text = t("recategorized_bill", { actor, title, category: ctx.category(after.category) });
      } else {
        text = t("changed_bill", { actor, title });
      }
      // How it moved the user's share.
      const was = shareOf(before, ctx.selfId);
      const now = shareOf(after, ctx.selfId);
      if (cents(was) === cents(now)) return line(text);
      return line(text, now > 0 ? t("your_share_change", { before: fmt(was), after: fmt(now) }) : t("your_share_gone", { money: fmt(was) }), now > was ? "out" : "in");
    }
    case "payment_recorded":
    case "payment_undone": {
      const payment = entry.payment;
      if (!payment) return line(t("changed_bill", { actor, title }));
      const values = { actor, from: who(payment.from), to: who(payment.to, false), money: ctx.money(payment.amount, payment.currency) };
      if (entry.kind === "payment_undone") {
        // The payer is mid-sentence here: "Tess undid you paying Ben".
        return line(actorId === payment.from ? t("undid_own_payment", values) : t("undid_payment", { ...values, from: who(payment.from, false) }));
      }
      return line(t(payment.even ? "paid_even" : "paid", values));
    }
    case "member_joined":
      return line(t(entry.started ? "started" : "joined", { name: who(entry.member_id) }));
    case "member_left":
      return line(t("left", { name: who(entry.member_id) }));
    case "member_renamed":
      return line(t("renamed_member", { before: entry.rename?.before ?? "", after: entry.rename?.after ?? "" }));
    case "simplify_changed":
      return line(t(entry.simplify ? "simplify_on" : "simplify_off", { actor }));
    case "cover_changed":
      return line(t("cover", { actor }));
    case "category_changed": {
      const change = entry.category;
      if (!change) return line(t("changed_album", { actor }));
      // A name left null is a default's own.
      const nameOf = (look: { name: string | null } | null) => look?.name ?? (ctx.defaultCategory ?? ctx.category)(change.key);
      if (!change.before) return line(t("category_added", { actor, name: nameOf(change.after) }));
      if (!change.after) return line(t("category_removed", { actor, name: nameOf(change.before) }));
      const before = nameOf(change.before);
      const after = nameOf(change.after);
      return line(before === after ? t("category_icon", { actor, name: after }) : t("category_renamed", { actor, before, after }));
    }
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

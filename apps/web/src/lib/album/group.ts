/**
 * A shared album's group as the website reads it (`GET /v1/ledgers/<id>/album`
 * on the cloud-sync Worker, through `/api/album`): its people, bills, payments,
 * settings and activity. Every row is checked here exactly as a phone checks it
 * (the app's `lib/repositories/mappers.ts`, `toAlbumMember` and the rest, and
 * `albumGroupsRepository`'s filter to the group's own members): anyone given the
 * link can write what the rules allow, so nothing is trusted past its shape.
 * Pure, so the tests read it.
 */

import type { WebAlbumActivityRow, WebAlbumBillSnapshot, WebAlbumShare } from "@/lib/backup/types";

const GROUP_ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A bill's id: the payer's entry id, which may be a recurring run's (`rr:<rule>:<day>`). */
const GROUP_BILL_ID = /^[A-Za-z0-9_:.-]{1,120}$/;
/** A payment's id: a plain id, or one of a batch recorded together (`<batch>.<n>`). */
const GROUP_SETTLEMENT_ID = /^[A-Za-z0-9_-]{1,64}(\.\d{1,4})?$/;
const GROUP_CURRENCY = /^[A-Z][A-Z0-9]{1,9}$/;
const GROUP_DAY = /^(\d{4})-(\d{2})-(\d{2})(T[0-9:.Z+-]{1,30})?$/;
const MAX_AMOUNT = 1e12;
export const MAX_NAME = 40;
export const MAX_NOTE = 500;
const MAX_LABEL = 80;
const MAX_SHARES = 64;
/** A group is read no further than this many member rows, as on a phone. */
const MAX_MEMBER_ROWS = 200;

export type Role = "owner" | "member";

/** The share as the Worker describes it (its `LedgerView`). */
export type AlbumView = {
  /** The share's id: what the API's routes name. */
  id: string;
  /** The album's id, which is the group's. */
  ledgerId: string;
  name: string;
  role: Role;
  ownerId: string;
  ownerName: string;
  memberCount: number;
};

export type Member = {
  id: string;
  name: string;
  /** The account that joined; null once they left (or were taken out). */
  userId: string | null;
  sortOrder: number;
};

export type Share = WebAlbumShare;

export type Bill = {
  id: string;
  date: string;
  note: string | null;
  amount: number;
  currency: string;
  categoryName: string | null;
  categoryIcon: string | null;
  paidBy: string;
  shares: Share[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
  deleted: boolean;
};

export type Payment = {
  id: string;
  expenseId: string | null;
  fromMember: string;
  toMember: string;
  amount: number;
  currency: string;
  date: string;
  createdBy: string | null;
  createdAt: string;
  deleted: boolean;
};

export type Group = {
  album: AlbumView;
  /** The signed-in account. */
  userId: string;
  /** The user's own member, or null before they are on the list (or after they left). */
  selfId: string | null;
  /** Everyone who ever joined, in the group's order (the user is not moved). */
  members: Member[];
  /** Live and deleted bills: a deleted bill's payments still count. */
  bills: Bill[];
  payments: Payment[];
  simplify: boolean;
  /** `album-covers/<id>.<ext>`, or null while there is none. */
  cover: string | null;
  /** Newest first, in the shape the dashboard's activity lines read (`describeActivity`). */
  activity: WebAlbumActivityRow[];
};

type Row = Record<string, unknown>;
type RawRow = { table?: unknown; id?: unknown; data?: unknown };

const isText = (value: unknown): value is string => typeof value === "string";
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;
const isTimestamp = (value: unknown): value is string => isText(value) && value.length <= 40 && !Number.isNaN(Date.parse(value));
const clip = (value: unknown, max: number): string | null => (isText(value) ? value.slice(0, max) : null);

function groupDay(value: unknown): string | null {
  const match = isText(value) ? GROUP_DAY.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** `shares_json`: each member's share, one per member; null when it is not that. */
function parseShares(value: unknown): Share[] | null {
  let parsed: unknown = value;
  if (isText(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (parsed == null) return [];
  if (!Array.isArray(parsed) || parsed.length > MAX_SHARES) return null;
  const shares: Share[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const entry = item as { memberId?: unknown; amount?: unknown } | null;
    const memberId = entry?.memberId;
    if (!isText(memberId) || !GROUP_ROW_ID.test(memberId) || !isAmount(entry?.amount) || seen.has(memberId)) return null;
    seen.add(memberId);
    shares.push({ memberId, amount: entry.amount });
  }
  return shares;
}

export function cleanName(value: unknown): string | null {
  return isText(value) ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || null : null;
}

function toMember(row: Row): Member | null {
  const name = cleanName(row.name);
  const id = row.id;
  if (!isText(id) || !GROUP_ROW_ID.test(id) || id === "self" || !name) return null;
  if (row.user_id != null && !(isText(row.user_id) && GROUP_ROW_ID.test(row.user_id))) return null;
  if (!isTimestamp(row.created_at)) return null;
  return {
    id,
    name,
    // A deleted row is someone out of the album, as a left one is.
    userId: isText(row.user_id) && row.deleted_at == null ? row.user_id : null,
    sortOrder: typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : 0,
  };
}

function toBill(row: Row): Bill | null {
  const shares = parseShares(row.shares_json);
  const date = groupDay(row.date);
  if (
    !shares ||
    !date ||
    !isText(row.id) ||
    !GROUP_BILL_ID.test(row.id) ||
    !isText(row.paid_by) ||
    !GROUP_ROW_ID.test(row.paid_by) ||
    !isAmount(row.amount) ||
    !isText(row.currency) ||
    !GROUP_CURRENCY.test(row.currency) ||
    !isTimestamp(row.created_at)
  ) {
    return null;
  }
  return {
    id: row.id,
    date,
    note: clip(row.note, MAX_NOTE),
    amount: row.amount,
    currency: row.currency,
    categoryName: clip(row.category_name, MAX_LABEL),
    categoryIcon: clip(row.category_icon, MAX_LABEL),
    paidBy: row.paid_by,
    shares,
    createdBy: isText(row.created_by) ? row.created_by : null,
    createdAt: row.created_at,
    updatedAt: isText(row.updated_at) ? row.updated_at : null,
    deleted: row.deleted_at != null,
  };
}

function toPayment(row: Row): Payment | null {
  const date = groupDay(row.date);
  if (
    !date ||
    !isText(row.id) ||
    !GROUP_SETTLEMENT_ID.test(row.id) ||
    (row.expense_id != null && !(isText(row.expense_id) && GROUP_BILL_ID.test(row.expense_id))) ||
    !isText(row.from_member) ||
    !GROUP_ROW_ID.test(row.from_member) ||
    !isText(row.to_member) ||
    !GROUP_ROW_ID.test(row.to_member) ||
    row.from_member === row.to_member ||
    !isAmount(row.amount) ||
    !isText(row.currency) ||
    !GROUP_CURRENCY.test(row.currency) ||
    !isTimestamp(row.created_at)
  ) {
    return null;
  }
  return {
    id: row.id,
    expenseId: isText(row.expense_id) ? row.expense_id : null,
    fromMember: row.from_member,
    toMember: row.to_member,
    amount: row.amount,
    currency: row.currency,
    date,
    createdBy: isText(row.created_by) ? row.created_by : null,
    createdAt: row.created_at,
    deleted: row.deleted_at != null,
  };
}

const ACTIVITY_KINDS = new Set([
  "bill_added",
  "bill_edited",
  "bill_deleted",
  "bill_restored",
  "payment_recorded",
  "payment_undone",
  "member_joined",
  "member_left",
  "member_renamed",
  "simplify_changed",
  "cover_changed",
]);

function snapshot(value: unknown): WebAlbumBillSnapshot | null {
  const raw = value as Row | null;
  if (!raw || typeof raw !== "object") return null;
  const shares = parseShares(raw.shares ?? []);
  const date = groupDay(raw.date);
  if (!shares || !date || !isAmount(raw.amount) || !isText(raw.currency) || !GROUP_CURRENCY.test(raw.currency) || !isText(raw.paidBy) || !GROUP_ROW_ID.test(raw.paidBy)) {
    return null;
  }
  return { note: clip(raw.note, MAX_NOTE), amount: raw.amount, currency: raw.currency, date, paidBy: raw.paidBy, shares };
}

/** A log entry as the dashboard's activity lines read it; null when it is not one this page can show. */
function toActivity(row: Row, albumId: string): WebAlbumActivityRow | null {
  const kind = row.kind;
  if (!isText(row.id) || !GROUP_ROW_ID.test(row.id) || !isText(kind) || !ACTIVITY_KINDS.has(kind) || !isTimestamp(row.created_at)) return null;
  let data: Row = {};
  try {
    const parsed: unknown = isText(row.data_json) ? JSON.parse(row.data_json) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Row;
  } catch {
    return null;
  }
  const nameOf = (value: unknown) => {
    const name = (value as { name?: unknown } | null)?.name;
    return isText(name) ? name.slice(0, MAX_NAME) : null;
  };
  const entry: WebAlbumActivityRow = {
    id: row.id,
    album_id: albumId,
    kind,
    actor_member_id: isText(row.actor_member_id) ? row.actor_member_id : null,
    expense_id: isText(row.expense_id) && GROUP_BILL_ID.test(row.expense_id) ? row.expense_id : null,
    member_id: isText(row.member_id) ? row.member_id : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: row.created_at,
  };
  if (kind.startsWith("bill_")) {
    const bill = { before: snapshot(data.before), after: snapshot(data.after) };
    if (!bill.before && !bill.after) return null;
    entry.bill = bill;
  } else if (kind === "member_renamed") {
    const before = nameOf(data.before);
    const after = nameOf(data.after);
    if (!before || !after) return null;
    entry.rename = { before, after };
  } else if (kind === "payment_recorded" || kind === "payment_undone") {
    const { from, to, currency, amount } = data;
    if (!isText(from) || !isText(to) || !isText(currency) || !GROUP_CURRENCY.test(currency) || !isAmount(amount)) return null;
    entry.payment = {
      from,
      to,
      currency,
      amount,
      bills: Array.isArray(data.bills) ? data.bills.filter((id): id is string => isText(id) && GROUP_BILL_ID.test(id)) : [],
      even: data.even === true,
    };
  } else if (kind === "simplify_changed") {
    entry.simplify = (data.after as { on?: unknown } | undefined)?.on === true;
  } else if (kind === "member_joined") {
    entry.started = data.started === true;
  }
  return entry;
}

function toView(value: unknown): AlbumView | null {
  const raw = value as Row | null;
  if (!raw || typeof raw !== "object") return null;
  const { id, ledgerId, name, role, ownerId, ownerName, memberCount } = raw;
  if (!isText(id) || !isText(ledgerId) || !isText(ownerId)) return null;
  return {
    id,
    ledgerId,
    name: isText(name) && name.trim() ? name.trim().slice(0, 60) : "",
    role: role === "owner" ? "owner" : "member",
    ownerId,
    ownerName: isText(ownerName) ? ownerName.slice(0, 80) : "",
    memberCount: typeof memberCount === "number" && Number.isFinite(memberCount) ? memberCount : 0,
  };
}

/** The share list's albums (`GET /v1/ledgers?albums=1`), shared ledgers left out. */
export function albumsOf(body: unknown): AlbumView[] {
  const list = (body as { ledgers?: unknown } | null)?.ledgers;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if ((item as Row | null)?.kind !== "album") return [];
    const view = toView(item);
    return view ? [view] : [];
  });
}

/** The group from the Worker's answer; null when the answer is not one. */
export function parseGroup(body: unknown): Group | null {
  const raw = body as { album?: unknown; userId?: unknown; rows?: unknown } | null;
  const album = toView(raw?.album);
  if (!album || !isText(raw?.userId) || !Array.isArray(raw.rows)) return null;
  const groupId = album.ledgerId;
  const byTable = new Map<string, Row[]>();
  for (const item of raw.rows as RawRow[]) {
    const data = item?.data as Row | null;
    if (!isText(item?.table) || !data || typeof data !== "object") continue;
    // A row of another group's (its `ledger_id` says) is not this album's.
    if (data.ledger_id != null && data.ledger_id !== groupId) continue;
    const list = byTable.get(item.table) ?? [];
    list.push(data);
    byTable.set(item.table, list);
  }
  const rows = (table: string) => byTable.get(table) ?? [];

  const members = rows("album_members")
    .slice(0, MAX_MEMBER_ROWS)
    .map(toMember)
    .filter((member): member is Member => member !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  const memberIds = new Set(members.map((member) => member.id));
  // Paid by, shared with and paid between the group's members only.
  const bills = rows("album_expenses")
    .map(toBill)
    .filter((bill): bill is Bill => !!bill && memberIds.has(bill.paidBy) && bill.shares.every((share) => memberIds.has(share.memberId)));
  const payments = rows("album_settlements")
    .map(toPayment)
    .filter((payment): payment is Payment => !!payment && memberIds.has(payment.fromMember) && memberIds.has(payment.toMember));
  const settings = rows("album_groups").find((row) => row.id === groupId && row.deleted_at == null) ?? null;
  const cover = settings && isText(settings.cover_photo_uri) && /^album-covers\/[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,5}$/.test(settings.cover_photo_uri) ? settings.cover_photo_uri : null;
  const activity = rows("album_activity")
    .map((row) => toActivity(row, groupId))
    .filter((entry): entry is WebAlbumActivityRow => entry !== null)
    .sort((a, b) => (a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : (b.sort_order ?? 0) - (a.sort_order ?? 0)));

  return {
    album,
    userId: raw.userId,
    selfId: members.find((member) => member.userId === raw.userId)?.id ?? null,
    members,
    bills,
    payments,
    simplify: settings ? settings.simplify_debts === 1 || settings.simplify_debts === true : false,
    cover,
    activity,
  };
}

/** Whether a member is still in the album (the app's `isCurrentMember`). */
export const isCurrent = (member: Member | undefined | null): boolean => !!member?.userId;

/**
 * The people a bill can be paid by or split with: everyone still in the album,
 * and anyone who left but is already on the bill (the app's `billPeople`).
 */
export function billPeople(members: readonly Member[], bill: Bill | null): Member[] {
  const keep = new Set(bill ? [bill.paidBy, ...bill.shares.map((share) => share.memberId)] : []);
  return members.filter((member) => isCurrent(member) || keep.has(member.id));
}

/** Whether any payment still stands on a bill: changing or deleting it then asks first. */
export function billHasPayments(payments: readonly Payment[], billId: string): boolean {
  return payments.some((payment) => !payment.deleted && payment.expenseId === billId);
}

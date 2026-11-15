// What a change to a shared album's group writes: checked, stamped with who
// made it, with its entries in the album's activity log. Pure and with no
// imports, as the one set of rules for every writer: the app applies a plan
// to its own copy of the group, which Cloud Sync then sends to the album's
// database (features/albums/services/albumGroupWrites.ts), and the cloud-sync
// Worker writes one there itself for someone joining or leaving, or for the
// website, from a copy of this file (apps/cloudflare/workers/cloud-sync/src/
// groupPlan.generated.ts, written by `npm run sync:group-plan`; a test fails
// when the two differ). See README.md > Album members and shared albums.
//
// A plan names whole rows, as the app's tables hold them (snake_case
// columns). Every row is last-writer-wins, as Cloud Sync's rows are.

// ---------------------------------------------------------------------------
// Shapes (the app reads them back through lib/repositories/mappers.ts)

/** A member's id, and the account id of someone who joined. */
export const GROUP_ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A bill's id is its payer's entry id, which may be a recurring run's (`rr:<rule>:<day>`). */
export const GROUP_BILL_ID = /^[A-Za-z0-9_:.-]{1,120}$/;
/** A settlement's id: a plain id, or one of a batch recorded together (`<batch>.<n>`). */
export const GROUP_SETTLEMENT_ID = /^[A-Za-z0-9_-]{1,64}(\.\d{1,4})?$/;
export const GROUP_CURRENCY = /^[A-Z][A-Z0-9]{1,9}$/;
const GROUP_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A cover image of the album-cover store: `album-covers/<id>.<ext>`. */
export const GROUP_COVER_PATH = /^album-covers\/[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,5}$/;
const MAX_AMOUNT = 1e12;
const MAX_NAME = 40;
const MAX_NOTE = 500;
const MAX_LABEL = 80;
const MAX_SHARES = 64;
/** More rows than any one act writes (Settle up across every bill of an album, say). */
export const MAX_WRITE_ROWS = 400;
/** Far more member rows than an album ever has (20 people, and those who left). */
export const MAX_MEMBER_ROWS = 200;

export const GROUP_TABLES = [
  'album_members',
  'album_expenses',
  'album_settlements',
  'album_groups',
  'album_activity',
] as const;
export type GroupTable = (typeof GROUP_TABLES)[number];
/** What a change may ask to write: everything but the log, which a plan writes itself. */
const WRITABLE = new Set<string>([
  'album_members',
  'album_expenses',
  'album_settlements',
  'album_groups',
]);

export type Row = Record<string, unknown>;

/** A row of the group as it is now. */
export interface StoredRow {
  table: string;
  id: string;
  data: Row;
}

export interface Member {
  id: string;
  name: string;
  userId: string | null;
  deletedAt: string | null;
}

/** One logged change, as `album_activity.kind` names it. */
export type ActivityKind =
  | 'bill_added'
  | 'bill_edited'
  | 'bill_deleted'
  | 'bill_restored'
  | 'payment_recorded'
  | 'payment_undone'
  | 'member_joined'
  | 'member_left'
  | 'member_renamed'
  | 'simplify_changed'
  | 'cover_changed';

/** A row a change writes, whole: it replaces the row with that id, if there is one. */
export interface PlannedWrite {
  table: GroupTable;
  id: string;
  data: Row;
}

export class GroupWriteError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const isText = (value: unknown): value is string => typeof value === 'string';

function cleanText(value: unknown, max: number): string | null {
  if (!isText(value)) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export function cleanMemberName(value: unknown): string | null {
  return isText(value) ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || null : null;
}

const nameKey = (name: string) => name.toLocaleLowerCase();

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;
}

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => cents(value) / 100;

function groupDay(value: unknown): string | null {
  const match = isText(value) ? GROUP_DAY.exec(value.slice(0, 10)) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

interface Share {
  memberId: string;
  amount: number;
}

function parseShares(value: unknown): Share[] | null {
  let parsed: unknown = value;
  if (isText(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_SHARES) return null;
  const byMember = new Map<string, number>();
  for (const item of parsed) {
    const entry = item as { memberId?: unknown; amount?: unknown } | null;
    const memberId = entry?.memberId;
    if (!isText(memberId) || !GROUP_ROW_ID.test(memberId) || !isAmount(entry?.amount)) return null;
    byMember.set(memberId, (byMember.get(memberId) ?? 0) + cents(entry.amount));
  }
  return [...byMember]
    .filter(([, amount]) => amount > 0)
    .map(([memberId, amount]) => ({ memberId, amount: amount / 100 }));
}

function toMember(row: Row): Member | null {
  const id = row.id;
  const name = cleanMemberName(row.name);
  if (!isText(id) || !GROUP_ROW_ID.test(id) || !name) return null;
  return {
    id,
    name,
    userId: isText(row.user_id) ? row.user_id : null,
    deletedAt: isText(row.deleted_at) ? row.deleted_at : null,
  };
}

/** A bill's fields the log keeps a before and after of. */
interface BillFields {
  note: string | null;
  amount: number;
  currency: string;
  date: string;
  paidBy: string;
  shares: Share[];
}

function billFields(row: Row): BillFields {
  return {
    note: isText(row.note) ? row.note : null,
    amount: typeof row.amount === 'number' ? row.amount : 0,
    currency: isText(row.currency) ? row.currency : '',
    date: isText(row.date) ? row.date : '',
    paidBy: isText(row.paid_by) ? row.paid_by : '',
    shares: parseShares(row.shares_json) ?? [],
  };
}

function sameBill(a: BillFields, b: BillFields): boolean {
  const sharesKey = (shares: Share[]) =>
    shares
      .map((share) => `${share.memberId}:${cents(share.amount)}`)
      .sort()
      .join(',');
  return (
    a.note === b.note &&
    cents(a.amount) === cents(b.amount) &&
    a.currency === b.currency &&
    a.date === b.date &&
    a.paidBy === b.paidBy &&
    sharesKey(a.shares) === sharesKey(b.shares)
  );
}

const live = (row: Row | undefined): row is Row => !!row && row.deleted_at == null;

/** A name nobody else in the group goes by: "Ben", else "Ben 2", "Ben 3"… */
function uniqueName(name: string, members: readonly Member[], selfId?: string): string {
  const taken = new Set(
    members
      .filter((member) => !member.deletedAt && member.id !== selfId)
      .map((member) => nameKey(member.name)),
  );
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Planning a write

/** What a write reads first: the group's members and the rows it names. */
export interface GroupState {
  members: StoredRow[];
  /** The rows the write names (and the bills its payments are for), by `table\0id`. */
  rows: Map<string, StoredRow>;
}

export const rowKey = (table: string, id: string) => `${table}\u0000${id}`;

export interface WriteRequest {
  rows: { table: string; row: Row }[];
  /** Payments the app records on its own to close an even group (Simplify). */
  reason?: 'close_even';
}

interface Activity {
  kind: ActivityKind;
  expenseId?: string | null;
  memberId?: string | null;
  data: Row;
}

export interface Plan {
  writes: PlannedWrite[];
}

export interface PlanContext {
  groupId: string;
  userId: string;
  /** `web`: the writer is on the website (album.money2time.com), not a phone. */
  via?: 'web';
  now: string;
  newId: () => string;
}

/** The prefix of `created_by` on a row written on the website. */
export const WEB_AUTHOR_PREFIX = 'web:';

/**
 * Who a bill or payment says wrote it last (`created_by`): the writer's
 * account, or `web:<account>` when they wrote it on the website. A phone puts
 * a bill on the user's default account only when they wrote it themselves on
 * one of their phones (the app's albumGroupSync.ts compares `created_by` with
 * the user's account), so a bill or payment entered on the website, where
 * nobody has accounts, lands with no account in the app, to be chosen there.
 */
export function authorStamp(ctx: Pick<PlanContext, 'userId' | 'via'>): string {
  return ctx.via === 'web' ? `${WEB_AUTHOR_PREFIX}${ctx.userId}` : ctx.userId;
}

function activityRow(
  ctx: PlanContext,
  actor: Member | null,
  activity: Activity,
  index: number,
): PlannedWrite {
  const id = `${ctx.newId()}`;
  return {
    table: 'album_activity',
    id,
    data: {
      id,
      ledger_id: ctx.groupId,
      kind: activity.kind,
      actor_member_id: actor?.id ?? null,
      actor_user_id: ctx.userId,
      expense_id: activity.expenseId ?? null,
      member_id: activity.memberId ?? null,
      data_json: JSON.stringify(activity.data),
      // Entries of one act keep their order.
      sort_order: index,
      created_at: ctx.now,
      updated_at: ctx.now,
      deleted_at: null,
    },
  };
}

export function membersOf(state: GroupState): Member[] {
  return state.members
    .map((row) => toMember(row.data))
    .filter((member): member is Member => member !== null);
}

/** The writer's own member: joined, and not left. */
export function selfOf(members: readonly Member[], userId: string): Member | null {
  return members.find((member) => member.userId === userId && !member.deletedAt) ?? null;
}

/**
 * A member's row id: made from the album and the account, so two phones of
 * one person write one row, and their rows in two albums never share an id
 * (a phone keeps every album's members in one table).
 */
export function memberRowId(groupId: string, userId: string): string {
  const album = groupId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return `u-${album}-${userId}`.slice(0, 64);
}

/**
 * The user joining (or the owner starting) the album: their own member row,
 * under an id made from the album and their account (`memberRowId`).
 * Joined again after leaving, the row they left takes them back. Someone
 * already in keeps their row; on the website, where joining is where someone
 * says what to call them, they take the name they gave (the app may have put
 * them in first under its default), unless someone else has it. The owner
 * starting it also writes its
 * settings row, with Simplify group debts on: an album starts simplified.
 * `state` must hold that row if it exists (`joinGroup` loads it).
 */
export function planJoin(state: GroupState, ctx: PlanContext, name: string): Plan {
  const members = membersOf(state);
  const already = selfOf(members, ctx.userId);
  if (already) {
    const wanted = ctx.via === 'web' ? cleanMemberName(name) : null;
    const row = state.members.find((stored) => stored.id === already.id);
    if (!wanted || !row || wanted === already.name) return { writes: [] };
    if (uniqueName(wanted, members, already.id) !== wanted) return { writes: [] };
    return {
      writes: [
        {
          table: 'album_members',
          id: already.id,
          data: { ...row.data, name: wanted, updated_at: ctx.now },
        },
        activityRow(
          ctx,
          already,
          {
            kind: 'member_renamed',
            memberId: already.id,
            data: { before: { name: already.name }, after: { name: wanted } },
          },
          0,
        ),
      ],
    };
  }
  const id = memberRowId(ctx.groupId, ctx.userId);
  const stored = state.members.find((row) => row.id === id);
  const sortOrder = state.members.length;
  let data: Row;
  if (stored && stored.data.user_id == null && stored.data.deleted_at == null) {
    data = { ...stored.data, user_id: ctx.userId, updated_at: ctx.now };
  } else {
    const rowId = stored ? ctx.newId() : id;
    data = {
      id: rowId,
      ledger_id: ctx.groupId,
      name: uniqueName(cleanMemberName(name) ?? 'Me', members),
      user_id: ctx.userId,
      sort_order: sortOrder,
      created_at: ctx.now,
      updated_at: ctx.now,
      deleted_at: null,
    };
  }
  const rowId = data.id as string;
  const member: Member = toMember(data)!;
  const writes: PlannedWrite[] = [
    { table: 'album_members', id: rowId, data },
    // The first in starts the album: its log says so.
    activityRow(
      ctx,
      member,
      {
        kind: 'member_joined',
        memberId: rowId,
        data: state.members.length ? {} : { started: true },
      },
      0,
    ),
  ];
  const settings = state.rows.get(rowKey('album_groups', ctx.groupId));
  if (!state.members.length && !settings) {
    writes.push({
      table: 'album_groups',
      id: ctx.groupId,
      data: {
        id: ctx.groupId,
        ledger_id: ctx.groupId,
        simplify_debts: 1,
        cover_photo_uri: null,
        created_at: ctx.now,
        updated_at: ctx.now,
        deleted_at: null,
      },
    });
  }
  return { writes };
}

/**
 * Someone out of the album (they left, or the owner took them out): their
 * row stays, with its bills, but names no account. `ctx.userId`: who did it.
 */
export function planLeave(state: GroupState, ctx: PlanContext, leaverUserId: string): Plan {
  const members = membersOf(state);
  const leaving = state.members.filter(
    (row) => row.data.user_id === leaverUserId && row.data.deleted_at == null,
  );
  if (!leaving.length) return { writes: [] };
  const actor = selfOf(members, ctx.userId) ?? toMember(leaving[0].data);
  const writes: PlannedWrite[] = [];
  leaving.forEach((row, index) => {
    writes.push({
      table: 'album_members',
      id: row.id,
      data: { ...row.data, user_id: null, updated_at: ctx.now },
    });
    writes.push(
      activityRow(ctx, actor, { kind: 'member_left', memberId: row.id, data: {} }, index),
    );
  });
  return { writes };
}

/**
 * The rows a change asks to write, checked and stamped, with their log
 * entries. Throws `GroupWriteError` for anything the album does not allow.
 *
 * - Only someone in the album writes: their member row has their account.
 * - Bills: anyone in it adds, edits or deletes any bill, and restores a
 *   deleted one. Its payer and each share's member are the group's members;
 *   someone who has left stays on the bills they were on, but is never put
 *   on one. Deleting a bill leaves its payments standing.
 * - Payments: anyone in it records one between any two members, on a bill of
 *   the group, or undoes one. A payment is never changed otherwise.
 * - Members: the writer renames themselves, to a name nobody else has.
 * - Settings: Simplify and the cover.
 * - `created_by` is always the writer (`authorStamp`).
 */
export function planWrite(
  state: GroupState,
  ctx: PlanContext,
  request: WriteRequest,
  ownerUserId: string,
): Plan {
  const members = membersOf(state);
  const self = selfOf(members, ctx.userId);
  if (!self) throw new GroupWriteError('not_member', 403);
  const byId = new Map(members.map((member) => [member.id, member]));
  const current = (id: string) => !!byId.get(id)?.userId && !byId.get(id)?.deletedAt;
  const writes = new Map<string, PlannedWrite>();
  const activities: Activity[] = [];
  const stored = (table: string, id: string) => state.rows.get(rowKey(table, id));
  /** What a row is now, counting what this write has already put. */
  const now = (table: string, id: string): Row | undefined =>
    writes.get(rowKey(table, id))?.data ?? stored(table, id)?.data;
  const put = (table: GroupTable, id: string, data: Row) => {
    writes.set(rowKey(table, id), { table, id, data });
  };

  if (!Array.isArray(request.rows) || request.rows.length > MAX_WRITE_ROWS) {
    throw new GroupWriteError('bad_request');
  }
  const recorded: Row[] = [];
  const undone: Row[] = [];

  for (const item of request.rows) {
    const table = item?.table;
    const row = item?.row;
    if (!isText(table) || !WRITABLE.has(table) || !row || typeof row !== 'object') {
      throw new GroupWriteError('bad_request');
    }
    if (table === 'album_expenses') {
      const id = row.id;
      if (!isText(id) || !GROUP_BILL_ID.test(id)) throw new GroupWriteError('bad_row');
      const before = now(table, id);
      if (row.deleted_at != null) {
        // A delete changes nothing else about the bill; its payments stay.
        if (!live(before)) continue;
        put(table, id, {
          ...before,
          deleted_at: ctx.now,
          updated_at: ctx.now,
          created_by: authorStamp(ctx),
        });
        activities.push({
          kind: 'bill_deleted',
          expenseId: id,
          data: { before: billFields(before) },
        });
        continue;
      }
      const date = groupDay(row.date);
      const shares = parseShares(row.shares_json);
      const paidBy = row.paid_by;
      const currency = row.currency;
      if (
        !date ||
        !shares ||
        shares.length === 0 ||
        !isText(paidBy) ||
        !isText(currency) ||
        !GROUP_CURRENCY.test(currency)
      ) {
        throw new GroupWriteError('bad_row');
      }
      // Everyone on it is the group's; anyone newly put on it is still in it.
      const beforeFields = before ? billFields(before) : null;
      const wasOn = new Set(beforeFields?.shares.map((share) => share.memberId) ?? []);
      if (!byId.has(paidBy) || (paidBy !== beforeFields?.paidBy && !current(paidBy))) {
        throw new GroupWriteError('not_a_member');
      }
      for (const share of shares) {
        if (!byId.has(share.memberId) || (!wasOn.has(share.memberId) && !current(share.memberId))) {
          throw new GroupWriteError('not_a_member');
        }
      }
      const amount = shares.reduce((sum, share) => sum + cents(share.amount), 0) / 100;
      const data: Row = {
        id,
        ledger_id: ctx.groupId,
        date,
        note: cleanText(row.note, MAX_NOTE),
        amount,
        currency,
        category_name: cleanText(row.category_name, MAX_LABEL),
        category_icon: cleanText(row.category_icon, MAX_LABEL),
        paid_by: paidBy,
        shares_json: JSON.stringify(shares),
        created_by: authorStamp(ctx),
        created_at: isText(before?.created_at) ? before.created_at : ctx.now,
        updated_at: ctx.now,
        deleted_at: null,
      };
      const after = billFields(data);
      if (!before) {
        activities.push({ kind: 'bill_added', expenseId: id, data: { after } });
      } else if (!live(before)) {
        activities.push({
          kind: 'bill_restored',
          expenseId: id,
          data: { before: beforeFields, after },
        });
      } else if (!sameBill(beforeFields!, after)) {
        activities.push({
          kind: 'bill_edited',
          expenseId: id,
          data: { before: beforeFields, after },
        });
      } else if (
        data.category_name === before.category_name &&
        data.category_icon === before.category_icon
      ) {
        continue; // Nothing of the group's changed.
      }
      put(table, id, data);
      continue;
    }

    if (table === 'album_settlements') {
      const id = row.id;
      if (!isText(id) || !GROUP_SETTLEMENT_ID.test(id)) throw new GroupWriteError('bad_row');
      const before = now(table, id);
      if (before) {
        // A payment is only ever undone.
        if (row.deleted_at == null || before.deleted_at != null) continue;
        const data = { ...before, deleted_at: ctx.now, updated_at: ctx.now };
        put(table, id, data);
        undone.push(data);
        continue;
      }
      if (row.deleted_at != null) continue;
      const expenseId = row.expense_id;
      const from = row.from_member;
      const to = row.to_member;
      const currency = row.currency;
      const date = groupDay(row.date);
      const bill = isText(expenseId) ? now('album_expenses', expenseId) : undefined;
      if (
        !isText(expenseId) ||
        !bill ||
        // A payment is in its bill's currency, or it would count nowhere.
        currency !== bill.currency ||
        !isText(from) ||
        !isText(to) ||
        from === to ||
        !byId.has(from) ||
        !byId.has(to) ||
        !isAmount(row.amount) ||
        !(cents(row.amount) > 0) ||
        !isText(currency) ||
        !GROUP_CURRENCY.test(currency) ||
        !date
      ) {
        throw new GroupWriteError('bad_row');
      }
      const data: Row = {
        id,
        ledger_id: ctx.groupId,
        expense_id: expenseId,
        from_member: from,
        to_member: to,
        amount: money(row.amount),
        currency,
        date,
        created_by: authorStamp(ctx),
        created_at: ctx.now,
        updated_at: ctx.now,
        deleted_at: null,
      };
      put(table, id, data);
      recorded.push(data);
      continue;
    }

    if (table === 'album_members') {
      // Only a rename of the writer's own row.
      if (row.id !== self.id) throw new GroupWriteError('forbidden', 403);
      const name = cleanMemberName(row.name);
      if (!name) throw new GroupWriteError('bad_row');
      if (name === self.name) continue;
      if (uniqueName(name, members, self.id) !== name) throw new GroupWriteError('name_taken', 409);
      const before = now(table, self.id)!;
      put(table, self.id, { ...before, name, updated_at: ctx.now });
      activities.push({
        kind: 'member_renamed',
        memberId: self.id,
        data: { before: { name: self.name }, after: { name } },
      });
      continue;
    }

    // album_groups: the group's own settings row.
    if (row.id !== ctx.groupId) throw new GroupWriteError('bad_row');
    const before = now(table, ctx.groupId);
    const data: Row = before
      ? { ...before, deleted_at: null, updated_at: ctx.now }
      : {
          id: ctx.groupId,
          ledger_id: ctx.groupId,
          simplify_debts: 0,
          cover_photo_uri: null,
          created_at: ctx.now,
          updated_at: ctx.now,
          deleted_at: null,
        };
    let changed = false;
    if ('simplify_debts' in row) {
      const simplify = row.simplify_debts === true || row.simplify_debts === 1 ? 1 : 0;
      if ((before?.simplify_debts ? 1 : 0) !== simplify) {
        activities.push({ kind: 'simplify_changed', data: { after: { on: simplify === 1 } } });
        changed = true;
      }
      data.simplify_debts = simplify;
    }
    if ('cover_photo_uri' in row) {
      const cover = row.cover_photo_uri;
      if (cover !== null && cover !== '' && !(isText(cover) && GROUP_COVER_PATH.test(cover))) {
        throw new GroupWriteError('bad_row');
      }
      if ((before?.cover_photo_uri ?? null) !== cover) {
        // The first cover, published as the album is shared, is not news.
        if (before?.cover_photo_uri != null || ownerUserId !== ctx.userId || members.length > 1) {
          activities.push({ kind: 'cover_changed', data: {} });
        }
        changed = true;
      }
      data.cover_photo_uri = cover;
    }
    if (changed || !before) put('album_groups', ctx.groupId, data);
  }

  // Payments of one act read as one line per pair: "Ben paid Tess RM45". An
  // act whose payments (in one currency) come down to one person paying
  // another, however many bills they run along (paying a simplified debt),
  // reads as that one payment: "Ben paid Ann RM150", not the four moves it
  // took between three people.
  const paymentLines = (rows: Row[], kind: ActivityKind) => {
    type Line = { from: string; to: string; currency: string; amount: number; bills: string[] };
    const byCurrency = new Map<string, Row[]>();
    for (const row of rows) {
      const currency = row.currency as string;
      const list = byCurrency.get(currency);
      if (list) list.push(row);
      else byCurrency.set(currency, [row]);
    }
    for (const [currency, payments] of byCurrency) {
      const net = new Map<string, number>();
      const pairs = new Map<string, Line>();
      for (const row of payments) {
        const from = row.from_member as string;
        const to = row.to_member as string;
        const amount = cents(row.amount as number);
        net.set(from, (net.get(from) ?? 0) - amount);
        net.set(to, (net.get(to) ?? 0) + amount);
        const key = `${from}\u0000${to}`;
        const line = pairs.get(key) ?? { from, to, currency, amount: 0, bills: [] };
        line.amount += amount;
        if (isText(row.expense_id) && !line.bills.includes(row.expense_id)) {
          line.bills.push(row.expense_id);
        }
        pairs.set(key, line);
      }
      const payers = [...net].filter(([, amount]) => amount < 0);
      const payees = [...net].filter(([, amount]) => amount > 0);
      const lines: Line[] =
        pairs.size > 1 && payers.length === 1 && payees.length === 1
          ? [
              {
                from: payers[0][0],
                to: payees[0][0],
                currency,
                amount: payees[0][1],
                bills: [...new Set([...pairs.values()].flatMap((line) => line.bills))],
              },
            ]
          : [...pairs.values()];
      for (const line of lines) {
        activities.push({
          kind,
          expenseId: line.bills.length === 1 ? line.bills[0] : null,
          data: {
            from: line.from,
            to: line.to,
            currency: line.currency,
            amount: line.amount / 100,
            bills: line.bills,
            ...(request.reason === 'close_even' ? { even: true } : null),
          },
        });
      }
    }
  };
  paymentLines(recorded, 'payment_recorded');
  paymentLines(undone, 'payment_undone');

  const log = activities.map((activity, index) => activityRow(ctx, self, activity, index));
  return { writes: [...writes.values(), ...log] };
}

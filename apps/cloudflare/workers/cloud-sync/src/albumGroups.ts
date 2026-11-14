// A shared album's group, written by the Worker alone. See README.md >
// Album members and shared albums > How it works.
//
// Phones hold a read-only token for an album's database: they pull its rows
// and never push. Every change (a bill added, edited, deleted or restored, a
// payment recorded or undone, a member joining, leaving or renaming, Simplify,
// the cover) comes here as the rows the phone wants written. The Worker checks
// each against the rules, stamps who made it from the writer's sign-in, and
// writes it with an entry in the album's activity log, all in one transaction.
// So the author on every bill, payment and log entry is the account that
// really made it, and no change skips the log.
//
// Rows are stored as the app stores them (`sync_rows`: table, id, JSON, a
// revision), so phones apply what the Worker wrote like any other synced row.

import { json } from './http';

// ---------------------------------------------------------------------------
// Shapes (mirrored by the app's lib/repositories/mappers.ts)

const GROUP_ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;
const GROUP_BILL_ID = /^[A-Za-z0-9_:.-]{1,120}$/;
const GROUP_SETTLEMENT_ID = /^[A-Za-z0-9_-]{1,64}(\.\d{1,4})?$/;
const GROUP_CURRENCY = /^[A-Z][A-Z0-9]{1,9}$/;
const GROUP_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const GROUP_COVER_PATH = /^album-covers\/[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,5}$/;
const MAX_AMOUNT = 1e12;
const MAX_NAME = 40;
const MAX_NOTE = 500;
const MAX_LABEL = 80;
const MAX_SHARES = 64;
/** More rows than any one act writes (Settle up across every bill of an album, say). */
export const MAX_WRITE_ROWS = 400;
const MAX_MEMBER_ROWS = 200;

export const GROUP_TABLES = [
  'album_members',
  'album_expenses',
  'album_settlements',
  'album_groups',
  'album_activity',
] as const;
type GroupTable = (typeof GROUP_TABLES)[number];
/** What a phone may ask to write: everything but the log, which only the Worker writes. */
const WRITABLE = new Set<string>([
  'album_members',
  'album_expenses',
  'album_settlements',
  'album_groups',
]);

type Row = Record<string, unknown>;

interface Stored {
  table: string;
  id: string;
  data: Row;
  rev: string;
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

/** A row the Worker writes, with the revision it expects to replace (null: a new row). */
export interface PlannedWrite {
  table: GroupTable;
  id: string;
  data: Row;
  expectRev: string | null;
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

const isText = (value: unknown): value is string => typeof value === 'string';

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
// Planning a write: pure, so the tests read exactly what the Worker decides.

/** What a write reads first: the group's members and the rows it names. */
export interface GroupState {
  members: Stored[];
  /** The rows the write names (and the bills its payments are for), by `table\0id`. */
  rows: Map<string, Stored>;
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

interface PlanContext {
  groupId: string;
  userId: string;
  now: string;
  newId: () => string;
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
    expectRev: null,
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

function membersOf(state: GroupState): Member[] {
  return state.members
    .map((row) => toMember(row.data))
    .filter((member): member is Member => member !== null);
}

/** The writer's own member: joined, and not left. */
function selfOf(members: readonly Member[], userId: string): Member | null {
  return members.find((member) => member.userId === userId && !member.deletedAt) ?? null;
}

/**
 * The user joining (or the owner starting) the album: their own member row,
 * under an id made from their account so two phones of theirs write one row.
 * Joined again after leaving, the row they left takes them back. Nothing is
 * written when they are already in.
 */
export function planJoin(state: GroupState, ctx: PlanContext, name: string): Plan {
  const members = membersOf(state);
  if (selfOf(members, ctx.userId)) return { writes: [] };
  const id = `u-${ctx.userId}`;
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
  const before = state.members.find((row) => row.id === rowId) ?? null;
  return {
    writes: [
      { table: 'album_members', id: rowId, data, expectRev: before?.rev ?? null },
      activityRow(ctx, member, { kind: 'member_joined', memberId: rowId, data: {} }, 0),
    ],
  };
}

/**
 * Someone out of the album (they left, or the owner took them out): their
 * row stays, with its bills, but names no account. `actorUserId`: who did it.
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
      expectRev: row.rev,
    });
    writes.push(
      activityRow(ctx, actor, { kind: 'member_left', memberId: row.id, data: {} }, index),
    );
  });
  return { writes };
}

/**
 * The rows a phone asked to write, checked and stamped, with their log
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
 * - `created_by` is always the writer.
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
    const key = rowKey(table, id);
    const prior = writes.get(key);
    writes.set(key, {
      table,
      id,
      data,
      expectRev: prior ? prior.expectRev : (stored(table, id)?.rev ?? null),
    });
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
          created_by: ctx.userId,
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
        created_by: ctx.userId,
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
        created_by: ctx.userId,
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

  // Payments of one act read as one line per pair: "Ben paid Tess RM45".
  const paymentLines = (rows: Row[], kind: ActivityKind) => {
    const lines = new Map<
      string,
      { from: string; to: string; currency: string; amount: number; bills: string[] }
    >();
    for (const row of rows) {
      const key = `${row.from_member}\u0000${row.to_member}\u0000${row.currency}`;
      const line = lines.get(key) ?? {
        from: row.from_member as string,
        to: row.to_member as string,
        currency: row.currency as string,
        amount: 0,
        bills: [],
      };
      line.amount += cents(row.amount as number);
      if (isText(row.expense_id) && !line.bills.includes(row.expense_id)) {
        line.bills.push(row.expense_id);
      }
      lines.set(key, line);
    }
    for (const line of lines.values()) {
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
  };
  paymentLines(recorded, 'payment_recorded');
  paymentLines(undone, 'payment_undone');

  const log = activities.map((activity, index) => activityRow(ctx, self, activity, index));
  return { writes: [...writes.values(), ...log] };
}

// ---------------------------------------------------------------------------
// The group's database

export interface Statement {
  sql: string;
  args: (string | number | null)[];
}

/** What the Worker needs of an album's database. */
export interface GroupDb {
  query(statement: Statement): Promise<Row[]>;
  /** Runs the statements as one transaction; false when one failed (another write won). */
  transaction(statements: Statement[]): Promise<boolean>;
}

/** Reads the group's members and the rows a write names (with the bills its payments are for). */
export async function loadState(db: GroupDb, request: WriteRequest | null): Promise<GroupState> {
  const keys: { table: string; id: string }[] = [];
  for (const item of request?.rows ?? []) {
    const id = item?.row?.id;
    if (!isText(item?.table) || !isText(id)) continue;
    keys.push({ table: item.table, id });
    if (item.table === 'album_settlements' && isText(item.row.expense_id)) {
      keys.push({ table: 'album_expenses', id: item.row.expense_id });
    }
  }
  const parse = (raw: Row): Stored | null => {
    try {
      const data = JSON.parse(String(raw.data)) as Row;
      if (!data || typeof data !== 'object') return null;
      return { table: String(raw.table_name), id: String(raw.row_id), data, rev: String(raw.rev) };
    } catch {
      return null;
    }
  };
  const members = (
    await db.query({
      sql: `SELECT table_name, row_id, data, rev FROM sync_rows WHERE table_name = 'album_members' LIMIT ${MAX_MEMBER_ROWS}`,
      args: [],
    })
  )
    .map(parse)
    .filter((row): row is Stored => row !== null);
  const rows = new Map<string, Stored>();
  for (const row of members) rows.set(rowKey(row.table, row.id), row);
  const wanted = keys.filter((key) => !rows.has(rowKey(key.table, key.id)));
  for (let start = 0; start < wanted.length; start += 100) {
    const part = wanted.slice(start, start + 100);
    const found = await db.query({
      sql: `SELECT table_name, row_id, data, rev FROM sync_rows WHERE ${part
        .map(() => '(table_name = ? AND row_id = ?)')
        .join(' OR ')}`,
      args: part.flatMap((key) => [key.table, key.id]),
    });
    for (const raw of found) {
      const row = parse(raw);
      if (row) rows.set(rowKey(row.table, row.id), row);
    }
  }
  return { members, rows };
}

/** A revision of the Worker's, in the app's shape (`<time>.<counter>.<origin>`). */
function workerRev(index: number, nowMs: number, salt: string): string {
  return `${nowMs.toString(36)}.${index.toString(36)}.w${salt}`;
}

/**
 * Writes a plan as one transaction. Each row is written only if it still has
 * the revision it was read at, so two writes at once never lose one another:
 * the second is planned again on what the first wrote.
 */
export async function commitPlan(
  db: GroupDb,
  plan: Plan,
  nowMs = Date.now(),
): Promise<{ table: string; id: string; data: string; rev: string }[] | null> {
  if (!plan.writes.length) return [];
  const salt = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const written = plan.writes.map((write, index) => ({
    write,
    data: JSON.stringify(write.data),
    rev: workerRev(index, nowMs, salt),
  }));
  const statements: Statement[] = [];
  for (const { write, data, rev } of written) {
    // Fails (integer overflow) unless the row is still as it was read.
    statements.push({
      sql: `SELECT CASE WHEN (SELECT rev FROM sync_rows WHERE table_name = ? AND row_id = ?) IS ?
             THEN 1 ELSE abs(-9223372036854775807 - 1) END`,
      args: [write.table, write.id, write.expectRev],
    });
    statements.push(
      write.expectRev === null
        ? {
            sql: `INSERT INTO sync_rows (table_name, row_id, data, rev, origin, updated_at)
                  VALUES (?, ?, ?, ?, 'worker', ?)`,
            args: [write.table, write.id, data, rev, nowMs],
          }
        : {
            sql: `UPDATE sync_rows SET data = ?, rev = ?, origin = 'worker', updated_at = ?
                  WHERE table_name = ? AND row_id = ?`,
            args: [data, rev, nowMs, write.table, write.id],
          },
    );
  }
  if (!(await db.transaction(statements))) return null;
  return written.map(({ write, data, rev }) => ({ table: write.table, id: write.id, data, rev }));
}

/**
 * Plans and commits, planning again if another write landed in between.
 * Returns the rows written, for the phone to apply at once.
 */
export async function writeGroup(
  db: GroupDb,
  request: WriteRequest | null,
  plan: (state: GroupState) => Plan,
): Promise<{ table: string; id: string; data: string; rev: string }[]> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadState(db, request);
    const written = await commitPlan(db, plan(state));
    if (written) return written;
  }
  throw new GroupWriteError('busy', 409);
}

// ---------------------------------------------------------------------------
// Turso's HTTP API (Hrana over HTTP)

type HranaValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

function toHrana(value: string | number | null): HranaValue {
  if (value === null) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  return { type: 'text', value };
}

function fromHrana(value: HranaValue): unknown {
  switch (value.type) {
    case 'null':
      return null;
    case 'integer':
      return Number(value.value);
    case 'float':
      return value.value;
    case 'text':
      return value.value;
    default:
      return null;
  }
}

interface HranaResult {
  cols: { name: string | null }[];
  rows: HranaValue[][];
}

/** An album's database over Turso's HTTP API, with the Worker's own token. */
export function hranaDb(url: string, token: string): GroupDb {
  const endpoint = `${url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '')}/v2/pipeline`;
  const post = async (requests: unknown[]) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
    });
    if (!res.ok) throw new Error(`turso_pipeline_failed_${res.status}`);
    const body = (await res.json()) as {
      results: (
        | { type: 'ok'; response: Record<string, unknown> }
        | { type: 'error'; error: { message: string } }
      )[];
    };
    return body.results;
  };
  const stmt = (statement: Statement) => ({
    sql: statement.sql,
    args: statement.args.map(toHrana),
  });
  return {
    async query(statement) {
      const [result] = await post([{ type: 'execute', stmt: stmt(statement) }]);
      if (result?.type !== 'ok') throw new Error('turso_query_failed');
      const { cols, rows } = (result.response as { result: HranaResult }).result;
      return rows.map((values) =>
        Object.fromEntries(
          values.map((value, i) => [cols[i]?.name ?? String(i), fromHrana(value)]),
        ),
      );
    },
    async transaction(statements) {
      // BEGIN, each statement only if everything before it went, COMMIT only
      // if all did, else ROLLBACK: one round trip.
      const steps: { stmt: unknown; condition?: unknown }[] = [
        { stmt: { sql: 'BEGIN IMMEDIATE' } },
      ];
      for (const statement of statements) {
        steps.push({ stmt: stmt(statement), condition: { type: 'ok', step: steps.length - 1 } });
      }
      const commit = steps.length;
      steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: commit - 1 } });
      steps.push({
        stmt: { sql: 'ROLLBACK' },
        condition: { type: 'not', cond: { type: 'ok', step: commit } },
      });
      const [result] = await post([{ type: 'batch', batch: { steps } }]);
      if (result?.type !== 'ok') throw new Error('turso_batch_failed');
      const outcome = (
        result.response as { result: { step_results: unknown[]; step_errors: unknown[] } }
      ).result;
      if (outcome.step_results[commit] != null) return true;
      // A failed check is another write that landed first; anything else is not.
      const failed = outcome.step_errors.find((error) => error != null) as
        { message?: string } | undefined;
      if (failed && !/overflow/i.test(failed.message ?? '')) {
        throw new Error(`turso_write_failed: ${failed.message ?? ''}`);
      }
      return false;
    },
  };
}

/** The response for a refused write. */
export function groupWriteErrorResponse(error: unknown): Response | null {
  return error instanceof GroupWriteError ? json({ error: error.code }, error.status) : null;
}

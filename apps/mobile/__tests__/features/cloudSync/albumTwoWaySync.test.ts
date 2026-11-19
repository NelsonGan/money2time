import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  albumCategoryList,
  GroupWriteError,
  memberRowId,
  planJoin,
} from '~/features/albums/lib/groupPlan';
import {
  billRow,
  categoryRow,
  deletedBillRow,
  paymentRow,
  renameRow,
} from '~/features/albums/lib/groupRows';
import { followProfileName, writeGroup } from '~/features/albums/services/albumGroupWrites';
import { saveSharedLedger } from '~/features/cloudSync/services/sharedLedgerStore';
import { enableCapture, SyncEngine } from '~/features/cloudSync/services/syncEngine';
import { getSQLite } from '~/lib/db/client';
import { applyMigrations } from '~/lib/db/migrations/runner';

// A shared album synced both ways (README: Album members and shared albums):
// two phones, each with the app's real database, its real sync engine and
// its real writer for the group, on one (fake) cloud database. A change is
// made on the phone, works offline, goes up with its activity entry, and
// comes down on the other phone; two phones changing one bill both log it,
// and the later push stands, as with any synced row.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {
    get exists() {
      return false;
    }
    get parentDirectory() {
      return { exists: true, create: () => undefined };
    }
    delete() {}
  },
  Directory: class {},
}));
jest.mock('~/services/userAssets', () => ({
  assetRelativePathFromRef: (value: string) => value,
  invalidateCustomUriCache: jest.fn(),
  getAlbumCoverUri: () => null,
}));
jest.mock('~/services/userAssetGc', () => ({ collectReferencedAssetPaths: () => new Set() }));
jest.mock('~/features/cloudSync/services/cloudSyncApi', () => ({
  CloudSyncApiError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  existingMedia: jest.fn(async () => new Set()),
  uploadMedia: jest.fn(async () => undefined),
  downloadMedia: jest.fn(async () => undefined),
}));
jest.mock('~/features/cloudSync/services/sharedLedgerSync', () => ({ sharedLedgerSync: {} }));

const NOW = '2026-11-15T00:00:00.000Z';
const GROUP = 'trip';
const SHARE = 'trip-share';
const A = memberRowId(GROUP, 'u-a');
const B = memberRowId(GROUP, 'u-b');

interface Phone {
  name: string;
  userId: string;
  app: DatabaseSync;
  db: SQLiteDatabase;
  engine: SyncEngine;
  /** The cloud's version this phone last pulled. */
  pulled: number;
  /** Row writes this phone sent to the cloud. */
  pushedRows: number;
}

let cloud: DatabaseSync;
let cloudVersion: number;
let phones: Record<'a' | 'b', Phone>;

function sqliteOf(app: DatabaseSync): SQLiteDatabase {
  const flat = (args: unknown[]) => args.flat() as (string | number | null)[];
  return {
    execSync: (sql: string) => app.exec(sql),
    getAllSync: (sql: string, ...args: unknown[]) => app.prepare(sql).all(...flat(args)),
    getFirstSync: (sql: string, ...args: unknown[]) => app.prepare(sql).get(...flat(args)) ?? null,
    runSync: (sql: string, ...args: unknown[]) => app.prepare(sql).run(...flat(args)),
    withTransactionSync: (fn: () => void) => {
      app.exec('BEGIN');
      try {
        fn();
        app.exec('COMMIT');
      } catch (error) {
        app.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
}

/** Works on `phone` from now on: its database, and its account in the album. */
function on(phone: Phone): Phone {
  (getSQLite as jest.Mock).mockReturnValue(phone.db);
  // Also clears the store's in-memory list, which the other phone filled.
  saveSharedLedger({
    ledgerId: GROUP,
    shareId: SHARE,
    role: phone.userId === 'u-a' ? 'owner' : 'member',
    name: 'Bali',
    ownerName: 'Ann',
    memberCount: 2,
    active: true,
    userId: phone.userId,
    ownerUserId: 'u-a',
    kind: 'album',
  });
  return phone;
}

function makePhone(name: string, userId: string): Phone {
  const app = new DatabaseSync(':memory:');
  const db = sqliteOf(app);
  const phone: Phone = {
    name,
    userId,
    app,
    db,
    engine: null as unknown as SyncEngine,
    pulled: 0,
    pushedRows: 0,
  };
  (getSQLite as jest.Mock).mockReturnValue(db);
  const dir = join(__dirname, '../../../lib/db/migrations');
  applyMigrations(
    db,
    readdirSync(dir)
      .filter((file) => /^\d{3}_.+\.ts$/.test(file))
      .sort()
      .map((file) => require(join(dir, file)).default),
  );
  app.exec(
    `INSERT INTO settings (id, app_user_id, created_at, updated_at) VALUES ('primary', 'rc-${name}', '${NOW}', '${NOW}');
     INSERT OR IGNORE INTO ledgers (id, sort_order, created_at, updated_at) VALUES ('default', 0, '${NOW}', '${NOW}');
     INSERT INTO sync_state VALUES ('attached:${SHARE}', '1');
     INSERT INTO sync_state VALUES ('detached:${SHARE}', '1');`,
  );
  on(phone);
  enableCapture();
  const replica = {
    all: async (sql: string, args: (string | number | null)[] = []) =>
      cloud.prepare(sql).all(...args),
    run: async (sql: string, args: (string | number | null)[] = []) => {
      phone.pushedRows += 1;
      return cloud.prepare(sql).run(...args);
    },
    exec: async (sql: string) => void cloud.exec(sql),
    transaction: async (fn: () => Promise<void>) => {
      cloud.exec('BEGIN');
      try {
        await fn();
        cloud.exec('COMMIT');
      } catch (error) {
        cloud.exec('ROLLBACK');
        throw error;
      }
    },
    pull: async () => {
      const changed = phone.pulled !== cloudVersion;
      phone.pulled = cloudVersion;
      return changed;
    },
    push: async () => {
      cloudVersion += 1;
      phone.pulled = cloudVersion;
    },
    stats: async () => ({ cdcOperations: phone.pushedRows ? 1 : 0, mainWalSize: 0 }),
    checkpoint: async () => undefined,
  };
  phone.engine = new SyncEngine({
    userId,
    channel: SHARE,
    ledgerId: GROUP,
    url: 'local-test',
    getTursoToken: async () => 'local-test',
    getSessionToken: async () => 'local-test',
    mediaPath: `/v1/ledgers/${SHARE}/media`,
    deviceName: name,
  });
  Object.assign(phone.engine, { replica });
  return phone;
}

/** Someone joining, as the Worker writes it: straight into the cloud copy. */
function joinInCloud(userId: string, name: string) {
  const members = cloud
    .prepare("SELECT row_id, data FROM sync_rows WHERE table_name = 'album_members'")
    .all()
    .map((row) => ({
      table: 'album_members',
      id: String(row.row_id),
      data: JSON.parse(String(row.data)),
    }));
  const plan = planJoin(
    { members, rows: new Map() },
    { groupId: GROUP, userId, now: NOW, newId: () => `${userId}-${Math.random()}` },
    name,
  );
  for (const write of plan.writes) {
    cloud
      .prepare('INSERT OR REPLACE INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)')
      .run(write.table, write.id, JSON.stringify(write.data), `w-${write.id}`, 'worker', 1);
  }
  cloudVersion += 1;
}

async function sync(phone: Phone) {
  on(phone);
  phone.pushedRows = 0;
  const outcome = await phone.engine.syncNow();
  expect(outcome.applyError ?? null).toBeNull();
  return outcome;
}

const rows = (phone: Phone, table: string) =>
  phone.app.prepare(`SELECT * FROM ${table} WHERE ledger_id = ? ORDER BY id`).all(GROUP) as Record<
    string,
    unknown
  >[];
const outbox = (phone: Phone) =>
  phone.app.prepare('SELECT table_name FROM sync_outbox ORDER BY table_name').all() as {
    table_name: string;
  }[];
const kinds = (phone: Phone) =>
  rows(phone, 'album_activity')
    .map((row) => `${row.kind}:${row.actor_user_id}`)
    .sort();

const dinner = (amounts: { a: number; b: number }, note = 'Dinner') =>
  billRow({
    id: 'dinner',
    date: '2026-11-15',
    note,
    currency: 'MYR',
    category: 'food',
    paidBy: A,
    shares: [
      { memberId: A, amount: amounts.a },
      { memberId: B, amount: amounts.b },
    ],
  });

beforeEach(async () => {
  cloud = new DatabaseSync(':memory:');
  cloud.exec(
    'CREATE TABLE sync_rows (table_name TEXT, row_id TEXT, data TEXT, rev TEXT, origin TEXT, updated_at INTEGER, PRIMARY KEY(table_name,row_id)); CREATE TABLE sync_info (key TEXT PRIMARY KEY, value TEXT);',
  );
  cloudVersion = 0;
  phones = { a: makePhone('a', 'u-a'), b: makePhone('b', 'u-b') };
  joinInCloud('u-a', 'Ann');
  joinInCloud('u-b', 'Ben');
  await sync(phones.a);
  await sync(phones.b);
});

afterEach(() => {
  phones.a.app.close();
  phones.b.app.close();
  cloud.close();
});

it('brings both people down to both phones', () => {
  expect(rows(phones.a, 'album_members').map((row) => row.name)).toEqual(['Ann', 'Ben']);
  expect(rows(phones.b, 'album_members').map((row) => row.name)).toEqual(['Ann', 'Ben']);
  // Pulled rows are never sent back up.
  expect(outbox(phones.a)).toEqual([]);
  expect(outbox(phones.b)).toEqual([]);
});

it('saves a change offline, stamped and logged, and sends only that when back online', async () => {
  on(phones.a);
  writeGroup(GROUP, [dinner({ a: 30, b: 30 })]);
  // Saved on the phone at once, with nothing sent yet.
  const [bill] = rows(phones.a, 'album_expenses');
  expect(bill).toMatchObject({ amount: 60, created_by: 'u-a', paid_by: A });
  expect(kinds(phones.a)).toEqual(['bill_added:u-a', 'member_joined:u-a', 'member_joined:u-b']);
  expect(outbox(phones.a).map((row) => row.table_name)).toEqual([
    'album_activity',
    'album_expenses',
  ]);

  const outcome = await sync(phones.a);
  expect(outcome.pushed).toBe(true);
  // The bill and its log entry: two rows on the wire, nothing else.
  expect(phones.a.pushedRows).toBe(2);
  expect(outbox(phones.a)).toEqual([]);

  await sync(phones.b);
  expect(rows(phones.b, 'album_expenses')[0]).toMatchObject({ amount: 60, created_by: 'u-a' });
  expect(kinds(phones.b)).toEqual(kinds(phones.a));
  expect(outbox(phones.b)).toEqual([]);
});

it('logs both edits when two phones change one bill offline, and keeps the later push', async () => {
  on(phones.a);
  writeGroup(GROUP, [dinner({ a: 30, b: 30 })]);
  await sync(phones.a);
  await sync(phones.b);

  // Both offline: Ann changes the note, Ben the amounts.
  on(phones.a);
  writeGroup(GROUP, [dinner({ a: 30, b: 30 }, 'Dinner at Locavore')]);
  on(phones.b);
  writeGroup(GROUP, [dinner({ a: 40, b: 40 })]);

  await sync(phones.a);
  await sync(phones.b);
  await sync(phones.a);

  // Ben pushed last: his bill stands on both phones.
  for (const phone of [phones.a, phones.b]) {
    expect(rows(phone, 'album_expenses')[0]).toMatchObject({
      amount: 80,
      note: 'Dinner',
      created_by: 'u-b',
    });
  }
  // Every change is in the log, on both phones, with the same entries.
  expect(kinds(phones.a)).toEqual([
    'bill_added:u-a',
    'bill_edited:u-a',
    'bill_edited:u-b',
    'member_joined:u-a',
    'member_joined:u-b',
  ]);
  expect(rows(phones.b, 'album_activity').map((row) => row.id)).toEqual(
    rows(phones.a, 'album_activity').map((row) => row.id),
  );
});

it('syncs payments, a delete and a rename both ways', async () => {
  on(phones.a);
  writeGroup(GROUP, [dinner({ a: 30, b: 30 })]);
  await sync(phones.a);
  await sync(phones.b);

  on(phones.b);
  writeGroup(GROUP, [
    paymentRow({
      id: 'pay-1',
      expenseId: 'dinner',
      from: B,
      to: A,
      amount: 30,
      currency: 'MYR',
      date: '2026-11-15',
    }),
  ]);
  writeGroup(GROUP, [renameRow(B, 'Benny')]);
  await sync(phones.b);
  await sync(phones.a);
  expect(rows(phones.a, 'album_settlements')[0]).toMatchObject({
    amount: 30,
    from_member: B,
    created_by: 'u-b',
  });
  expect(rows(phones.a, 'album_members').map((row) => row.name)).toEqual(['Ann', 'Benny']);

  on(phones.a);
  writeGroup(GROUP, [deletedBillRow('dinner')]);
  await sync(phones.a);
  await sync(phones.b);
  expect(rows(phones.b, 'album_expenses')[0].deleted_at).not.toBeNull();
  // Deleting a bill leaves its payments standing.
  expect(rows(phones.b, 'album_settlements')[0].deleted_at).toBeNull();
  expect(kinds(phones.b)).toEqual([
    'bill_added:u-a',
    'bill_deleted:u-a',
    'member_joined:u-a',
    'member_joined:u-b',
    'member_renamed:u-b',
    'payment_recorded:u-b',
  ]);
});

it('refuses a change from someone who is not in the album, and writes nothing', async () => {
  on(phones.a);
  phones.a.app.exec(
    `UPDATE album_members SET user_id = NULL WHERE id = '${A}'; DELETE FROM sync_outbox;`,
  );
  expect(() => writeGroup(GROUP, [dinner({ a: 30, b: 30 })])).toThrow(
    new GroupWriteError('not_member', 403),
  );
  expect(rows(phones.a, 'album_expenses')).toEqual([]);
  expect(outbox(phones.a)).toEqual([]);
});

it("never takes over another album's row through an id it chose, and logs nothing", async () => {
  on(phones.a);
  phones.a.app.exec(
    `INSERT INTO album_expenses (id, ledger_id, date, note, amount, currency, paid_by, shares_json, created_at, updated_at)
     VALUES ('dinner', 'other-album', '2026-11-01', 'Theirs', 5, 'MYR', 'x', '[]', '${NOW}', '${NOW}');
     DELETE FROM sync_outbox;`,
  );
  const logged = kinds(phones.a);
  expect(() => writeGroup(GROUP, [dinner({ a: 30, b: 30 })])).toThrow(
    new GroupWriteError('bad_row'),
  );
  expect(
    phones.a.app.prepare("SELECT ledger_id, note FROM album_expenses WHERE id = 'dinner'").all(),
  ).toEqual([{ ledger_id: 'other-album', note: 'Theirs' }]);
  // The whole change is refused: no log entry for a bill that is not there.
  expect(kinds(phones.a)).toEqual(logged);
  expect(outbox(phones.a)).toEqual([]);
});

it("follows the user's new Settings name where they still go by an automatic one", async () => {
  on(phones.a);
  // Ann never picked a name in the album: her new Settings name reaches it.
  expect(followProfileName(['Ann'], 'Annabel')).toBe(1);
  expect(rows(phones.a, 'album_members').map((row) => row.name)).toEqual(['Annabel', 'Ben']);
  expect(kinds(phones.a)).toContain('member_renamed:u-a');
  // A name she picked there stays; so does one someone else already has.
  expect(followProfileName(['Ann'], 'Ann Lee')).toBe(0);
  expect(followProfileName(['Annabel'], 'Ben')).toBe(0);
  expect(rows(phones.a, 'album_members').map((row) => row.name)).toEqual(['Annabel', 'Ben']);
  // It goes up like any change.
  await sync(phones.a);
  await sync(phones.b);
  expect(rows(phones.b, 'album_members').map((row) => row.name)).toEqual(['Annabel', 'Ben']);
});

it("brings one person's change to the album's categories to the other phone, logged", async () => {
  on(phones.a);
  writeGroup(GROUP, [
    categoryRow(GROUP, { key: 'food', name: 'Meals', icon: null, sortOrder: 0 }),
    categoryRow(GROUP, { key: 'c-tickets01', name: 'Tickets', icon: 'emoji:🎟️', sortOrder: 1 }),
    categoryRow(GROUP, {
      key: 'groceries',
      name: null,
      icon: null,
      sortOrder: 2,
      removed: true,
    }),
  ]);
  writeGroup(GROUP, [
    billRow({
      id: 'show',
      date: '2026-11-15',
      note: 'Show',
      currency: 'MYR',
      category: 'c-tickets01',
      categories: albumCategoryList([{ key: 'c-tickets01', name: 'Tickets', icon: 'emoji:🎟️' }]),
      paidBy: A,
      shares: [
        { memberId: A, amount: 20 },
        { memberId: B, amount: 20 },
      ],
    }),
  ]);
  await sync(phones.a);
  await sync(phones.b);
  const list = albumCategoryList(rows(phones.b, 'album_categories'));
  expect(list.map((category) => [category.key, category.name])).toEqual([
    ['food', 'Meals'],
    ['c-tickets01', 'Tickets'],
    ['transport', null],
    ['housing', null],
    ['bills', null],
    ['healthcare', null],
    ['shopping', null],
    ['other', null],
  ]);
  expect(rows(phones.b, 'album_expenses')[0]).toMatchObject({
    category_key: 'c-tickets01',
    category_name: 'Tickets',
    category_icon: 'emoji:🎟️',
  });
  expect(kinds(phones.b).filter((kind) => kind.startsWith('category_changed'))).toEqual([
    'category_changed:u-a',
    'category_changed:u-a',
    'category_changed:u-a',
  ]);
});

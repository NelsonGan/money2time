import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import { decodeRow, encodeRow } from '~/features/cloudSync/lib/rowCodec';
import { ASSET_COLUMNS, SYNC_TABLES } from '~/features/cloudSync/lib/syncTables';
import { channelOfRow } from '~/features/cloudSync/services/ledgerChannels';
import { setCachedSessionUser } from '~/features/cloudSync/services/sessionUser';
import {
  removeSharedLedger,
  saveSharedLedger,
  type SharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { selfMemberIdFor, withEntryStamp } from '~/features/sharedLedgers/lib/entryStamp';
import {
  buildLedgerPeople,
  getLedgerPeople,
  invalidateLedgerPeople,
  maskEmail,
  profileRowId,
  shortName,
  writeOwnLedgerProfiles,
} from '~/features/sharedLedgers/lib/ledgerPeople';
import { getSQLite } from '~/lib/db/client';
import { copyLedgerRows } from '~/lib/db/ledgerCopy';
import migration079 from '~/lib/db/migrations/079_transaction_members';
import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';

// Who added an entry and whose it is, in a shared ledger (README: Shared
// ledgers > Who added it). Real SQL against real SQLite for the migration,
// the index and the profile rows; the stamping and the people are pure.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
// A photo is on this phone once its file is: `avatars/missing.jpg` is not yet.
jest.mock('~/services/userAssets', () => ({
  getProfileAvatarUri: (path: string | null) =>
    path && path !== 'avatars/missing.jpg' ? `file:///docs/user-assets/${path}` : null,
}));

const MIGRATIONS_DIR = join(__dirname, '../../../lib/db/migrations');

function loadMigrations(upTo = Infinity): DbMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.ts$/.test(file))
    .sort()
    .map((file) => (require(join(MIGRATIONS_DIR, file)) as { default: DbMigration }).default)
    .filter((migration) => migration.version <= upTo);
}

type Param = string | number | null;

function openDatabase() {
  const connection = new DatabaseSync(':memory:');
  const flat = (params: unknown[]) => params.flat() as Param[];
  const db = {
    execSync: (sql: string) => connection.exec(sql),
    getAllSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).all(...flat(params)),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      connection.prepare(sql).get(...flat(params)) ?? null,
    runSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).run(...flat(params)),
    withTransactionSync: (task: () => void) => {
      connection.exec('BEGIN');
      try {
        task();
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  const all = (sql: string, ...params: Param[]) =>
    connection.prepare(sql).all(...params) as Record<string, unknown>[];
  return { db, connection, all };
}

const NOW = '2026-11-02T00:00:00.000Z';

const HOME: SharedLedger = {
  ledgerId: 'home',
  shareId: 'share-home',
  role: 'member',
  name: 'Home',
  ownerName: 'Nelson',
  memberCount: 1,
  active: true,
  userId: 'user-mei',
};

describe('migration 079 (transaction members)', () => {
  let harness: ReturnType<typeof openDatabase>;
  afterEach(() => harness.connection.close());

  it('leaves every existing entry as the owner’s and indexes the person', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations(77));
    harness.connection.exec(`
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at)
        VALUES ('lunch', 'default', 'expense', 12, 'MYR', '2026-10-27', '${NOW}', '${NOW}');
    `);

    expect(applyMigrations(harness.db, [migration079]).appliedVersions).toEqual([79]);

    expect(harness.all('SELECT created_by, member_id FROM transactions')).toEqual([
      { created_by: null, member_id: null },
    ]);
    const indexes = harness
      .all(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'`)
      .map((row) => row.name);
    expect(indexes).toContain('idx_transactions_active_member_ledger_date');
    expect(harness.all('PRAGMA table_info(recurring_rules)').map((c) => c.name)).toContain(
      'member_id',
    );
    expect(harness.all('PRAGMA table_info(shared_ledgers)').map((c) => c.name)).toEqual(
      expect.arrayContaining(['user_id', 'owner_user_id']),
    );
    expect(harness.all('PRAGMA table_info(ledger_profiles)').map((c) => c.name)).toEqual([
      'id',
      'ledger_id',
      'user_id',
      'role',
      'name',
      'avatar_uri',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
  });

  it('can run again on a database that already has it', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    expect(() => migration079.up(harness.db)).not.toThrow();
  });

  it('serves one person’s spending from the index without taking over ledger lists', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    const plan = (sql: string) =>
      harness
        .all(`EXPLAIN QUERY PLAN ${sql}`)
        .map((row) => String(row.detail))
        .join(' | ');

    expect(
      plan(`SELECT SUM(amount) FROM transactions
            WHERE member_id = 'user-mei' AND ledger_id = 'home' AND deleted_at IS NULL
              AND date >= '2026-11-01' AND date < '2026-12-01'`),
    ).toContain('idx_transactions_active_member_ledger_date');
    expect(
      plan(`SELECT id FROM transactions
            WHERE ledger_id = 'home' AND deleted_at IS NULL ORDER BY date DESC`),
    ).not.toContain('idx_transactions_active_member_ledger_date');
  });
});

describe('stamping a new entry', () => {
  let harness: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    jest.mocked(getSQLite).mockReturnValue(harness.db);
    setCachedSessionUser(null);
  });
  afterEach(() => {
    removeSharedLedger('home');
    harness.connection.close();
  });

  it('stamps a member’s own account in their shared ledger', () => {
    saveSharedLedger(HOME);
    expect(selfMemberIdFor('home')).toBe('user-mei');
    expect(withEntryStamp({ amount: 5, createdBy: undefined }, 'home')).toEqual({
      amount: 5,
      createdBy: 'user-mei',
      memberId: 'user-mei',
    });
  });

  it('leaves the owner’s entries and unshared ledgers null', () => {
    saveSharedLedger({ ...HOME, role: 'owner', userId: 'user-nelson' });
    expect(withEntryStamp({}, 'home')).toEqual({ createdBy: null, memberId: null });
    expect(withEntryStamp({}, 'default')).toEqual({ createdBy: null, memberId: null });
  });

  it('falls back to the session read this launch for a row saved before 079', () => {
    saveSharedLedger({ ...HOME, userId: null });
    setCachedSessionUser({ id: 'user-mei', email: 'mei@example.com', name: 'Mei' });
    expect(selfMemberIdFor('home')).toBe('user-mei');
  });

  it('keeps what the caller says: a pick in the editor, a recurring rule’s person', () => {
    saveSharedLedger(HOME);
    expect(withEntryStamp({ memberId: null }, 'home')).toEqual({
      createdBy: 'user-mei',
      memberId: null,
    });
    expect(withEntryStamp({ createdBy: 'user-ana', memberId: 'user-ana' }, 'home')).toEqual({
      createdBy: 'user-ana',
      memberId: 'user-ana',
    });
  });

  it('never loses the account a later list read leaves out', () => {
    saveSharedLedger(HOME);
    saveSharedLedger({ ...HOME, memberCount: 2, userId: undefined });
    expect(harness.all('SELECT user_id FROM shared_ledgers')).toEqual([{ user_id: 'user-mei' }]);
  });
});

describe('ledger profiles', () => {
  let harness: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    jest.mocked(getSQLite).mockReturnValue(harness.db);
    harness.connection.exec(`
      INSERT INTO settings (id, app_user_id, profile_name, profile_avatar_uri, created_at, updated_at)
        VALUES ('primary', 'install-1', 'Mei Tan', 'avatars/mei.jpg', '${NOW}', '${NOW}');
      INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('home', 'Home', '${NOW}', '${NOW}');
    `);
    setCachedSessionUser(null);
    saveSharedLedger(HOME);
  });
  afterEach(() => {
    removeSharedLedger('home');
    harness.connection.close();
  });

  it('writes this account’s name and photo once, and again only when they change', () => {
    expect(writeOwnLedgerProfiles([HOME], null, NOW)).toBe(1);
    expect(writeOwnLedgerProfiles([HOME], null, NOW)).toBe(0);
    expect(harness.all('SELECT * FROM ledger_profiles')).toEqual([
      {
        id: profileRowId('home', 'user-mei'),
        ledger_id: 'home',
        user_id: 'user-mei',
        role: 'member',
        name: 'Mei Tan',
        avatar_uri: 'avatars/mei.jpg',
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
      },
    ]);

    harness.connection.exec(`UPDATE settings SET profile_name = 'Mei'`);
    expect(writeOwnLedgerProfiles([HOME], null, '2026-11-03T00:00:00.000Z')).toBe(1);
    expect(harness.all('SELECT name, updated_at FROM ledger_profiles')).toEqual([
      { name: 'Mei', updated_at: '2026-11-03T00:00:00.000Z' },
    ]);
  });

  it('writes nothing into a ledger deleted here before the list caught up', () => {
    harness.connection.exec(`UPDATE ledgers SET deleted_at = '${NOW}' WHERE id = 'home'`);
    expect(writeOwnLedgerProfiles([HOME], null, NOW)).toBe(0);
    expect(harness.all('SELECT id FROM ledger_profiles')).toEqual([]);
  });

  it('uses the sign-in name when Settings has none', () => {
    harness.connection.exec(`UPDATE settings SET profile_name = NULL`);
    setCachedSessionUser({ id: 'user-mei', email: 'mei@example.com', name: 'Mei T' });
    writeOwnLedgerProfiles([HOME], null, NOW);
    expect(harness.all('SELECT name FROM ledger_profiles')).toEqual([{ name: 'Mei T' }]);
  });

  it('names the people behind each entry, with synced profiles from the others', () => {
    writeOwnLedgerProfiles([HOME], null, NOW);
    harness.connection.exec(`
      INSERT INTO ledger_profiles (id, ledger_id, user_id, role, name, avatar_uri, created_at, updated_at)
        VALUES ('home:user-nelson', 'home', 'user-nelson', 'owner', 'Nelson Gan', 'avatars/n.jpg', '${NOW}', '${NOW}');
    `);
    invalidateLedgerPeople();
    const people = getLedgerPeople('home');
    expect(people?.people.map((person) => [person.name, person.memberId, person.isSelf])).toEqual([
      ['Nelson Gan', null, false],
      ['Mei Tan', 'user-mei', true],
    ]);
    expect(people?.personFor(null).name).toBe('Nelson Gan');
    expect(people?.personFor('user-nelson').role).toBe('owner');
    expect(people?.personFor('user-mei').avatarUri).toBe('avatars/mei.jpg');
    expect(getLedgerPeople('default')).toBeNull();
  });
});

describe('buildLedgerPeople', () => {
  const own = { name: 'Nelson', avatarUri: 'avatars/me.jpg' };

  it('puts the owner first and falls back to the share’s owner name', () => {
    const people = buildLedgerPeople(
      HOME,
      [{ user_id: 'user-ana', role: 'member', name: 'Ana', avatar_uri: null }],
      { name: 'Mei', avatarUri: null },
      'user-mei',
    );
    // The owner, then this phone's own person, then the others by name.
    expect(people.people.map((person) => person.name)).toEqual(['Nelson', 'Mei', 'Ana']);
    expect(people.personFor(undefined).role).toBe('owner');
  });

  it('shows the owner’s own Settings profile on the owner’s phone', () => {
    const people = buildLedgerPeople({ ...HOME, role: 'owner' }, [], own, 'user-nelson');
    expect(people.personFor(null)).toMatchObject({
      name: 'Nelson',
      avatarUri: 'avatars/me.jpg',
      isSelf: true,
    });
    expect(people.personFor('user-nelson').isSelf).toBe(true);
  });

  it('gives everyone a colour of their own, the same on every phone', () => {
    const profiles = [
      { user_id: 'user-nelson', role: 'owner', name: 'Nelson', avatar_uri: null },
      { user_id: 'user-ana', role: 'member', name: 'Ana', avatar_uri: null },
      { user_id: 'user-mei', role: 'member', name: 'Mei', avatar_uri: null },
    ];
    const onMei = buildLedgerPeople(
      { ...HOME, ownerUserId: 'user-nelson' },
      profiles,
      { name: 'Mei', avatarUri: null },
      'user-mei',
    );
    const onNelson = buildLedgerPeople(
      { ...HOME, role: 'owner', userId: 'user-nelson', ownerUserId: 'user-nelson' },
      profiles,
      { name: 'Nelson', avatarUri: null },
      'user-nelson',
    );
    const colorsOf = (people: typeof onMei) =>
      Object.fromEntries(people.people.map((entry) => [entry.memberId ?? 'owner', entry.color]));
    expect(colorsOf(onMei)).toEqual(colorsOf(onNelson));
    expect(new Set(onMei.people.map((entry) => entry.color)).size).toBe(3);
  });

  it('keeps an entry of someone never seen on this phone, as a member', () => {
    const people = buildLedgerPeople(HOME, [], own, 'user-mei');
    const stranger = people.personFor('user-gone');
    expect(stranger).toMatchObject({
      memberId: 'user-gone',
      // The i18n key: tests run without the locale catalogue.
      name: 'shared_ledgers.member_fallback',
      role: 'member',
    });
    // The same object every time, so the rows showing them do not re-render.
    expect(people.personFor('user-gone')).toBe(stranger);
  });
});

describe('people with nothing set', () => {
  const nameless = { name: null, avatarUri: null };

  it('calls this phone’s own nameless person "You"', () => {
    const asMember = buildLedgerPeople(HOME, [], nameless, 'user-mei');
    expect(asMember.personFor('user-mei')).toMatchObject({
      name: 'shared_ledgers.you',
      isSelf: true,
    });
    const asOwner = buildLedgerPeople(
      { ...HOME, role: 'owner', ownerName: null },
      [],
      nameless,
      'u',
    );
    expect(asOwner.personFor(null).name).toBe('shared_ledgers.you');
  });

  it('calls an owner nobody has named "Owner", not "Member"', () => {
    const people = buildLedgerPeople({ ...HOME, ownerName: null }, [], nameless, 'user-mei');
    expect(people.personFor(null).name).toBe('shared_ledgers.owner_badge');
  });

  it('treats a blank or spaces-only name as no name', () => {
    const people = buildLedgerPeople(
      HOME,
      [{ user_id: 'user-ana', role: 'member', name: '   ', avatar_uri: null }],
      nameless,
      'user-mei',
    );
    expect(people.personFor('user-ana').name).toBe('shared_ledgers.member_fallback');
  });

  it('masks an address the way the People page does', () => {
    expect(maskEmail('nelson@example.com')).toBe('ne***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('not-an-address')).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });

  it('resolves photos that are on the phone, and not ones still downloading', () => {
    const people = buildLedgerPeople(
      HOME,
      [
        { user_id: 'user-ana', role: 'member', name: 'Ana', avatar_uri: 'avatars/ana.jpg' },
        { user_id: 'user-kim', role: 'member', name: 'Kim', avatar_uri: 'avatars/missing.jpg' },
      ],
      nameless,
      'user-mei',
      (path) => (path === 'avatars/ana.jpg' ? 'file:///ana.jpg' : null),
    );
    expect(people.personFor('user-ana').avatarFileUri).toBe('file:///ana.jpg');
    expect(people.personFor('user-kim').avatarFileUri).toBeNull();
  });

  it('cuts a name to its first word for the row, whatever the spacing', () => {
    expect(shortName('Mei  Tan')).toBe('Mei');
    expect(shortName('ne***@example.com')).toBe('ne***@example.com');
    // A lone symbol keeps the next word; a one-letter name is still a name.
    expect(shortName('🐼 Panda')).toBe('🐼 Panda');
    expect(shortName('J Lim')).toBe('J');
    expect(shortName('李 明')).toBe('李');
  });
});

describe('the people store', () => {
  let harness: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    jest.mocked(getSQLite).mockReturnValue(harness.db);
    setCachedSessionUser(null);
    saveSharedLedger(HOME);
    harness.connection.exec(`
      INSERT INTO settings (id, app_user_id, created_at, updated_at) VALUES ('primary', 'i', '${NOW}', '${NOW}');
      INSERT INTO ledger_profiles (id, ledger_id, user_id, role, name, avatar_uri, created_at, updated_at)
        VALUES ('home:user-ana', 'home', 'user-ana', 'member', 'Ana', 'avatars/missing.jpg', '${NOW}', '${NOW}');
    `);
    invalidateLedgerPeople();
  });
  afterEach(() => {
    removeSharedLedger('home');
    harness.connection.close();
  });

  it('keeps the same object when a re-read changes nobody', () => {
    const first = getLedgerPeople('home');
    invalidateLedgerPeople();
    expect(getLedgerPeople('home')).toBe(first);
  });

  it('gives a new object once a synced photo has arrived on the phone', () => {
    const first = getLedgerPeople('home');
    expect(first?.personFor('user-ana').avatarFileUri).toBeNull();
    harness.connection.exec(
      `UPDATE ledger_profiles SET avatar_uri = 'avatars/ana.jpg' WHERE id = 'home:user-ana'`,
    );
    invalidateLedgerPeople();
    const next = getLedgerPeople('home');
    expect(next).not.toBe(first);
    expect(next?.personFor('user-ana').avatarFileUri).toBe(
      'file:///docs/user-assets/avatars/ana.jpg',
    );
  });

  it('names a member with no name anywhere by their masked address', () => {
    setCachedSessionUser({ id: 'user-mei', email: 'meitan@example.com', name: '' });
    invalidateLedgerPeople();
    expect(getLedgerPeople('home')?.personFor('user-mei').name).toBe('me***@example.com');
  });
});

describe('trusting who the owner is', () => {
  const nameless = { name: null, avatarUri: null };
  const forged = [
    { user_id: 'user-nelson', role: 'owner', name: 'Nelson', avatar_uri: null },
    // A member's phone (or a modified app) claiming to be the owner.
    { user_id: 'user-ana', role: 'owner', name: 'Ana', avatar_uri: null },
  ];

  it('takes the owner from the Worker, not from a profile row that says so', () => {
    const people = buildLedgerPeople(
      { ...HOME, ownerUserId: 'user-nelson' },
      forged,
      nameless,
      'user-mei',
    );
    expect(people.personFor(null).name).toBe('Nelson');
    expect(people.personFor('user-nelson').name).toBe('Nelson');
    expect(people.personFor('user-ana')).toMatchObject({ name: 'Ana', role: 'member' });
    expect(people.people.filter((person) => person.role === 'owner')).toHaveLength(1);
  });

  it('falls back to the claimed role only when the Worker has not said (an older one)', () => {
    const people = buildLedgerPeople(HOME, forged.slice(0, 1), nameless, 'user-mei');
    expect(people.personFor(null).name).toBe('Nelson');
  });

  it('caps a name another phone wrote, and ignores a photo outside the avatars folder', () => {
    const people = buildLedgerPeople(
      HOME,
      [
        {
          user_id: 'user-ana',
          role: 'member',
          name: 'A'.repeat(500),
          avatar_uri: 'receipts/x.jpg',
        },
        {
          user_id: 'user-kim',
          role: 'member',
          name: 'Kim',
          avatar_uri: 'avatars/../receipts/x.jpg',
        },
      ],
      nameless,
      'user-mei',
      (path) => path,
    );
    expect(people.personFor('user-ana').name).toHaveLength(80);
    expect(people.personFor('user-ana').avatarFileUri).toBeNull();
    expect(people.personFor('user-kim').avatarFileUri).toBeNull();
  });

  it('marks stand-in names, so "You" and "Owner" are never read as names', () => {
    const people = buildLedgerPeople({ ...HOME, ownerName: null }, [], nameless, 'user-mei');
    expect(people.personFor(null).named).toBe(false);
    expect(people.personFor('user-mei').named).toBe(false);
    const named = buildLedgerPeople(HOME, [], { name: 'Mei', avatarUri: null }, 'user-mei');
    expect(named.personFor('user-mei').named).toBe(true);
  });
});

describe('one profile per person per ledger', () => {
  it('refuses a second live profile for the same account, but not after one is deleted', () => {
    const harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    const insert = (id: string, deleted: string | null = null) =>
      harness.connection
        .prepare(
          `INSERT INTO ledger_profiles (id, ledger_id, user_id, role, created_at, updated_at, deleted_at)
           VALUES (?, 'home', 'user-mei', 'member', ?, ?, ?)`,
        )
        .run(id, NOW, NOW, deleted);
    insert('home:user-mei');
    expect(() => insert('other-id')).toThrow(/UNIQUE/);
    insert('old-id', NOW);
    harness.connection.close();
  });

  it('remembers the owner the Worker named, and keeps it when a later read leaves it out', () => {
    const harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    jest.mocked(getSQLite).mockReturnValue(harness.db);
    saveSharedLedger({ ...HOME, ownerUserId: 'user-nelson' });
    saveSharedLedger({ ...HOME, memberCount: 3, ownerUserId: undefined });
    expect(harness.all('SELECT owner_user_id FROM shared_ledgers')).toEqual([
      { owner_user_id: 'user-nelson' },
    ]);
    removeSharedLedger('home');
    harness.connection.close();
  });
});

describe('copying a ledger', () => {
  it('makes the copied entries and rules the user’s own', () => {
    const harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    harness.connection.exec(`
      INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('home', 'Home', '${NOW}', '${NOW}');
      INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('copy', 'Copy', '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_by, member_id, created_at, updated_at)
        VALUES ('t1', 'home', 'expense', 9, 'MYR', '2026-11-01', 'user-mei', 'user-mei', '${NOW}', '${NOW}');
      INSERT INTO recurring_rules (id, ledger_id, name, type, amount, currency, recurrence_pattern, next_run_date, member_id, created_at, updated_at)
        VALUES ('r1', 'home', 'Netflix', 'expense', 55, 'MYR', 'monthly', '2026-12-01', 'user-mei', '${NOW}', '${NOW}');
    `);
    let n = 0;
    copyLedgerRows(harness.db, 'home', 'copy', () => `new-${(n += 1)}`, NOW);
    expect(
      harness.all(`SELECT created_by, member_id FROM transactions WHERE ledger_id = 'copy'`),
    ).toEqual([{ created_by: null, member_id: null }]);
    expect(harness.all(`SELECT member_id FROM recurring_rules WHERE ledger_id = 'copy'`)).toEqual([
      { member_id: null },
    ]);
    harness.connection.close();
  });
});

describe('shortName', () => {
  it('takes the first name for the row', () => {
    expect(shortName('Mei Tan')).toBe('Mei');
    expect(shortName('  Nelson ')).toBe('Nelson');
  });
});

describe('syncing who added an entry', () => {
  const OLD_PHONE_COLUMNS = new Set(['id', 'ledger_id', 'amount', 'note', 'updated_at']);

  it('keeps both fields when a phone on an older app edits the entry', () => {
    const fromNewPhone = encodeRow(
      'transactions',
      {
        id: 't1',
        ledger_id: 'home',
        amount: 10,
        note: 'Lunch',
        created_by: 'user-mei',
        member_id: 'user-ana',
      },
      null,
      true,
    );
    // The older phone reads only the columns it has…
    const onOldPhone = decodeRow('transactions', fromNewPhone, OLD_PHONE_COLUMNS, true);
    expect(onOldPhone).not.toHaveProperty('member_id');
    // …and its edit merges over the stored copy instead of erasing them.
    const edited = JSON.parse(
      encodeRow('transactions', { ...onOldPhone!, amount: 12 }, fromNewPhone, true),
    );
    expect(edited).toMatchObject({ amount: 12, created_by: 'user-mei', member_id: 'user-ana' });
  });

  it('syncs the people with their ledger, photo included', () => {
    expect(SYNC_TABLES).toContain('ledger_profiles');
    expect(ASSET_COLUMNS.ledger_profiles).toEqual(['avatar_uri']);
  });

  describe('routing', () => {
    let harness: ReturnType<typeof openDatabase>;
    beforeEach(() => {
      harness = openDatabase();
      applyMigrations(harness.db, loadMigrations());
      jest.mocked(getSQLite).mockReturnValue(harness.db);
      saveSharedLedger(HOME);
    });
    afterEach(() => {
      removeSharedLedger('home');
      harness.connection.close();
    });

    it('sends a profile to its shared ledger’s database, and others to the user’s own', () => {
      expect(channelOfRow('ledger_profiles', { id: 'home:user-mei', ledger_id: 'home' })).toBe(
        'share-home',
      );
      expect(channelOfRow('ledger_profiles', { id: 'x:user-mei', ledger_id: 'default' })).toBe(
        'personal',
      );
    });

    it('retires the people with a deleted ledger', () => {
      harness.connection.exec(`
        INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('home', 'Home', '${NOW}', '${NOW}');
        INSERT INTO ledger_profiles (id, ledger_id, user_id, role, name, created_at, updated_at)
          VALUES ('home:user-mei', 'home', 'user-mei', 'member', 'Mei', '${NOW}', '${NOW}');
      `);
      ledgersRepository.softDelete('home');
      expect(harness.all('SELECT deleted_at IS NOT NULL AS gone FROM ledger_profiles')).toEqual([
        { gone: 1 },
      ]);
    });
  });
});

describe('giving an entry to someone else', () => {
  it('moves its refund and split paybacks with it, and nothing else', () => {
    const harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    jest.mocked(getSQLite).mockReturnValue(harness.db);
    const insert = (id: string, extra = '') =>
      harness.connection.exec(`
        INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_by, member_id,
          reimbursement_transaction_id, created_at, updated_at)
          VALUES ('${id}', 'home', 'expense', 10, 'MYR', '2026-11-01', 'user-mei', 'user-mei',
          ${extra || 'NULL'}, '${NOW}', '${NOW}');`);
    insert('dinner', "'refund'");
    insert('refund');
    insert('payback');
    insert('other');
    harness.connection.exec(`
      INSERT INTO transaction_splits (id, transaction_id, person_name, amount, paid_transaction_id, created_at, updated_at)
        VALUES ('s1', 'dinner', 'Sam', 5, 'payback', '${NOW}', '${NOW}');
      UPDATE transactions SET member_id = 'user-ana' WHERE id = 'dinner';
    `);
    transactionsRepository.reassignLinked('dinner', 'user-ana');
    expect(harness.all('SELECT id, created_by, member_id FROM transactions ORDER BY id')).toEqual([
      { id: 'dinner', created_by: 'user-mei', member_id: 'user-ana' },
      { id: 'other', created_by: 'user-mei', member_id: 'user-mei' },
      { id: 'payback', created_by: 'user-mei', member_id: 'user-ana' },
      { id: 'refund', created_by: 'user-mei', member_id: 'user-ana' },
    ]);
    harness.connection.close();
  });
});

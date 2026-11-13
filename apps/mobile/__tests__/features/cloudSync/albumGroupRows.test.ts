import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  inLedgersSql,
  isLedgerScoped,
  NO_CHANNEL,
  PERSONAL_CHANNEL,
} from '~/features/cloudSync/lib/ledgerRows';
import { GROUP_SYNC_TABLES, SYNC_TABLES } from '~/features/cloudSync/lib/syncTables';
import { channelOfRow, personalRowsSql } from '~/features/cloudSync/services/ledgerChannels';
import {
  listAlbumShares,
  listLedgerShares,
  removeSharedLedger,
  saveSharedLedger,
  sharedAlbumFor,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { getSQLite } from '~/lib/db/client';

// A shared album's group syncs with its own cloud database by riding the
// shared-ledger routing (README: Album members and shared albums): its three
// tables carry the group's id where a ledger's rows carry their ledger.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));

let connection: DatabaseSync;

beforeEach(() => {
  connection = new DatabaseSync(':memory:');
  connection.exec(`
    CREATE TABLE shared_ledgers (
      ledger_id TEXT PRIMARY KEY, share_id TEXT, role TEXT, name TEXT, owner_name TEXT,
      member_count INTEGER, active INTEGER, updated_at INTEGER, user_id TEXT,
      owner_user_id TEXT, kind TEXT
    );
  `);
  const flat = (params: unknown[]) => params.flat() as (string | number | null)[];
  (getSQLite as jest.Mock).mockReturnValue({
    getAllSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).all(...flat(params)),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      connection.prepare(sql).get(...flat(params)) ?? null,
    runSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).run(...flat(params)),
  } as unknown as SQLiteDatabase);
});

afterEach(() => {
  removeSharedLedger('bali');
  removeSharedLedger('home');
  connection.close();
});

const share = (ledgerId: string, kind: 'ledger' | 'album') =>
  saveSharedLedger({
    ledgerId,
    shareId: `share-${ledgerId}`,
    role: 'member',
    name: ledgerId,
    ownerName: 'Mei',
    memberCount: 1,
    active: true,
    userId: 'u-me',
    ownerUserId: 'u-mei',
    kind,
  });

it('syncs the group tables, scoped like a ledger’s rows', () => {
  for (const table of GROUP_SYNC_TABLES) {
    expect(SYNC_TABLES).toContain(table);
    expect(isLedgerScoped(table)).toBe(true);
    expect(inLedgersSql(table, ['bali'])).toBe(`ledger_id IN ('bali')`);
  }
});

it('routes a shared album’s group rows to its own channel, and only those', () => {
  const member = { id: 'm1', ledger_id: 'bali', name: 'Aisha' };
  // Not shared (yet, or any more): a group's rows are never the user's own
  // data, so they go nowhere.
  expect(channelOfRow('album_members', member)).toBe(NO_CHANNEL);
  share('bali', 'album');
  share('home', 'ledger');
  expect(channelOfRow('album_members', member)).toBe('share-bali');
  expect(channelOfRow('album_expenses', { id: 'e1', ledger_id: 'bali' })).toBe('share-bali');
  expect(channelOfRow('album_settlements', { id: 's1', ledger_id: 'bali' })).toBe('share-bali');
  // Another group's row never rides this channel.
  expect(channelOfRow('album_expenses', { id: 'e2', ledger_id: 'tokyo' })).toBe(NO_CHANNEL);
  // The user's own entry for a bill is theirs, in their own ledger.
  expect(
    channelOfRow('transactions', { id: 'e1', ledger_id: 'default', album_group_id: 'bali' }),
  ).toBe(PERSONAL_CHANNEL);
  // And the user's own copy leaves every group's rows out.
  expect(personalRowsSql('album_expenses')).toBe('0');
  expect(personalRowsSql('transactions')).toBe(`NOT (ledger_id IN ('bali', 'home'))`);
});

// Anyone in a shared album can write anything into its database. Whatever a
// row there claims, only the group's own tables are taken from it.
it('never takes a ledger’s rows from a shared album’s database', () => {
  share('bali', 'album');
  share('home', 'ledger');
  // Rows naming the album as their ledger are not the album's.
  for (const table of ['transactions', 'accounts', 'categories', 'albums', 'recurring_rules']) {
    expect(channelOfRow(table, { id: 'x', ledger_id: 'bali' })).toBe(PERSONAL_CHANNEL);
  }
  expect(channelOfRow('ledgers', { id: 'bali' })).toBe(PERSONAL_CHANNEL);
  // A shared ledger's database carries no group.
  expect(channelOfRow('album_expenses', { id: 'e3', ledger_id: 'home' })).toBe(NO_CHANNEL);
  // A group's settings are one row, named after the group.
  expect(channelOfRow('album_groups', { id: 'bali', ledger_id: 'bali' })).toBe('share-bali');
  expect(channelOfRow('album_groups', { id: 'tokyo', ledger_id: 'bali' })).toBe(NO_CHANNEL);
});

it('keeps shared albums apart from shared ledgers for the screens', () => {
  share('bali', 'album');
  share('home', 'ledger');
  expect(listLedgerShares().map((item) => item.ledgerId)).toEqual(['home']);
  expect(listAlbumShares().map((item) => item.ledgerId)).toEqual(['bali']);
  expect(sharedAlbumFor('bali')?.shareId).toBe('share-bali');
  expect(sharedAlbumFor('home')).toBeNull();
  // The same arrays until the list changes, so a hook can hold them.
  expect(listAlbumShares()).toBe(listAlbumShares());
});

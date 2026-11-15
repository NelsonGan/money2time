import { getDb, getSQLite } from '~/lib/db/client';
import migration094 from '~/lib/db/migrations/094_album_lines';
import { albumsRepository } from '~/lib/repositories/albumsRepository';

import { openAppDatabase } from '../helpers/appDatabase';

// An entry is in one album at most (README: Key patterns > Albums), on real
// SQLite: migration 094 drops an older version's second links the same way
// on every phone, and putting an entry in an album moves it there.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn(), getDb: jest.fn() }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: jest.fn() }));
jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('../../node_modules/drizzle-orm/index.cjs'),
  ...jest.requireActual('../../node_modules/drizzle-orm/sqlite-core/index.cjs'),
}));

const NOW = '2026-11-12T00:00:00.000Z';
let app: ReturnType<typeof openAppDatabase>;

beforeEach(() => {
  app = openAppDatabase();
  (getSQLite as jest.Mock).mockReturnValue(app.db);
  (getDb as jest.Mock).mockReturnValue(app.orm);
  for (const id of ['bali', 'tokyo', 'gone', 'shared']) {
    app.connection.exec(`
      INSERT INTO albums (id, ledger_id, name, sort_order, created_at, updated_at, deleted_at)
        VALUES ('${id}', 'default', '${id}', 0, '${NOW}', '${NOW}', ${id === 'gone' ? `'${NOW}'` : 'NULL'});
    `);
  }
  for (const [id, group] of [
    ['t1', null],
    ['t2', null],
    ['t3', 'shared'],
    ['t4', null],
  ] as const) {
    app.connection.exec(`
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at, album_group_id)
        VALUES ('${id}', 'default', 'expense', 10, 'MYR', '${NOW}', '${NOW}', '${NOW}', ${group ? `'${group}'` : 'NULL'});
    `);
  }
});

afterEach(() => app.close());

const link = (
  id: string,
  albumId: string,
  transactionId: string,
  deletedAt: string | null = null,
) =>
  app.connection.exec(`
    INSERT INTO album_transactions (id, album_id, transaction_id, sort_order, created_at, updated_at, deleted_at)
      VALUES ('${id}', '${albumId}', '${transactionId}', 0, '${NOW}', '${NOW}', ${deletedAt ? `'${deletedAt}'` : 'NULL'});
  `);

const liveLinks = () =>
  app.connection
    .prepare(
      `SELECT id, album_id AS albumId, transaction_id AS transactionId FROM album_transactions
       WHERE deleted_at IS NULL ORDER BY transaction_id, id`,
    )
    .all();

describe('migration 094', () => {
  it('keeps one link per entry: its shared album’s, else the lowest id; then holds it', () => {
    // As an older version left the table.
    app.connection.exec('DROP INDEX idx_album_transactions_one_album');
    link('b', 'bali', 't1');
    link('a', 'tokyo', 't1');
    link('c', 'bali', 't2');
    link('z', 'shared', 't3');
    link('d', 'bali', 't3');
    // A link to a deleted album is not an album the entry is in.
    link('e', 'gone', 't4');
    link('f', 'bali', 't4', NOW);
    migration094.up(app.db);
    expect(liveLinks()).toEqual([
      { id: 'a', albumId: 'tokyo', transactionId: 't1' },
      { id: 'c', albumId: 'bali', transactionId: 't2' },
      { id: 'z', albumId: 'shared', transactionId: 't3' },
    ]);
    expect(() => link('g', 'bali', 't1')).toThrow(/UNIQUE/);
    // A deleted link does not count.
    link('h', 'bali', 't4', NOW);
    // Replayed, it changes nothing.
    migration094.up(app.db);
    expect(liveLinks()).toHaveLength(3);
  });

  it('adds the album category, archive and share-ended columns', () => {
    const columns = (table: string) =>
      (app.connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (column) => column.name,
      );
    expect(columns('album_expenses')).toContain('category_key');
    expect(columns('transactions')).toContain('album_category');
    expect(columns('albums')).toEqual(expect.arrayContaining(['archived_at', 'share_ended_at']));
  });
});

describe('putting entries in an album', () => {
  it('moves an entry from another album on its own link row, and keeps a shared bill where it is', () => {
    link('l1', 'tokyo', 't1');
    link('l3', 'shared', 't3');
    albumsRepository.addTransactions('bali', ['t1', 't2', 't3', 't2']);
    expect(liveLinks()).toEqual([
      // The same row, now in Bali: one row to sync, as any edit.
      { id: 'l1', albumId: 'bali', transactionId: 't1' },
      expect.objectContaining({ albumId: 'bali', transactionId: 't2' }),
      { id: 'l3', albumId: 'shared', transactionId: 't3' },
    ]);
    expect(albumsRepository.getAllTransactionIdsByAlbum()).toEqual(
      new Map([
        ['bali', ['t1', 't2']],
        ['shared', ['t3']],
      ]),
    );
    // Again: nothing changes.
    albumsRepository.addTransactions('bali', ['t1']);
    expect(liveLinks()).toHaveLength(3);
  });

  it('frees the entries of a deleted album', () => {
    albumsRepository.addTransactions('bali', ['t1', 't2']);
    albumsRepository.softDelete('bali');
    expect(liveLinks()).toEqual([]);
    albumsRepository.addTransactions('tokyo', ['t1']);
    expect(liveLinks()).toEqual([
      expect.objectContaining({ albumId: 'tokyo', transactionId: 't1' }),
    ]);
  });
});

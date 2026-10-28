import {
  buildWrite,
  decodeRow,
  diffRevs,
  encodeRow,
  makeRev,
} from '~/features/cloudSync/lib/rowCodec';

describe('encodeRow', () => {
  it('stores the row as JSON', () => {
    const json = encodeRow('transactions', { id: 't1', amount: 12.5, note: null }, null);
    expect(JSON.parse(json)).toEqual({ id: 't1', amount: 12.5, note: null });
  });

  it('keeps fields a newer app version stored that this phone does not have', () => {
    const stored = JSON.stringify({ id: 't1', amount: 1, future_column: 'kept' });
    const json = encodeRow('transactions', { id: 't1', amount: 2 }, stored);
    expect(JSON.parse(json)).toEqual({ id: 't1', amount: 2, future_column: 'kept' });
  });

  it('never sends device-local settings', () => {
    const json = encodeRow(
      'settings',
      { id: 'primary', app_user_id: 'm2t_x', theme_color: 'rosewood', biometric_lock_enabled: 1 },
      null,
    );
    expect(JSON.parse(json)).toEqual({ id: 'primary', theme_color: 'rosewood' });
  });

  it('drops device-local settings an older copy still holds', () => {
    const stored = JSON.stringify({ id: 'primary', app_user_id: 'm2t_old' });
    const json = encodeRow('settings', { id: 'primary', locale: 'en' }, stored);
    expect(JSON.parse(json)).toEqual({ id: 'primary', locale: 'en' });
  });

  it('survives unreadable stored JSON', () => {
    expect(JSON.parse(encodeRow('items', { id: 'i1' }, '{nope'))).toEqual({ id: 'i1' });
  });
});

describe('decodeRow', () => {
  const columns = new Set(['id', 'amount', 'note']);

  it('keeps only the columns this phone has', () => {
    const row = decodeRow(
      'transactions',
      JSON.stringify({ id: 't1', amount: 3, note: 'x', unknown: 1 }),
      columns,
    );
    expect(row).toEqual({ id: 't1', amount: 3, note: 'x' });
  });

  it('never overwrites this phone’s device-local settings', () => {
    const row = decodeRow(
      'settings',
      JSON.stringify({ id: 'primary', app_user_id: 'm2t_other', app_icon: 'x', locale: 'fr' }),
      new Set(['id', 'app_user_id', 'app_icon', 'locale']),
    );
    expect(row).toEqual({ id: 'primary', locale: 'fr' });
  });

  it('rejects rows without an id and broken JSON', () => {
    expect(decodeRow('transactions', JSON.stringify({ amount: 1 }), columns)).toBeNull();
    expect(decodeRow('transactions', 'not json', columns)).toBeNull();
    expect(decodeRow('transactions', '[1,2]', columns)).toBeNull();
  });
});

describe('buildWrite', () => {
  it('updates an existing row by id', () => {
    const [sql, params] = buildWrite('transactions', { id: 't1', amount: 2, note: null }, true);
    expect(sql).toBe('UPDATE "transactions" SET "amount" = ?, "note" = ? WHERE id = ?');
    expect(params).toEqual([2, null, 't1']);
  });

  it('inserts a new row', () => {
    const [sql, params] = buildWrite('items', { id: 'i1', name: 'Bike' }, false);
    expect(sql).toBe('INSERT INTO "items" ("id", "name") VALUES (?, ?)');
    expect(params).toEqual(['i1', 'Bike']);
  });

  it('does nothing for an id-only update', () => {
    expect(buildWrite('items', { id: 'i1' }, true)).toEqual(['SELECT 1', []]);
  });
});

describe('makeRev', () => {
  it('is unique per device and counter', () => {
    expect(makeRev('dev', 1000, 1)).not.toBe(makeRev('dev', 1000, 2));
    expect(makeRev('a', 1000, 1)).not.toBe(makeRev('b', 1000, 1));
  });
});

describe('diffRevs', () => {
  it('finds rows changed elsewhere and rows removed from the cloud', () => {
    const remote = [
      { table: 'transactions', id: 'same', rev: 'r1' },
      { table: 'transactions', id: 'changed', rev: 'r9' },
      { table: 'transactions', id: 'new', rev: 'r1' },
    ];
    const local = [
      { table: 'transactions', id: 'same', rev: 'r1' },
      { table: 'transactions', id: 'changed', rev: 'r2' },
      { table: 'transactions', id: 'gone', rev: 'r1' },
    ];
    const diff = diffRevs(remote, local);
    expect(diff.changed.map((e) => e.id).sort()).toEqual(['changed', 'new']);
    expect(diff.removed).toEqual([{ table: 'transactions', id: 'gone' }]);
  });

  it('keeps tables apart when ids repeat', () => {
    const diff = diffRevs(
      [{ table: 'accounts', id: 'x', rev: '1' }],
      [{ table: 'categories', id: 'x', rev: '1' }],
    );
    expect(diff.changed).toEqual([{ table: 'accounts', id: 'x', rev: '1' }]);
    expect(diff.removed).toEqual([{ table: 'categories', id: 'x' }]);
  });
});

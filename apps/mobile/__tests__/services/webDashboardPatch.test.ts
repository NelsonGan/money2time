import {
  diffBackup,
  exportJson,
  indexBackup,
  type PatchSource,
} from '~/services/webDashboardPatch';

const tx = (id: string, amount: number) => ({ id, amount, note: `tx ${id}` });

function backup(overrides: Partial<Record<string, unknown[] | undefined>> = {}): PatchSource {
  return {
    exportedAt: '2026-10-21T00:00:00.000Z',
    tables: {
      transactions: [tx('a', 1), tx('b', 2), tx('c', 3)],
      categories: [{ id: 'food', name: 'Food' }],
      album_transactions: [{ album_id: 'trip', transaction_id: 'a' }],
      exchange_rates: [],
      ...overrides,
    },
    userAssets: [{ path: 'account-logos/x.png', base64: 'AAAA' }],
  };
}

describe('diffBackup', () => {
  it('names nothing when nothing changed', () => {
    const { patch } = diffBackup(indexBackup(backup()), {
      ...backup(),
      exportedAt: '2026-10-21T00:01:00.000Z',
    });
    expect(patch).toEqual({ patch: 1, exportedAt: '2026-10-21T00:01:00.000Z', tables: {} });
  });

  it('sends a deleted row as its id and a changed or new row whole', () => {
    const next = backup({ transactions: [tx('a', 1), tx('c', 30), tx('d', 4)] });
    const { patch } = diffBackup(indexBackup(backup()), next);
    expect(patch.tables).toEqual({
      transactions: { put: [tx('c', 30), tx('d', 4)], del: ['b'] },
    });
  });

  it('sends a table without ids whole when anything in it changed', () => {
    const rows = [
      { album_id: 'trip', transaction_id: 'a' },
      { album_id: 'trip', transaction_id: 'c' },
    ];
    const { patch } = diffBackup(indexBackup(backup()), backup({ album_transactions: rows }));
    expect(patch.tables).toEqual({ album_transactions: { all: rows } });
  });

  it('tells a table gone from one that is empty', () => {
    const { patch } = diffBackup(
      indexBackup(backup()),
      backup({ exchange_rates: undefined, items: [] }),
    );
    expect(patch.tables).toEqual({ exchange_rates: { all: null }, items: { all: [] } });
  });

  it('sends a table whole when its rows stop having unique ids', () => {
    const rows = [tx('a', 1), tx('a', 2)];
    const { patch } = diffBackup(indexBackup(backup()), backup({ transactions: rows }));
    expect(patch.tables).toEqual({ transactions: { all: rows } });
  });

  it('changes photos by path', () => {
    const next = {
      ...backup(),
      userAssets: [
        { path: 'account-logos/x.png', base64: 'BBBB' },
        { path: 'category-icons/y.png', base64: 'CCCC' },
      ],
    };
    const { patch } = diffBackup(indexBackup(backup()), next);
    expect(patch.assets).toEqual({ put: next.userAssets });
    const { patch: removed } = diffBackup(indexBackup(next), { ...next, userAssets: [] });
    expect(removed.assets).toEqual({ del: ['account-logos/x.png', 'category-icons/y.png'] });
  });

  it('returns the index the next patch is made against', () => {
    const second = backup({ transactions: [tx('a', 1)] });
    const third = backup({ transactions: [tx('a', 1), tx('e', 5)] });
    const { index } = diffBackup(indexBackup(backup()), second);
    expect(diffBackup(index, third).patch.tables).toEqual({
      transactions: { put: [tx('e', 5)] },
    });
  });
});

describe('exportJson', () => {
  it('parses to the same backup as JSON.stringify', () => {
    const data = { version: 3, ...backup({ items: undefined }) };
    expect(JSON.parse(exportJson(data, indexBackup(data)))).toEqual(
      JSON.parse(JSON.stringify(data)),
    );
  });
});

import {
  contentHash,
  diffBackup,
  exportJson,
  hashIndex,
  indexBackup,
  type PatchSource,
  readIndex,
  sameFormat,
  writeIndex,
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

describe('a copy kept as hashes', () => {
  const pause = () => Promise.resolve();
  const kept = async (data: PatchSource) =>
    readIndex(writeIndex(await hashIndex(indexBackup(data), pause)))!;

  it('patches the same as the copy itself', async () => {
    const nexts = [
      backup(),
      backup({ transactions: [tx('a', 1), tx('c', 30), tx('d', 4)] }),
      backup({ album_transactions: [{ album_id: 'trip', transaction_id: 'c' }] }),
      backup({ exchange_rates: undefined, items: [] }),
      backup({ transactions: [tx('a', 1), tx('a', 2)] }),
      { ...backup(), userAssets: [{ path: 'category-icons/y.png', base64: 'CCCC' }] },
    ];
    const base = await kept(backup());
    for (const next of nexts) {
      expect(diffBackup(base, next).patch).toEqual(diffBackup(indexBackup(backup()), next).patch);
    }
  });

  it('patches the same with the hashes made ahead', async () => {
    const next = backup({ transactions: [tx('a', 1), tx('c', 30)] });
    const index = indexBackup(next);
    const hashes = await hashIndex(index, pause);
    const base = await kept(backup());
    const ahead = diffBackup(base, next, { index, hashes });
    expect(ahead.patch).toEqual(diffBackup(base, next).patch);
    expect(ahead.hashes).toBe(hashes);
  });

  it('carries hashes on from patch to patch, hashing only what changed', async () => {
    const first = indexBackup(backup());
    const firstHashes = await hashIndex(first, pause);
    const next = {
      ...backup({ transactions: [tx('a', 1), tx('c', 30), tx('d', 4)], items: [] }),
      userAssets: [{ path: 'category-icons/y.png', base64: 'CCCC' }],
    };
    const { index, hashes } = diffBackup(first, next, { baseHashes: firstHashes });
    expect(hashes).toEqual(await hashIndex(index, pause));
    expect(diffBackup(first, next).hashes).toBeUndefined();
  });

  it('is not patched across a change of backup format', async () => {
    const base = await kept({ version: 3, ...backup() } as PatchSource);
    expect(sameFormat(base, { version: 3, ...backup() } as PatchSource)).toBe(true);
    expect(sameFormat(base, { version: 4, ...backup() } as PatchSource)).toBe(false);
    expect(sameFormat(base, backup())).toBe(false);
  });

  it('keeps ids and hashes, not the rows', async () => {
    const text = writeIndex(await hashIndex(indexBackup(backup()), pause));
    expect(text).not.toContain('tx a');
    expect(text).not.toContain('AAAA');
    expect(text).toContain('"a"');
  });

  it('returns a full index for the next patch, which the next copy is kept from', async () => {
    const second = backup({ transactions: [tx('a', 1)] });
    const { index } = diffBackup(await kept(backup()), second);
    expect(index.hashed).toBeUndefined();
    expect(JSON.parse(exportJson(second, index))).toEqual(JSON.parse(JSON.stringify(second)));
  });

  it('reads back only what it wrote', () => {
    for (const text of [
      '',
      'null',
      '{"v":2,"head":"{}","tables":{},"assets":[]}',
      '{"v":1,"tables":{},"assets":[]}',
      '{"v":1,"head":"{}","tables":[],"assets":[]}',
      '{"v":1,"head":"{}","tables":{"transactions":["a"]},"assets":[]}',
      '{"v":1,"head":"{}","tables":{"transactions":[1,"x"]},"assets":[]}',
      '{"v":1,"head":"{}","tables":{}}',
    ]) {
      expect(readIndex(text)).toBeNull();
    }
    expect(() => writeIndex(indexBackup(backup()))).toThrow();
  });

  it('hashes different content differently', () => {
    expect(contentHash('{"id":"a","amount":1}')).toBe(contentHash('{"id":"a","amount":1}'));
    expect(contentHash('{"id":"a","amount":1}')).not.toBe(contentHash('{"id":"a","amount":2}'));
    expect(contentHash('')).not.toBe(contentHash(' '));
  });
});

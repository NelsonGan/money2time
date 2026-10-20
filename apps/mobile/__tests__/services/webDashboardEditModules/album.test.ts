import type { AlbumExtra } from '~/services/webDashboardEditModules/album';
import {
  type EditLookup,
  editTransactionIds,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Album, TransactionWithRelations } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const ID = 'abcdefgh12345678';

const album = (id: string, patch: Partial<Album> = {}): Album => ({
  id,
  name: id,
  coverPhotoUri: null,
  isActive: false,
  startDate: null,
  endDate: null,
  latitude: null,
  longitude: null,
  placeId: null,
  placeName: null,
  placeAdmin: null,
  countryCode: null,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  ...patch,
});

const tx = (id: string, type = 'expense') =>
  ({ id, type, updatedAt: AT, deletedAt: null }) as unknown as TransactionWithRelations;

function lookup(albums: Album[], isPro = false): EditLookup {
  const extra: AlbumExtra = { albums };
  return {
    transactions: [tx('t1'), tx('t2'), tx('in1', 'income')],
    accounts: [],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro,
    convert: () => null,
    isCategoryIcon: () => false,
    now: new Date(2026, 9, 20),
    extras: { 'module:album': extra },
  };
}

function read(ops: Record<string, unknown>[]) {
  return readEditRequest({
    id: ID,
    token: 't',
    ops: ops.map((op) => ({ entity: 'module:album', ...op })),
  });
}

function plan(ops: Record<string, unknown>[], albums: Album[] = [], isPro = false) {
  const request = read(ops);
  if (request.kind !== 'request') return { ok: false as const, error: 'unread' };
  return planEdit(request.request, lookup(albums, isPro));
}

const details = (patch: Record<string, unknown> = {}) => ({
  name: ' Tokyo ',
  startDate: null,
  endDate: null,
  ...patch,
});

describe('module:album reading', () => {
  it.each([
    [{ op: 'create', album: details() }],
    [{ op: 'create', album: { ...details(), transactionIds: ['t1', 't1'] } }],
    [{ op: 'create', album: { ...details(), transactionIds: [], cover: 'x' } }],
    [{ op: 'update', id: 'a1', at: AT, album: details({ startDate: '1 Jan' }) }],
    [{ op: 'update', id: 'a1', at: AT, album: { ...details(), transactionIds: [] } }],
    [{ op: 'transactions', id: 'a1', at: AT, add: [], remove: [] }],
    [{ op: 'transactions', id: 'a1', at: AT, add: ['t1'], remove: ['t1'] }],
    [{ op: 'delete', id: 'a1', at: AT, extra: true }],
    [{ op: 'location', id: 'a1', at: AT }],
  ])('refuses a malformed op %#', (op) => {
    expect(read([op]).kind).toBe('invalid');
  });

  it('names the transactions it adds, for loading them first', () => {
    const request = read([
      { op: 'create', album: { ...details(), transactionIds: ['t1'] } },
      { op: 'transactions', id: 'a1', at: AT, add: ['t2'], remove: ['t3'] },
    ]);
    if (request.kind !== 'request') throw new Error('unread');
    expect(editTransactionIds(request.request)).toEqual(['t1', 't2']);
  });
});

describe('module:album planning', () => {
  it('creates an album as the create screen does, without cover or place', () => {
    expect(plan([{ op: 'create', album: { ...details(), transactionIds: ['t1'] } }])).toEqual({
      ok: true,
      plan: {
        steps: [
          {
            kind: 'module',
            entity: 'module:album',
            action: 'create',
            payload: { name: 'Tokyo', startDate: null, endDate: null, transactionIds: ['t1'] },
          },
        ],
        count: 1,
        kinds: ['album_create'],
      },
    });
  });

  it('needs a name and real days', () => {
    expect(
      plan([{ op: 'create', album: { ...details({ name: ' ' }), transactionIds: [] } }]),
    ).toMatchObject({ error: 'invalid' });
    expect(
      plan([
        { op: 'create', album: { ...details({ endDate: '2026-02-31' }), transactionIds: [] } },
      ]),
    ).toMatchObject({ error: 'invalid' });
  });

  it('adds only live expenses, as the picker lists them', () => {
    expect(
      plan([{ op: 'transactions', id: 'a1', at: AT, add: ['in1'], remove: [] }], [album('a1')]),
    ).toMatchObject({ error: 'invalid' });
    expect(
      plan([{ op: 'transactions', id: 'a1', at: AT, add: ['gone'], remove: [] }], [album('a1')]),
    ).toMatchObject({ error: 'conflict' });
    expect(
      plan([{ op: 'transactions', id: 'a1', at: AT, add: ['t1'], remove: ['x'] }], [album('a1')]),
    ).toMatchObject({
      ok: true,
      plan: {
        count: 2,
        steps: [{ action: 'transactions', payload: { id: 'a1', add: ['t1'], remove: ['x'] } }],
      },
    });
  });

  it('stops a free plan at its album limit, counting this batch', () => {
    const two = [album('a'), album('b')];
    const create = { op: 'create', album: { ...details(), transactionIds: [] } };
    expect(plan([create], two)).toMatchObject({ ok: true });
    expect(plan([create, create], two)).toEqual({
      ok: false,
      error: 'pro_required',
      feature: 'albums',
    });
    expect(plan([create, create], two, true)).toMatchObject({ ok: true });
  });

  it('edits and deletes an unchanged album only', () => {
    const albums = [album('a1')];
    expect(
      plan(
        [{ op: 'update', id: 'a1', at: AT, album: details({ startDate: '2026-03-01' }) }],
        albums,
      ),
    ).toMatchObject({
      ok: true,
      plan: {
        steps: [
          {
            action: 'update',
            payload: { id: 'a1', name: 'Tokyo', startDate: '2026-03-01', endDate: null },
          },
        ],
      },
    });
    expect(plan([{ op: 'update', id: 'a1', at: 'old', album: details() }], albums)).toMatchObject({
      error: 'conflict',
    });
    expect(plan([{ op: 'delete', id: 'a1', at: AT }], albums)).toMatchObject({ ok: true });
    expect(
      plan([{ op: 'delete', id: 'a1', at: AT }], [album('a1', { deletedAt: AT })]),
    ).toMatchObject({ error: 'conflict' });
  });
});

describe('module:album order and active album', () => {
  const albums = [album('a1'), album('a2')];
  it('reorders the whole list only', () => {
    expect(plan([{ op: 'reorder', ids: ['a2', 'a1'] }], albums)).toMatchObject({
      ok: true,
      plan: { steps: [{ action: 'reorder', payload: { ids: ['a2', 'a1'] } }] },
    });
    expect(plan([{ op: 'reorder', ids: ['a2'] }], albums)).toMatchObject({ error: 'conflict' });
  });
  it('sets or clears the active album', () => {
    expect(plan([{ op: 'active', id: 'a2' }], albums)).toMatchObject({
      ok: true,
      plan: { steps: [{ action: 'active', payload: { id: 'a2' } }] },
    });
    expect(plan([{ op: 'active', id: null }], albums)).toMatchObject({ ok: true });
    expect(plan([{ op: 'active', id: 'gone' }], albums)).toMatchObject({ error: 'conflict' });
    expect(read([{ op: 'active', id: 'a1', at: AT }]).kind).toBe('invalid');
  });
});

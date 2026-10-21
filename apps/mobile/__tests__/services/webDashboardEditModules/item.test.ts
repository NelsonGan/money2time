import type { ItemExtra } from '~/services/webDashboardEditModules/item';
import { type EditLookup, planEdit, readEditRequest } from '~/services/webDashboardEdits';
import type { Item } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const ID = 'abcdefgh12345678';

const item = (id: string, patch: Partial<Item> = {}): Item => ({
  id,
  name: id,
  iconId: 'laptop',
  purchasePrice: 100,
  currency: 'MYR',
  purchaseDate: '2026-01-01',
  endDate: null,
  salePrice: null,
  note: null,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  ...patch,
});

function lookup(items: Item[], isPro = false): EditLookup {
  const extra: ItemExtra = {
    items,
    currencies: ['MYR', 'USD'],
    isIcon: (id) => id === 'laptop' || id === 'bicycle',
  };
  return {
    transactions: [],
    accounts: [],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR', 'USD'],
    isPro,
    convert: () => null,
    isCategoryIcon: () => false,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: { 'module:item': extra },
  };
}

const fields = (patch: Record<string, unknown> = {}) => ({
  name: ' Espresso machine ',
  iconId: 'laptop',
  purchasePrice: 499,
  currency: 'MYR',
  purchaseDate: '2026-02-03',
  endDate: null,
  salePrice: null,
  note: '  ',
  ...patch,
});

function plan(ops: Record<string, unknown>[], items: Item[] = [], isPro = false) {
  const read = readEditRequest({
    id: ID,
    token: 't',
    ops: ops.map((op) => ({ entity: 'module:item', ...op })),
  });
  if (read.kind !== 'request') return { ok: false as const, error: 'unread' };
  return planEdit(read.request, lookup(items, isPro));
}

describe('module:item reading', () => {
  it.each([
    [{ op: 'create', item: fields({ extra: 1 }) }],
    [{ op: 'create', item: { name: 'x' } }],
    [{ op: 'create', item: fields({ purchasePrice: -1 }) }],
    [{ op: 'create', item: fields({ purchasePrice: Number.NaN }) }],
    [{ op: 'create', item: fields({ purchaseDate: '2026-2-3' }) }],
    [{ op: 'create', item: fields({ currency: 'myr' }) }],
    [{ op: 'create', item: fields(), id: 'x' }],
    [{ op: 'update', id: 'x'.repeat(65), at: AT, item: fields() }],
    [{ op: 'delete', id: 'a' }],
    [{ op: 'rename', id: 'a', at: AT }],
  ])('refuses a malformed op %#', (op) => {
    expect(plan([op])).toEqual({ ok: false, error: 'unread' });
  });
});

describe('module:item planning', () => {
  it('creates an item as the editor saves it', () => {
    const result = plan([{ op: 'create', item: fields() }]);
    expect(result).toEqual({
      ok: true,
      plan: {
        steps: [
          {
            kind: 'module',
            entity: 'module:item',
            action: 'create',
            payload: {
              input: {
                name: 'Espresso machine',
                iconId: 'laptop',
                purchasePrice: 499,
                currency: 'MYR',
                purchaseDate: '2026-02-03',
                endDate: null,
                salePrice: null,
                note: null,
              },
            },
          },
        ],
        count: 1,
        kinds: ['item_create'],
      },
    });
  });

  it('needs a name, real days, and a sale price only on an inactive item', () => {
    expect(plan([{ op: 'create', item: fields({ name: '  ' }) }])).toMatchObject({
      error: 'invalid',
    });
    // An impossible day is not even read.
    expect(plan([{ op: 'create', item: fields({ purchaseDate: '2026-02-30' }) }])).toMatchObject({
      error: 'unread',
    });
    expect(plan([{ op: 'create', item: fields({ salePrice: 10 }) }])).toMatchObject({
      error: 'invalid',
    });
    expect(
      plan([{ op: 'create', item: fields({ endDate: '2026-05-01', salePrice: 10 }) }]),
    ).toMatchObject({ ok: true });
  });

  it('offers the main and added currencies and the library icons', () => {
    expect(plan([{ op: 'create', item: fields({ currency: 'EUR' }) }])).toMatchObject({
      error: 'invalid',
    });
    expect(
      plan([{ op: 'create', item: fields({ iconId: 'custom:item-icons/a.png' }) }]),
    ).toMatchObject({ error: 'invalid' });
    expect(plan([{ op: 'create', item: fields({ iconId: null }) }])).toMatchObject({ ok: true });
  });

  it('keeps an existing custom icon and currency on update', () => {
    const own = item('i1', { iconId: 'custom:item-icons/a.png', currency: 'JPY' });
    const result = plan(
      [
        {
          op: 'update',
          id: 'i1',
          at: AT,
          item: fields({ iconId: 'custom:item-icons/a.png', currency: 'JPY' }),
        },
      ],
      [own],
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('stops a free plan at its item limit, counting this batch', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => item(id));
    expect(plan([{ op: 'create', item: fields() }], four)).toMatchObject({ ok: true });
    expect(
      plan(
        [
          { op: 'create', item: fields() },
          { op: 'create', item: fields() },
        ],
        four,
      ),
    ).toEqual({ ok: false, error: 'pro_required', feature: 'items' });
    expect(
      plan(
        [
          { op: 'create', item: fields() },
          { op: 'create', item: fields() },
        ],
        four,
        true,
      ),
    ).toMatchObject({ ok: true });
  });

  it('refuses a changed or gone item, and one named twice', () => {
    const items = [item('i1')];
    expect(plan([{ op: 'update', id: 'i1', at: 'older', item: fields() }], items)).toMatchObject({
      error: 'conflict',
    });
    expect(plan([{ op: 'delete', id: 'gone', at: AT }], items)).toMatchObject({
      error: 'conflict',
    });
    expect(
      plan(
        [
          { op: 'update', id: 'i1', at: AT, item: fields() },
          { op: 'delete', id: 'i1', at: AT },
        ],
        items,
      ),
    ).toMatchObject({ error: 'invalid' });
  });

  it('deletes an item', () => {
    expect(plan([{ op: 'delete', id: 'i1', at: AT }], [item('i1')])).toMatchObject({
      ok: true,
      plan: {
        steps: [{ kind: 'module', action: 'delete', payload: { id: 'i1' } }],
      },
    });
  });
});

describe('module:item reorder', () => {
  const items = [item('a'), item('b')];
  it('saves the whole list in its new order', () => {
    expect(plan([{ op: 'reorder', ids: ['b', 'a'] }], items)).toMatchObject({
      ok: true,
      plan: { steps: [{ action: 'reorder', payload: { ids: ['b', 'a'] } }] },
    });
  });
  it('refuses a list that is not the phone one', () => {
    expect(plan([{ op: 'reorder', ids: ['b'] }], items)).toMatchObject({ error: 'conflict' });
    expect(plan([{ op: 'reorder', ids: ['b', 'x'] }], items)).toMatchObject({ error: 'conflict' });
    expect(plan([{ op: 'reorder', ids: ['a', 'a'] }], items)).toEqual({
      ok: false,
      error: 'unread',
    });
  });
});

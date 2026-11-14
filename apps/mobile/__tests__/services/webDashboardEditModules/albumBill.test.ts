import type { AlbumBillExtra } from '~/services/webDashboardEditModules/albumBill';
import {
  type EditLookup,
  type EditStep,
  editTransactionIds,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Account, Category, TransactionSplit, TransactionWithRelations } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const ENTITY = 'module:albumbill';
const GROUP = 'bali';

const account = (id: string) =>
  ({ id, name: id, type: 'debit', currency: 'MYR', updatedAt: AT, deletedAt: null }) as Account;
const category = (id: string, type: 'expense' | 'income') =>
  ({
    id,
    name: id,
    type,
    parentId: null,
    icon: 'meal',
    updatedAt: AT,
    deletedAt: null,
  }) as Category;

const payerSplit = (patch: Partial<TransactionSplit> = {}) =>
  ({
    id: 'payer',
    isPayer: true,
    isSelf: false,
    paidAt: null,
    deletedAt: null,
    ...patch,
  }) as TransactionSplit;

function tx(id: string, patch: Partial<TransactionWithRelations> = {}): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount: 30,
    currency: 'MYR',
    date: AT,
    accountId: 'myr',
    categoryId: 'food',
    note: 'Dinner',
    albumGroupId: GROUP,
    splits: [],
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  } as TransactionWithRelations;
}

function extra(patch: Partial<AlbumBillExtra['groups'][number]> = {}): AlbumBillExtra {
  return {
    groups: [
      {
        id: GROUP,
        selfId: 'me',
        members: [
          { id: 'me', name: 'Me', current: true },
          { id: 'tess', name: 'Tess', current: true },
          { id: 'ali', name: 'Ali', current: true },
          { id: 'gone', name: 'Gone', current: false },
        ],
        bills: [
          {
            id: 'b1',
            date: '2026-10-01',
            note: 'Dinner',
            currency: 'MYR',
            paidBy: 'me',
            shares: [
              { memberId: 'me', amount: 15 },
              { memberId: 'tess', amount: 15 },
            ],
            deleted: false,
          },
          {
            id: 'b2',
            date: '2026-10-01',
            note: 'Taxi',
            currency: 'MYR',
            paidBy: 'tess',
            shares: [
              { memberId: 'me', amount: 5 },
              { memberId: 'tess', amount: 5 },
            ],
            deleted: false,
          },
          {
            id: 'old',
            date: '2026-09-30',
            note: 'Snacks',
            currency: 'MYR',
            paidBy: 'me',
            shares: [{ memberId: 'tess', amount: 4 }],
            deleted: true,
          },
        ],
        ...patch,
      },
    ],
  };
}

function lookup(groups = extra(), transactions = [tx('b1'), tx('b2', { splits: [payerSplit()] })]) {
  return {
    transactions,
    accounts: [account('myr')],
    accountGroups: [],
    categories: [category('food', 'expense'), category('pay', 'income')],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR', 'JPY'],
    isPro: false,
    convert: () => null,
    isCategoryIcon: () => false,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: { [ENTITY]: groups },
  } satisfies EditLookup;
}

function plan(ops: Record<string, unknown>[], at: EditLookup = lookup()) {
  const request = readEditRequest({
    id: 'abcdefgh12345678',
    token: 't',
    ops: ops.map((op) => ({ entity: ENTITY, ...op })),
  });
  if (request.kind !== 'request') return { ok: false as const, error: 'unread' };
  return planEdit(request.request, at);
}

const steps = (result: ReturnType<typeof plan>): EditStep[] =>
  result.ok && 'plan' in result ? result.plan.steps : [];

describe('module:albumbill reading', () => {
  it('reads each op strictly', () => {
    expect(plan([{ op: 'update', id: 'b1', at: AT, set: {} }])).toEqual({
      ok: false,
      error: 'unread',
    });
    // The payer and the shares travel together.
    expect(plan([{ op: 'update', id: 'b1', at: AT, set: { paidBy: 'me' } }])).toEqual({
      ok: false,
      error: 'unread',
    });
    expect(plan([{ op: 'update', id: 'b1', at: AT, set: { amount: 40 } }]).ok).toBe(false);
    expect(
      plan([
        {
          op: 'update',
          id: 'b1',
          at: AT,
          set: { paidBy: 'me', shares: [{ memberId: 'me', amount: 1, extra: 1 }] },
        },
      ]),
    ).toEqual({ ok: false, error: 'unread' });
    expect(plan([{ op: 'restore', albumId: GROUP }])).toEqual({ ok: false, error: 'unread' });
  });

  it('names the entries it touches', () => {
    const request = readEditRequest({
      id: 'abcdefgh12345678',
      token: 't',
      ops: [
        { entity: ENTITY, op: 'update', id: 'b1', at: AT, set: { note: 'x' } },
        { entity: ENTITY, op: 'delete', rows: [{ id: 'b2', at: AT }] },
        { entity: ENTITY, op: 'restore', albumId: GROUP, billId: 'old' },
      ],
    });
    expect(request.kind === 'request' && editTransactionIds(request.request)).toEqual(['b1', 'b2']);
  });
});

describe('module:albumbill update', () => {
  it('saves the whole bill through the group with any current member as the payer', () => {
    const result = plan([
      {
        op: 'update',
        id: 'b1',
        at: AT,
        set: {
          note: ' Big dinner ',
          paidBy: 'ali',
          shares: [
            { memberId: 'me', amount: 10 },
            { memberId: 'tess', amount: 10 },
          ],
        },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(steps(result)).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'save',
        payload: {
          id: 'b1',
          groupId: GROUP,
          date: null,
          note: 'Big dinner',
          currency: 'MYR',
          rows: [
            { personName: null, amount: 10, isSelf: true, isPayer: false, albumMemberId: null },
            {
              personName: 'Tess',
              amount: 10,
              isSelf: false,
              isPayer: false,
              albumMemberId: 'tess',
            },
            // Ali paid and has no share of their own.
            { personName: 'Ali', amount: 0, isSelf: false, isPayer: true, albumMemberId: 'ali' },
          ],
          own: {},
        },
      },
    ]);
  });

  it('keeps the shares and the payer when only the day or title changes', () => {
    const result = plan([{ op: 'update', id: 'b2', at: AT, set: { date: '2026-10-03' } }]);
    const [step] = steps(result);
    expect(step.kind === 'module' && step.payload).toMatchObject({
      date: '2026-10-03',
      note: 'Taxi',
      rows: [
        { albumMemberId: null, amount: 5, isSelf: true, isPayer: false },
        { albumMemberId: 'tess', amount: 5, isSelf: false, isPayer: true },
      ],
    });
  });

  it('saves only the user own fields on their entry when nothing of the group changed', () => {
    const result = plan([
      {
        op: 'update',
        id: 'b1',
        at: AT,
        set: { categoryId: 'food', details: 'Ramen', accountId: 'myr' },
      },
    ]);
    expect(steps(result)).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'own',
        payload: { id: 'b1', own: { categoryId: 'food', details: 'Ramen', accountId: 'myr' } },
      },
    ]);
  });

  it('refuses who cannot be on the bill, a bill nobody else shares and the wrong category', () => {
    const shares = (paidBy: string, list: [string, number][]) => ({
      paidBy,
      shares: list.map(([memberId, amount]) => ({ memberId, amount })),
    });
    const update = (set: Record<string, unknown>) =>
      plan([{ op: 'update', id: 'b1', at: AT, set }]);
    // Someone who left is not put on a bill they were not already on.
    expect(
      update(
        shares('me', [
          ['me', 5],
          ['gone', 5],
        ]),
      ),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(update(shares('stranger', [['me', 5]]))).toEqual({ ok: false, error: 'invalid' });
    expect(update(shares('me', [['me', 10]]))).toEqual({ ok: false, error: 'invalid' });
    expect(
      update(
        shares('tess', [
          ['me', 0],
          ['tess', 0],
        ]),
      ),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(update({ categoryId: 'pay' })).toEqual({ ok: false, error: 'invalid' });
    expect(update({ currency: 'EUR' })).toEqual({ ok: false, error: 'invalid' });
    expect(update({ currency: 'JPY' }).ok).toBe(true);
  });

  it('refuses a stale row, a bill no longer the group, and an album the user left', () => {
    expect(plan([{ op: 'update', id: 'b1', at: 'older', set: { note: 'x' } }])).toEqual({
      ok: false,
      error: 'conflict',
    });
    expect(
      plan(
        [{ op: 'update', id: 'b1', at: AT, set: { note: 'x' } }],
        lookup(extra({ selfId: null })),
      ),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      plan(
        [{ op: 'update', id: 'b1', at: AT, set: { note: 'x' } }],
        lookup(extra(), [tx('b1', { albumGroupId: null })]),
      ),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      plan([{ op: 'update', id: 'b1', at: AT, set: { note: 'x' } }], lookup(extra({ bills: [] }))),
    ).toEqual({ ok: false, error: 'conflict' });
  });
});

describe('module:albumbill bulk, delete and restore', () => {
  it('puts the user own account only on bills they paid', () => {
    expect(
      steps(plan([{ op: 'bulk', rows: [{ id: 'b1', at: AT }], set: { accountId: 'myr' } }])),
    ).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'bulk',
        payload: { ids: ['b1'], accountId: 'myr' },
      },
    ]);
    expect(plan([{ op: 'bulk', rows: [{ id: 'b2', at: AT }], set: { accountId: 'myr' } }])).toEqual(
      {
        ok: false,
        error: 'invalid',
      },
    );
    // Paid back: the account the money left is the user's.
    const paidBack = lookup(extra(), [tx('b2', { splits: [payerSplit({ paidAt: AT })] })]);
    expect(
      plan([{ op: 'bulk', rows: [{ id: 'b2', at: AT }], set: { accountId: 'myr' } }], paidBack).ok,
    ).toBe(true);
  });

  it('changes the day and title of several bills for everyone', () => {
    const result = plan([
      {
        op: 'bulk',
        rows: [
          { id: 'b1', at: AT },
          { id: 'b2', at: AT },
        ],
        set: { date: '2026-10-05', note: ' Trip ' },
      },
    ]);
    expect(result.ok && 'plan' in result && result.plan.count).toBe(2);
    expect(steps(result)[0]).toMatchObject({
      payload: { ids: ['b1', 'b2'], date: '2026-10-05', note: 'Trip' },
    });
  });

  it('deletes bills for everyone and restores a deleted one', () => {
    expect(steps(plan([{ op: 'delete', rows: [{ id: 'b1', at: AT }] }]))).toEqual([
      { kind: 'module', entity: ENTITY, action: 'delete', payload: { ids: ['b1'] } },
    ]);
    expect(steps(plan([{ op: 'restore', albumId: GROUP, billId: 'old' }]))).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'restore',
        payload: { groupId: GROUP, billId: 'old' },
      },
    ]);
    // Someone brought it back first.
    expect(plan([{ op: 'restore', albumId: GROUP, billId: 'b1' }])).toEqual({
      ok: false,
      error: 'conflict',
    });
    expect(plan([{ op: 'restore', albumId: 'other', billId: 'old' }])).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('names each bill once per batch', () => {
    expect(
      plan([
        { op: 'update', id: 'b1', at: AT, set: { note: 'x' } },
        { op: 'delete', rows: [{ id: 'b1', at: AT }] },
      ]),
    ).toEqual({ ok: false, error: 'invalid' });
  });
});

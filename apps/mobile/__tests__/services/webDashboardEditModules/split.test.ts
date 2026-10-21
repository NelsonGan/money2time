import {
  type EditLookup,
  type EditStep,
  editTransactionIds,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Account, Category, TransactionSplit, TransactionWithRelations } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const SPLIT_AT = '2026-10-02T10:00:00.000Z';
const ENTITY = 'module:split';

const account = (id: string, patch: Partial<Account> = {}) =>
  ({
    id,
    name: id,
    type: 'debit',
    currency: 'MYR',
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Account;
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

const split = (id: string, patch: Partial<TransactionSplit> = {}): TransactionSplit => ({
  id,
  transactionId: 'bill',
  personName: id,
  amount: 5,
  isSelf: false,
  paybackAccountId: 'myr',
  paidAt: null,
  paidTransactionId: null,
  sortOrder: 0,
  createdAt: AT,
  updatedAt: SPLIT_AT,
  deletedAt: null,
  ...patch,
});

function tx(id: string, patch: Partial<TransactionWithRelations> = {}): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'MYR',
    date: AT,
    accountId: 'myr',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'food',
    note: 'Dinner',
    details: null,
    sentiment: 'neutral',
    reimbursable: false,
    reimbursedAt: null,
    reimbursementAccountId: null,
    reimbursementOfId: null,
    reimbursementTransactionId: null,
    countsAsExpense: false,
    accountAmount: null,
    toAmount: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  } as TransactionWithRelations;
}

const bill = (splits: TransactionSplit[], patch: Partial<TransactionWithRelations> = {}) =>
  tx('bill', { splits, ...patch });

function lookup(
  transactions: TransactionWithRelations[] = [],
  patch: Partial<EditLookup> = {},
  unpaidBills = 0,
): EditLookup {
  return {
    transactions,
    accounts: [account('myr'), account('card'), account('old', { deletedAt: AT })],
    accountGroups: [],
    categories: [category('food', 'expense'), category('salary', 'income')],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro: true,
    convert: () => null,
    isCategoryIcon: () => true,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20, 14, 30),
    extras: { [ENTITY]: { unpaidBills } },
    ...patch,
  };
}

const plan = (ops: Record<string, unknown>[], data: EditLookup = lookup()) => {
  const read = readEditRequest({
    id: 'aaaaaaaaaaaaaaaa',
    token: 't',
    ops: ops.map((op) => ({ entity: ENTITY, ...op })),
  });
  if (read.kind !== 'request') return { ok: false as const, error: 'unread' };
  return planEdit(read.request, data);
};
const steps = (result: ReturnType<typeof plan>): EditStep[] =>
  result.ok && 'plan' in result ? result.plan.steps : [];
const payloadOf = (result: ReturnType<typeof plan>) =>
  (steps(result)[0] as Extract<EditStep, { kind: 'module' }>).payload;

const me = (amount: number, extra: Record<string, unknown> = {}) => ({
  name: 'Me',
  amount,
  isSelf: true,
  paybackAccountId: null,
  ...extra,
});
const friend = (name: string, amount: number, extra: Record<string, unknown> = {}) => ({
  name,
  amount,
  isSelf: false,
  paybackAccountId: 'myr',
  ...extra,
});
const NEW_TX = {
  type: 'expense',
  amount: 30,
  categoryId: 'food',
  accountId: 'myr',
  date: '2026-10-20',
};

describe('module:split read', () => {
  it('reads each op and nothing else', () => {
    const read = (op: Record<string, unknown>) =>
      readEditRequest({ id: 'aaaaaaaaaaaaaaaa', token: 't', ops: [{ entity: ENTITY, ...op }] })
        .kind;
    expect(read({ op: 'create', tx: NEW_TX, splits: [me(15), friend('Ann', 15)] })).toBe('request');
    expect(read({ op: 'create', tx: NEW_TX, splits: [me(15)], extra: 1 })).toBe('invalid');
    // A new row has no id and cannot come paid.
    expect(read({ op: 'create', tx: NEW_TX, splits: [{ ...me(15), id: 'x' }] })).toBe('invalid');
    expect(read({ op: 'create', tx: { ...NEW_TX, bogus: 1 }, splits: [] })).toBe('invalid');
    expect(read({ op: 'create', tx: NEW_TX, splits: [friend('Ann', -1)] })).toBe('invalid');
    expect(read({ op: 'create', tx: NEW_TX, splits: [friend('Ann', Infinity)] })).toBe('invalid');
    expect(
      read({
        op: 'update',
        id: 'bill',
        at: AT,
        set: {},
        splits: [friend('Ann', 1, { paid: true })],
      }),
    ).toBe('request');
    expect(read({ op: 'update', id: 'x'.repeat(65), at: AT, set: {}, splits: [] })).toBe('invalid');
    expect(read({ op: 'settle', id: 's1', txId: 'bill', at: SPLIT_AT })).toBe('request');
    expect(
      read({ op: 'settle', id: 's1', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'card' }),
    ).toBe('request');
    expect(
      read({ op: 'unsettle', id: 's1', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'card' }),
    ).toBe('invalid');
    expect(read({ op: 'forget', id: 's1', txId: 'bill', at: SPLIT_AT })).toBe('invalid');
  });

  it('loads the transactions it names', () => {
    const read = readEditRequest({
      id: 'aaaaaaaaaaaaaaaa',
      token: 't',
      ops: [
        { entity: ENTITY, op: 'update', id: 'bill', at: AT, set: {}, splits: [] },
        { entity: ENTITY, op: 'settle', id: 's1', txId: 'other', at: SPLIT_AT },
      ],
    });
    if (read.kind !== 'request') throw new Error('unread');
    expect(editTransactionIds(read.request)).toEqual(['bill', 'other']);
  });
});

describe('module:split create', () => {
  it('saves a new expense with its rows, the payback falling back to its account', () => {
    const result = plan([
      {
        op: 'create',
        tx: NEW_TX,
        splits: [me(10), friend('Ann', 10), friend(' Bo ', 10, { paybackAccountId: null })],
      },
    ]);
    expect(result.ok).toBe(true);
    const payload = payloadOf(result);
    expect((payload.input as Record<string, unknown>).amount).toBe(30);
    expect(payload.splits).toEqual([
      { personName: 'Me', amount: 10, isSelf: true, paybackAccountId: 'myr', sortOrder: 0 },
      { personName: 'Ann', amount: 10, isSelf: false, paybackAccountId: 'myr', sortOrder: 1 },
      { personName: 'Bo', amount: 10, isSelf: false, paybackAccountId: 'myr', sortOrder: 2 },
    ]);
  });

  it('refuses rows that do not add up, or no friend, or not an expense', () => {
    expect(plan([{ op: 'create', tx: NEW_TX, splits: [me(10), friend('Ann', 10)] }])).toMatchObject(
      {
        ok: false,
        error: 'invalid',
      },
    );
    expect(plan([{ op: 'create', tx: NEW_TX, splits: [me(30)] }])).toMatchObject({
      error: 'invalid',
    });
    expect(
      plan([{ op: 'create', tx: NEW_TX, splits: [friend('A', 15), friend('B', 15)] }]),
    ).toMatchObject({ error: 'invalid' });
    expect(
      plan([
        {
          op: 'create',
          tx: { ...NEW_TX, type: 'income', categoryId: 'salary' },
          splits: [me(15), friend('Ann', 15)],
        },
      ]),
    ).toMatchObject({ error: 'invalid' });
    expect(
      plan([
        {
          op: 'create',
          tx: NEW_TX,
          splits: [me(15), friend('Ann', 15, { paybackAccountId: 'old' })],
        },
      ]),
    ).toMatchObject({ error: 'invalid' });
  });

  it('keeps the free plan to three unsettled bills, counting this batch', () => {
    const op = { op: 'create', tx: NEW_TX, splits: [me(15), friend('Ann', 15)] };
    expect(plan([op], lookup([], { isPro: false }, 3))).toMatchObject({
      error: 'pro_required',
      feature: 'split_bills',
    });
    expect(plan([op], lookup([], { isPro: false }, 2)).ok).toBe(true);
    expect(plan([op, op], lookup([], { isPro: false }, 2))).toMatchObject({
      error: 'pro_required',
    });
    expect(plan([op, op], lookup([], { isPro: true }, 9)).ok).toBe(true);
  });
});

describe('module:split update', () => {
  const saved = [
    split('self', { isSelf: true, personName: 'Me', paybackAccountId: null }),
    split('ann'),
  ];
  const update = (splits: Record<string, unknown>[], set: Record<string, unknown> = {}) => ({
    op: 'update',
    id: 'bill',
    at: AT,
    set,
    splits,
  });

  it('rewrites the rows, then the changed amount', () => {
    const result = plan(
      [
        update([me(6, { id: 'self' }), friend('Ann', 6, { id: 'ann' }), friend('Cy', 6)], {
          amount: 18,
        }),
      ],
      lookup([bill(saved)]),
    );
    expect(result.ok).toBe(true);
    const payload = payloadOf(result);
    expect(payload.splits).toEqual([
      {
        id: 'self',
        personName: 'Me',
        amount: 6,
        isSelf: true,
        paybackAccountId: 'myr',
        sortOrder: 0,
      },
      {
        id: 'ann',
        personName: 'Ann',
        amount: 6,
        isSelf: false,
        paybackAccountId: 'myr',
        sortOrder: 1,
      },
      { personName: 'Cy', amount: 6, isSelf: false, paybackAccountId: 'myr', sortOrder: 2 },
    ]);
    expect(payload.markPaid).toEqual([]);
    expect(payload.input).toEqual({ amount: 18, accountAmount: null });
  });

  it('stages Mark paid and Undo, and writes the final amount', () => {
    const paidCy = split('cy', { paidAt: AT, amount: 4, paybackAccountId: 'card' });
    const result = plan(
      [
        update(
          [
            me(5, { id: 'self' }),
            friend('Ann', 5, { id: 'ann', paid: true, paybackAccountId: 'card' }),
            friend('cy', 4, { id: 'cy', paybackAccountId: 'card' }),
          ],
          { amount: 9 },
        ),
      ],
      lookup([bill([...saved, paidCy], { amount: 10 })]),
    );
    expect(result.ok).toBe(true);
    const payload = payloadOf(result);
    expect(payload.markPaid).toEqual([{ id: 'ann', paybackAccountId: 'card' }]);
    expect(payload.markUnpaid).toEqual(['cy']);
    expect(payload.input).toMatchObject({ amount: 9 });
  });

  it('keeps a paid share as it was and Me by its id', () => {
    const paid = split('ann', { paidAt: AT });
    const data = lookup([bill([saved[0], paid], { amount: 5 })]);
    expect(
      plan([update([me(5, { id: 'self' }), friend('ann', 5, { id: 'ann', paid: true })])], data).ok,
    ).toBe(true);
    expect(
      plan(
        [
          update([
            me(4, { id: 'self' }),
            friend('ann', 6, { id: 'ann', paid: true }),
            friend('B', 1),
          ]),
        ],
        data,
      ),
    ).toMatchObject({ error: 'invalid' });
    // A paid share cannot be dropped, nor Me replaced.
    expect(plan([update([me(5, { id: 'self' }), friend('B', 0)])], data)).toMatchObject({
      error: 'invalid',
    });
    expect(
      plan([update([me(5), friend('ann', 5, { id: 'ann', paid: true })])], data),
    ).toMatchObject({ error: 'invalid' });
  });

  it('clears the rows when none are left, but only on a bill', () => {
    const result = plan([update([], { note: 'Solo' })], lookup([bill(saved)]));
    expect(result.ok).toBe(true);
    expect(payloadOf(result)).toMatchObject({ splits: [], input: { note: 'Solo' } });
    expect(plan([update([])], lookup([tx('bill')]))).toMatchObject({ error: 'invalid' });
  });

  it('refuses a stale copy, a bad sum, and a new paid row', () => {
    const rows = [me(5, { id: 'self' }), friend('Ann', 5, { id: 'ann' })];
    expect(plan([{ ...update(rows), at: 'old' }], lookup([bill(saved)]))).toMatchObject({
      error: 'conflict',
    });
    expect(plan([update(rows)], lookup([]))).toMatchObject({ error: 'conflict' });
    expect(plan([update(rows, { amount: 12 })], lookup([bill(saved)]))).toMatchObject({
      error: 'invalid',
    });
    expect(
      plan([update([...rows, friend('Cy', 0, { paid: true })])], lookup([bill(saved)])),
    ).toMatchObject({ error: 'invalid' });
  });

  it('gates starting a bill on an expense, not managing one', () => {
    const rows = [me(5), friend('Ann', 5)];
    const free = (transactions: TransactionWithRelations[]) =>
      lookup(transactions, { isPro: false }, 3);
    expect(plan([update(rows)], free([tx('bill')]))).toMatchObject({
      error: 'pro_required',
      feature: 'split_bills',
    });
    expect(
      plan([update([me(5, { id: 'self' }), friend('Ann', 5, { id: 'ann' })])], free([bill(saved)]))
        .ok,
    ).toBe(true);
  });
});

describe('module:split settle', () => {
  const data = lookup([bill([split('ann'), split('bo', { paidAt: AT })])]);

  it('marks a share paid, into the account picked or the share’s own', () => {
    const own = plan([{ op: 'settle', id: 'ann', txId: 'bill', at: SPLIT_AT }], data);
    expect(payloadOf(own)).toEqual({ splitId: 'ann' });
    const picked = plan(
      [{ op: 'settle', id: 'ann', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'card' }],
      data,
    );
    expect(payloadOf(picked)).toEqual({ splitId: 'ann', paybackAccountId: 'card' });
    expect(
      plan(
        [{ op: 'settle', id: 'ann', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'old' }],
        data,
      ),
    ).toMatchObject({ error: 'invalid' });
  });

  it('undoes a paid share', () => {
    expect(
      payloadOf(plan([{ op: 'unsettle', id: 'bo', txId: 'bill', at: SPLIT_AT }], data)),
    ).toEqual({
      splitId: 'bo',
    });
    expect(plan([{ op: 'unsettle', id: 'ann', txId: 'bill', at: SPLIT_AT }], data)).toMatchObject({
      error: 'invalid',
    });
    expect(plan([{ op: 'settle', id: 'bo', txId: 'bill', at: SPLIT_AT }], data)).toMatchObject({
      error: 'invalid',
    });
  });

  it('refuses a share changed or gone, and one named twice', () => {
    expect(plan([{ op: 'settle', id: 'ann', txId: 'bill', at: AT }], data)).toMatchObject({
      error: 'conflict',
    });
    expect(plan([{ op: 'settle', id: 'zed', txId: 'bill', at: SPLIT_AT }], data)).toMatchObject({
      error: 'conflict',
    });
    const op = { op: 'settle', id: 'ann', txId: 'bill', at: SPLIT_AT };
    expect(plan([op, op], data)).toMatchObject({ error: 'invalid' });
  });
});

describe('module:split share and settings ops', () => {
  const data = lookup([bill([split('ann'), split('bo', { paidAt: AT })])]);

  it('removes a share still owed and re-points its payback account', () => {
    expect(
      payloadOf(plan([{ op: 'remove', id: 'ann', txId: 'bill', at: SPLIT_AT }], data)),
    ).toEqual({
      splitId: 'ann',
    });
    expect(plan([{ op: 'remove', id: 'bo', txId: 'bill', at: SPLIT_AT }], data)).toMatchObject({
      error: 'invalid',
    });
    expect(
      payloadOf(
        plan(
          [{ op: 'payback', id: 'ann', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'card' }],
          data,
        ),
      ),
    ).toEqual({ splitId: 'ann', paybackAccountId: 'card' });
    expect(
      plan(
        [{ op: 'payback', id: 'ann', txId: 'bill', at: SPLIT_AT, paybackAccountId: 'old' }],
        data,
      ),
    ).toMatchObject({ error: 'invalid' });
    expect(plan([{ op: 'payback', id: 'ann', txId: 'bill', at: SPLIT_AT }], data)).toMatchObject({
      error: 'unread',
    });
  });

  it('sets the default payback account to a live account', () => {
    expect(payloadOf(plan([{ op: 'default_payback', accountId: 'card' }]))).toEqual({
      accountId: 'card',
    });
    expect(plan([{ op: 'default_payback', accountId: 'old' }])).toMatchObject({ error: 'invalid' });
  });

  it('settles several shares of one bill, but never alongside a change to the bill', () => {
    const two = lookup([bill([split('ann'), split('cy')])]);
    const settle = (id: string) => ({ op: 'settle', id, txId: 'bill', at: SPLIT_AT });
    expect(plan([settle('ann'), settle('cy')], two)).toMatchObject({ ok: true });
    const note = {
      entity: 'transaction',
      op: 'update',
      rows: [{ id: 'bill', at: AT }],
      set: { note: 'x' },
    };
    const remove = { entity: 'transaction', op: 'delete', rows: [{ id: 'bill', at: AT }] };
    for (const change of [note, remove]) {
      expect(plan([settle('ann'), change], two)).toMatchObject({ error: 'invalid' });
      expect(plan([change, settle('ann')], two)).toMatchObject({ error: 'invalid' });
    }
    const paid = lookup([bill([split('ann'), split('bo', { paidAt: AT })])]);
    for (const [op, id] of [
      ['unsettle', 'bo'],
      ['remove', 'ann'],
    ]) {
      expect(plan([{ op, id, txId: 'bill', at: SPLIT_AT }], paid)).toMatchObject({ ok: true });
      expect(plan([{ op, id, txId: 'bill', at: SPLIT_AT }, note], paid)).toMatchObject({
        error: 'invalid',
      });
    }
  });

  it('does not read an impossible day', () => {
    expect(
      plan([
        { op: 'create', tx: { ...NEW_TX, date: '2026-02-30' }, splits: [me(15), friend('A', 15)] },
      ]),
    ).toMatchObject({ error: 'unread' });
  });
});

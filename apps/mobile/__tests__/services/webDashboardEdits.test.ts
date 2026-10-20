import {
  createdAt,
  type EditLookup,
  type EditStep,
  editTransactionIds,
  MAX_EDIT_ROWS,
  planEdit,
  planKind,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type {
  Account,
  AccountGroup,
  Category,
  RecurringTransactionRule,
  TransactionWithRelations,
} from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const NOW = new Date(2026, 9, 20, 14, 30);

function tx(id: string, patch: Partial<TransactionWithRelations> = {}): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'MYR',
    date: '2026-10-01T10:00:00.000Z',
    accountId: 'myr',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'food',
    note: 'Lunch',
    details: null,
    sentiment: 'neutral',
    reimbursable: false,
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

const account = (id: string, patch: Partial<Account> = {}) =>
  ({
    id,
    name: id,
    type: 'debit',
    currency: 'MYR',
    startingBalance: 0,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Account;
const category = (id: string, type: 'expense' | 'income', patch: Partial<Category> = {}) =>
  ({
    id,
    name: id,
    type,
    parentId: null,
    icon: 'meal',
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Category;
const rule = (id: string, patch: Partial<RecurringTransactionRule> = {}) =>
  ({
    id,
    name: 'Netflix',
    type: 'expense',
    amount: 50,
    currency: 'MYR',
    accountId: 'myr',
    categoryId: 'food',
    fromAccountId: null,
    toAccountId: null,
    note: null,
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: AT,
    endDate: null,
    isActive: true,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as RecurringTransactionRule;

function lookup(patch: Partial<EditLookup> = {}): EditLookup {
  return {
    transactions: [],
    accounts: [
      account('myr'),
      account('usd', { currency: 'USD' }),
      account('card', { type: 'credit' }),
      account('old', { deletedAt: AT }),
    ],
    accountGroups: [{ id: 'g1', name: 'Bank', deletedAt: null } as AccountGroup],
    categories: [
      category('food', 'expense'),
      category('coffee', 'expense', { parentId: 'food' }),
      category('salary', 'income'),
    ],
    recurringRules: [],
    balances: new Map([['myr', 100]]),
    reportingCurrency: 'MYR',
    currencies: ['MYR', 'USD'],
    isPro: true,
    convert: (amount, from, to) => (from === 'USD' && to === 'MYR' ? amount * 4 : amount / 4),
    isCategoryIcon: (id) => id === 'meal' || id === 'coffee',
    suggestIcon: () => 'coffee',
    now: NOW,
    ...patch,
  };
}

const request = (ops: unknown[]) => {
  const read = readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 'tok', ops });
  if (read.kind !== 'request') throw new Error('unreadable');
  return read.request;
};

function steps(ops: unknown[], data: Partial<EditLookup> = {}): EditStep[] {
  const result = planEdit(request(ops), lookup(data));
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.plan.steps;
}

function refusal(ops: unknown[], data: Partial<EditLookup> = {}) {
  const result = planEdit(request(ops), lookup(data));
  if (result.ok) return null;
  return result.feature
    ? { error: result.error, feature: result.feature }
    : { error: result.error };
}

const update = (id: string, set: Record<string, unknown>) => ({
  entity: 'transaction',
  op: 'update',
  rows: [{ id, at: AT }],
  set,
});

describe('readEditRequest', () => {
  it('reads every entity', () => {
    const read = request([
      {
        entity: 'transaction',
        op: 'create',
        tx: { type: 'expense', amount: 5, date: '2026-10-02' },
      },
      update('a', { note: 'x' }),
      { entity: 'transaction', op: 'delete', rows: [{ id: 'b', at: AT }] },
      { entity: 'account', op: 'create', account: { name: 'Wallet' } },
      { entity: 'group', op: 'update', id: 'g1', name: 'Banks' },
      { entity: 'category', op: 'delete', id: 'food', at: AT, reassignTo: 'coffee' },
      { entity: 'recurring', op: 'update', id: 'r1', at: AT, set: { isActive: false } },
    ]);
    expect(read.ops).toHaveLength(7);
    expect(editTransactionIds(read)).toEqual(['a', 'b']);
  });

  it.each([
    ['an unknown entity', [{ entity: 'album', op: 'create' }]],
    ['an unknown field', [{ entity: 'transaction', op: 'create', tx: { colour: 'red' } }]],
    ['an empty update', [update('a', {})]],
    ['no rows', [{ entity: 'transaction', op: 'delete', rows: [] }]],
    ['a bad date', [update('a', { date: '2026-02-30' })]],
    ['an endless amount', [update('a', { amount: Infinity })]],
    ['a long note', [update('a', { note: 'x'.repeat(501) })]],
    ['a made-up feeling', [update('a', { sentiment: 'angry' })]],
    ['a lowercase currency', [{ entity: 'account', op: 'create', account: { currency: 'myr' } }]],
    ['a day 32', [{ entity: 'account', op: 'create', account: { creditDueDay: 32 } }]],
    ['a made-up repeat', [{ entity: 'recurring', op: 'create', rule: { pattern: 'hourly' } }]],
    ['no ops', []],
  ])('refuses %s', (_name, ops) => {
    expect(readEditRequest({ id: 'abcdefghijklmnop', token: 't', ops }).kind).toBe('invalid');
  });
});

describe('transactions', () => {
  it('adds an expense like the app editor: account currency, category name as the note', () => {
    expect(
      steps([
        {
          entity: 'transaction',
          op: 'create',
          tx: {
            type: 'expense',
            amount: 3,
            date: '2026-10-18',
            categoryId: 'coffee',
            accountId: 'myr',
            note: ' ',
          },
        },
      ]),
    ).toEqual([
      {
        kind: 'tx.create',
        input: expect.objectContaining({
          type: 'expense',
          amount: 3,
          currency: 'MYR',
          accountAmount: null,
          categoryId: 'coffee',
          note: 'food / coffee',
          date: new Date(2026, 9, 18).toISOString(),
        }),
      },
    ]);
  });

  it('converts an entry in another currency into the account currency', () => {
    const [step] = steps([
      {
        entity: 'transaction',
        op: 'create',
        tx: {
          type: 'expense',
          amount: 5,
          currency: 'USD',
          date: '2026-10-20',
          categoryId: 'food',
          accountId: 'myr',
        },
      },
    ]);
    expect(step).toMatchObject({
      input: { currency: 'USD', accountAmount: 20, date: NOW.toISOString() },
    });
  });

  it('adds a cross-currency transfer with the received amount at the cached rate', () => {
    const [step] = steps([
      {
        entity: 'transaction',
        op: 'create',
        tx: { type: 'transfer', amount: 10, fromAccountId: 'usd', toAccountId: 'myr' },
      },
    ]);
    expect(step).toMatchObject({
      input: {
        type: 'transfer',
        currency: 'USD',
        toAmount: 40,
        accountId: null,
        categoryId: null,
        sentiment: 'neutral',
      },
    });
  });

  it('refuses a transfer to itself, and a counted one with an income category', () => {
    const transfer = (extra: Record<string, unknown>) => [
      {
        entity: 'transaction',
        op: 'create',
        tx: { type: 'transfer', amount: 1, fromAccountId: 'myr', ...extra },
      },
    ];
    expect(refusal(transfer({ toAccountId: 'myr' }))).toEqual({ error: 'invalid' });
    expect(
      refusal(transfer({ toAccountId: 'card', countsAsExpense: true, categoryId: 'salary' })),
    ).toEqual({ error: 'invalid' });
  });

  it('refuses an expense without a category, and a new adjustment', () => {
    expect(
      refusal([
        {
          entity: 'transaction',
          op: 'create',
          tx: { type: 'expense', amount: 1, accountId: 'myr' },
        },
      ]),
    ).toEqual({ error: 'invalid' });
    expect(
      refusal([
        {
          entity: 'transaction',
          op: 'create',
          tx: { type: 'balance_adjustment', amount: 1, accountId: 'myr' },
        },
      ]),
    ).toEqual({ error: 'invalid' });
  });

  it('keeps an entry in its own currency on a new account, re-freezing the account value', () => {
    expect(
      steps([update('a', { accountId: 'usd', note: 'Lunch' })], { transactions: [tx('a')] }),
    ).toEqual([
      {
        kind: 'tx.update',
        updates: [{ id: 'a', input: { accountId: 'usd', accountAmount: 2.5 } }],
      },
    ]);
  });

  it('keeps a deleted category on its rows, and edits them', () => {
    const categories = [category('food', 'expense', { deletedAt: AT })];
    expect(steps([update('a', { note: 'x' })], { transactions: [tx('a')], categories })).toEqual([
      { kind: 'tx.update', updates: [{ id: 'a', input: { note: 'x' } }] },
    ]);
  });

  it('edits a note without a rate for the entry currency', () => {
    expect(
      steps([update('a', { note: 'x' })], {
        transactions: [tx('a', { currency: 'EUR', accountAmount: 40 })],
        convert: () => null,
      }),
    ).toEqual([{ kind: 'tx.update', updates: [{ id: 'a', input: { note: 'x' } }] }]);
  });

  it('edits a legacy adjustment and keeps its stored type', () => {
    const legacy = tx('l', { type: 'transfer', accountId: 'myr', categoryId: null });
    expect(steps([update('l', { amount: -5 })], { transactions: [legacy] })).toEqual([
      { kind: 'tx.update', updates: [{ id: 'l', input: { amount: -5, accountAmount: null } }] },
    ]);
  });

  it('keeps a paid-back expense reimbursable, as the app does', () => {
    expect(
      refusal([update('a', { reimbursable: false })], {
        transactions: [tx('a', { reimbursable: true, reimbursedAt: AT })],
      }),
    ).toEqual({ error: 'invalid' });
  });

  it('leaves a day that is already right, and its time, alone', () => {
    expect(
      steps([update('a', { date: '2026-10-01', sentiment: 'happy' })], {
        transactions: [tx('a', { date: new Date(2026, 9, 1, 9).toISOString() })],
      }),
    ).toEqual([{ kind: 'tx.update', updates: [{ id: 'a', input: { sentiment: 'happy' } }] }]);
  });

  it('refuses a row changed on the phone, or gone', () => {
    expect(
      refusal([{ entity: 'transaction', op: 'delete', rows: [{ id: 'a', at: AT }] }], {
        transactions: [tx('a', { updatedAt: '2026-10-05T00:00:00.000Z' })],
      }),
    ).toEqual({ error: 'conflict' });
    expect(
      refusal([{ entity: 'transaction', op: 'delete', rows: [{ id: 'gone', at: AT }] }]),
    ).toEqual({ error: 'conflict' });
  });

  it('keeps amounts the app keeps in step', () => {
    const shared = tx('s', { splits: [{ id: 'x' }] as TransactionWithRelations['splits'] });
    const refund = tx('r', { reimbursementOfId: 'e', type: 'income', categoryId: 'salary' });
    for (const row of [shared, refund]) {
      expect(refusal([update(row.id, { amount: 4 })], { transactions: [row] })).toEqual({
        error: 'amount_locked',
      });
    }
  });

  it('gates pending reimbursement on Pro, never its removal', () => {
    expect(
      refusal([update('a', { reimbursable: true })], { isPro: false, transactions: [tx('a')] }),
    ).toEqual({ error: 'pro_required', feature: 'reimbursements' });
    expect(
      refusal([update('a', { reimbursable: false })], {
        isPro: false,
        transactions: [tx('a', { reimbursable: true })],
      }),
    ).toBeNull();
  });

  it('refuses one amount for many rows, a row named twice, and too many rows', () => {
    const data = { transactions: [tx('a'), tx('b')] };
    expect(
      refusal(
        [
          {
            entity: 'transaction',
            op: 'update',
            rows: [
              { id: 'a', at: AT },
              { id: 'b', at: AT },
            ],
            set: { amount: 2 },
          },
        ],
        data,
      ),
    ).toEqual({ error: 'invalid' });
    expect(
      refusal(
        [
          update('a', { note: 'x' }),
          { entity: 'transaction', op: 'delete', rows: [{ id: 'a', at: AT }] },
        ],
        data,
      ),
    ).toEqual({ error: 'invalid' });
    const rows = Array.from({ length: MAX_EDIT_ROWS + 1 }, (_, index) => ({
      id: `r${index}`,
      at: AT,
    }));
    expect(
      refusal([{ entity: 'transaction', op: 'delete', rows }], {
        transactions: rows.map((row) => tx(row.id)),
      }),
    ).toEqual({ error: 'invalid' });
  });

  it('stops new entries once a free plan is over its accounts', () => {
    const accounts = Array.from({ length: 7 }, (_, index) => account(`a${index}`));
    expect(
      refusal(
        [
          {
            entity: 'transaction',
            op: 'create',
            tx: { type: 'expense', amount: 1, accountId: 'a0', categoryId: 'food' },
          },
        ],
        { isPro: false, accounts },
      ),
    ).toEqual({ error: 'pro_required', feature: 'accounts' });
  });
});

describe('accounts and groups', () => {
  it('creates a credit account with the editor defaults', () => {
    expect(
      steps([
        {
          entity: 'account',
          op: 'create',
          account: { name: ' Visa ', type: 'credit', group: 'Bank' },
        },
      ]),
    ).toEqual([
      {
        kind: 'account.create',
        input: expect.objectContaining({
          name: 'Visa',
          type: 'credit',
          accountGroup: 'Bank',
          currency: 'MYR',
          startingBalance: 0,
          includeInTotals: true,
          creditStatementDay: 25,
          creditDueDay: 1,
        }),
      },
    ]);
  });

  it('holds a free plan to six accounts', () => {
    const accounts = Array.from({ length: 6 }, (_, index) => account(`a${index}`));
    expect(
      refusal([{ entity: 'account', op: 'create', account: { name: 'x' } }], {
        isPro: false,
        accounts,
      }),
    ).toEqual({ error: 'pro_required', feature: 'accounts' });
  });

  it('records a changed balance the way the person chose', () => {
    const op = (set: Record<string, unknown>) => [
      { entity: 'account', op: 'update', id: 'myr', at: AT, set },
    ];
    expect(steps(op({ balance: 70, balanceRecord: 'difference' }))[0]).toMatchObject({
      adjustment: { type: 'balance_adjustment', amount: -30, currency: 'MYR' },
    });
    expect(steps(op({ balance: 70, balanceRecord: 'flow' }))[0]).toMatchObject({
      adjustment: { type: 'expense', amount: 30 },
    });
    expect(refusal(op({ balance: 70 }))).toEqual({ error: 'invalid' });
  });

  it('converts a changed currency, and leaves a goal’s money to the app', () => {
    expect(
      steps([{ entity: 'account', op: 'update', id: 'myr', at: AT, set: { currency: 'USD' } }])[0],
    ).toMatchObject({ currency: 'USD' });
    expect(
      refusal(
        [
          {
            entity: 'account',
            op: 'update',
            id: 'goal',
            at: AT,
            set: { balance: 5, balanceRecord: 'flow' },
          },
        ],
        { accounts: [account('goal', { type: 'goal' })] },
      ),
    ).toEqual({ error: 'invalid' });
  });

  it('refuses a group name already taken, and an unknown group', () => {
    expect(refusal([{ entity: 'group', op: 'create', name: 'Bank' }])).toEqual({
      error: 'invalid',
    });
    expect(
      refusal([{ entity: 'account', op: 'update', id: 'myr', at: AT, set: { group: 'Nope' } }]),
    ).toEqual({ error: 'invalid' });
  });
});

describe('categories', () => {
  it('suggests an icon for a new top-level category and counts the free limit', () => {
    expect(
      steps([{ entity: 'category', op: 'create', category: { name: 'Cafe', type: 'expense' } }]),
    ).toEqual([
      {
        kind: 'category.create',
        input: { name: 'Cafe', icon: 'coffee', parentId: null, type: 'expense', isDefault: false },
      },
    ]);
    const categories = Array.from({ length: 9 }, (_, index) => category(`c${index}`, 'expense'));
    expect(
      refusal([{ entity: 'category', op: 'create', category: { name: 'x', type: 'expense' } }], {
        isPro: false,
        categories,
      }),
    ).toEqual({ error: 'pro_required', feature: 'categories' });
  });

  it('keeps two levels of one type, and Pro icon packs in the app', () => {
    const set = (fields: Record<string, unknown>) => [
      { entity: 'category', op: 'update', id: 'food', at: AT, set: fields },
    ];
    expect(
      refusal([
        {
          entity: 'category',
          op: 'create',
          category: { name: 'x', type: 'income', parentId: 'food' },
        },
      ]),
    ).toEqual({ error: 'invalid' });
    expect(refusal(set({ parentId: 'salary' }))).toEqual({ error: 'invalid' });
    expect(refusal(set({ icon: 'bold/meal' }))).toEqual({ error: 'invalid' });
    expect(steps(set({ icon: 'emoji:🍜' }))).toHaveLength(1);
  });

  it('moves entries to a category of the same type on delete', () => {
    expect(
      steps([{ entity: 'category', op: 'delete', id: 'coffee', at: AT, reassignTo: 'food' }]),
    ).toEqual([{ kind: 'category.delete', id: 'coffee', reassignTo: 'food' }]);
    expect(
      refusal([{ entity: 'category', op: 'delete', id: 'food', at: AT, reassignTo: 'salary' }]),
    ).toEqual({ error: 'invalid' });
  });
});

describe('recurring rules', () => {
  it('creates a rule in its account currency from picked days', () => {
    const [step] = steps([
      {
        entity: 'recurring',
        op: 'create',
        rule: {
          name: 'Gym',
          type: 'expense',
          amount: 30,
          accountId: 'usd',
          categoryId: 'food',
          pattern: 'weekly',
          interval: 2,
          nextRunDate: '2026-11-01',
          endDate: '2027-01-31',
        },
      },
    ]);
    expect(step).toMatchObject({
      kind: 'recurring.create',
      input: {
        currency: 'USD',
        recurrencePattern: 'weekly',
        recurrenceInterval: 2,
        nextRunDate: new Date(2026, 10, 1).toISOString(),
        endDate: new Date(2027, 0, 31, 23, 59, 59, 999).toISOString(),
        isActive: true,
      },
    });
  });

  it('reports a repayment into a loan the way the loan says', () => {
    const loan = account('loan', {
      type: 'loan',
      loanCountAsExpense: true,
      loanPaymentCategoryId: 'food',
    });
    const [step] = steps(
      [
        {
          entity: 'recurring',
          op: 'create',
          rule: {
            name: 'Car',
            type: 'transfer',
            amount: 500,
            fromAccountId: 'myr',
            toAccountId: 'loan',
            nextRunDate: '2026-11-01',
          },
        },
      ],
      { accounts: [account('myr'), loan] },
    );
    expect(step).toMatchObject({ input: { countsAsExpense: true, categoryId: 'food' } });
  });

  it('pauses a rule, refuses an end before the start, and holds a free plan to five', () => {
    const rules = [rule('r1')];
    const edit = (set: Record<string, unknown>) => [
      { entity: 'recurring', op: 'update', id: 'r1', at: AT, set },
    ];
    expect(steps(edit({ isActive: false }), { recurringRules: rules })[0]).toMatchObject({
      input: { isActive: false, name: 'Netflix' },
    });
    expect(refusal(edit({ endDate: '2026-01-01' }), { recurringRules: rules })).toEqual({
      error: 'invalid',
    });
    expect(
      refusal(
        [
          {
            entity: 'recurring',
            op: 'create',
            rule: {
              name: 'x',
              amount: 1,
              accountId: 'myr',
              categoryId: 'food',
              nextRunDate: '2026-11-01',
            },
          },
        ],
        {
          isPro: false,
          recurringRules: Array.from({ length: 5 }, (_, index) => rule(`r${index}`)),
        },
      ),
    ).toEqual({ error: 'pro_required', feature: 'recurring' });
  });
});

describe('planKind and createdAt', () => {
  it('names a batch by what it did', () => {
    const result = planEdit(request([{ entity: 'group', op: 'create', name: 'Cards' }]), lookup());
    expect(result.ok && planKind(result.plan)).toBe('group_create');
  });

  it('is now for today and the start of the day otherwise', () => {
    expect(createdAt('2026-10-20', NOW)).toBe(NOW.toISOString());
    expect(createdAt('2026-10-18', NOW)).toBe(new Date(2026, 9, 18).toISOString());
  });
});

describe('batch safety', () => {
  it('refuses a batch that uses an account it also deletes', () => {
    expect(
      refusal([
        { entity: 'account', op: 'delete', id: 'usd', at: AT },
        {
          entity: 'transaction',
          op: 'create',
          tx: { type: 'expense', amount: 1, accountId: 'usd', categoryId: 'food' },
        },
      ]),
    ).toEqual({ error: 'invalid' });
  });

  it('refuses a category it deletes as another delete’s target', () => {
    expect(
      refusal([
        { entity: 'category', op: 'delete', id: 'food', at: AT },
        { entity: 'category', op: 'delete', id: 'coffee', at: AT, reassignTo: 'food' },
      ]),
    ).toEqual({ error: 'invalid' });
  });

  it('reads built-in object keys as unknown fields', () => {
    for (const key of ['constructor', 'toString', 'valueOf']) {
      expect(
        readEditRequest({
          id: 'abcdefghijklmnop',
          token: 't',
          ops: [update('a', { [key]: 1 })],
        }).kind,
      ).toBe('invalid');
    }
  });
});

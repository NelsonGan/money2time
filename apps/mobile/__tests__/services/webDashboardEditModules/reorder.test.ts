import { type EditLookup, planEdit, readEditRequest } from '~/services/webDashboardEdits';
import type { Account, AccountGroup, Category } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';

const account = (id: string, patch: Partial<Account> = {}) =>
  ({ id, name: id, type: 'debit', currency: 'MYR', deletedAt: null, ...patch }) as Account;
const group = (id: string, patch: Partial<AccountGroup> = {}) =>
  ({ id, name: id, deletedAt: null, ...patch }) as AccountGroup;
const category = (id: string, type: 'expense' | 'income', parentId: string | null = null) =>
  ({ id, name: id, type, parentId, updatedAt: AT, deletedAt: null }) as Category;

function lookup(patch: Partial<EditLookup> = {}): EditLookup {
  return {
    transactions: [],
    accounts: [
      account('cash'),
      account('card', { type: 'credit' }),
      account('loan', { type: 'loan', loanArchivedAt: AT }),
      account('goal', { type: 'goal' }),
      account('old', { deletedAt: AT }),
    ],
    accountGroups: [group('g1'), group('g2'), group('g3', { deletedAt: AT })],
    categories: [
      category('food', 'expense'),
      category('coffee', 'expense', 'food'),
      category('rent', 'expense'),
      category('salary', 'income'),
      { ...category('gone', 'expense'), deletedAt: AT },
    ],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro: false,
    convert: () => null,
    isCategoryIcon: () => false,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: {},
    ...patch,
  };
}

const read = (ops: unknown[]) =>
  readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 'tok', ops });

function plan(ops: unknown[]) {
  const request = read(ops);
  if (request.kind !== 'request') throw new Error('unreadable');
  return planEdit(request.request, lookup());
}

const op = (verb: string, ids: unknown, extra: Record<string, unknown> = {}) => ({
  entity: 'module:reorder',
  op: verb,
  ids,
  ...extra,
});

describe('module:reorder read', () => {
  it('refuses bad shapes', () => {
    for (const bad of [
      op('accounts', []),
      op('accounts', ['a', 'a']),
      op('accounts', ['a', 7]),
      op('accounts', ['x'.repeat(65)]),
      op('accounts', 'a'),
      op('accounts', ['a'], { type: 'expense' }),
      op('categories', ['a']),
      op('categories', ['a'], { type: 'transfer' }),
      op('albums', ['a']),
      op(
        'accounts',
        Array.from({ length: 501 }, (_, i) => `a${i}`),
      ),
    ]) {
      expect(read([bad]).kind).toBe('invalid');
    }
  });
});

describe('module:reorder plan', () => {
  it('reorders every account the Accounts screen sorts: all but goals, archived loans too', () => {
    const result = plan([op('accounts', ['loan', 'card', 'cash'])]);
    expect(result).toEqual({
      ok: true,
      plan: {
        steps: [
          {
            kind: 'module',
            entity: 'module:reorder',
            action: 'accounts',
            payload: { ids: ['loan', 'card', 'cash'] },
          },
        ],
        count: 3,
        kinds: ['reorder_accounts'],
      },
    });
    expect(plan([op('accounts', ['card', 'cash'])])).toMatchObject({ error: 'conflict' });
    expect(plan([op('accounts', ['loan', 'card', 'cash', 'goal'])])).toMatchObject({
      error: 'conflict',
    });
    expect(plan([op('accounts', ['loan', 'card', 'cash', 'old'])])).toMatchObject({
      error: 'conflict',
    });
  });

  it('reorders the live groups', () => {
    expect(plan([op('groups', ['g2', 'g1'])]).ok).toBe(true);
    expect(plan([op('groups', ['g2', 'g1', 'g3'])])).toMatchObject({ error: 'conflict' });
  });

  it('reorders the categories of one type, parents and children in one list', () => {
    const result = plan([op('categories', ['rent', 'food', 'coffee'], { type: 'expense' })]);
    expect(result.ok && result.plan.steps[0]).toEqual({
      kind: 'module',
      entity: 'module:reorder',
      action: 'categories',
      payload: { ids: ['rent', 'food', 'coffee'] },
    });
    expect(plan([op('categories', ['salary'], { type: 'income' })]).ok).toBe(true);
    expect(
      plan([op('categories', ['rent', 'food', 'coffee', 'salary'], { type: 'expense' })]),
    ).toMatchObject({ error: 'conflict' });
    expect(plan([op('categories', ['rent', 'food'], { type: 'expense' })])).toMatchObject({
      error: 'conflict',
    });
  });

  it('refuses the same list twice in a batch', () => {
    const groups = op('groups', ['g2', 'g1']);
    expect(plan([groups, groups])).toMatchObject({ error: 'invalid' });
    expect(
      plan([
        op('categories', ['salary'], { type: 'income' }),
        op('categories', ['rent', 'food', 'coffee'], { type: 'expense' }),
      ]).ok,
    ).toBe(true);
  });
});

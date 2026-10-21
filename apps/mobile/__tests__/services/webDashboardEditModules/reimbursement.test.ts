import {
  type EditLookup,
  type EditStep,
  editTransactionIds,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Account, TransactionWithRelations } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const ENTITY = 'module:reimbursement';

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

function tx(id: string, patch: Partial<TransactionWithRelations> = {}): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount: 10,
    currency: 'MYR',
    date: AT,
    accountId: 'myr',
    categoryId: 'food',
    note: 'Taxi',
    reimbursable: true,
    reimbursedAt: null,
    reimbursementAccountId: null,
    reimbursementOfId: null,
    reimbursementTransactionId: null,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  } as TransactionWithRelations;
}

function lookup(
  transactions: TransactionWithRelations[],
  patch: Partial<EditLookup> = {},
): EditLookup {
  return {
    transactions,
    accounts: [account('myr'), account('card'), account('old', { deletedAt: AT })],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro: false,
    convert: () => null,
    isCategoryIcon: () => true,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: {},
    ...patch,
  };
}

const plan = (ops: Record<string, unknown>[], data: EditLookup) => {
  const read = readEditRequest({
    id: 'aaaaaaaaaaaaaaaa',
    token: 't',
    ops: ops.map((op) => ({ entity: ENTITY, ...op })),
  });
  if (read.kind !== 'request') return { ok: false as const, error: 'unread' };
  return planEdit(read.request, data);
};
const payloadOf = (result: ReturnType<typeof plan>) =>
  result.ok && 'plan' in result
    ? (result.plan.steps[0] as Extract<EditStep, { kind: 'module' }>).payload
    : null;

describe('module:reimbursement', () => {
  it('reads mark and unmark only', () => {
    const read = (op: Record<string, unknown>) =>
      readEditRequest({ id: 'aaaaaaaaaaaaaaaa', token: 't', ops: [{ entity: ENTITY, ...op }] })
        .kind;
    expect(read({ op: 'mark', id: 'a', at: AT })).toBe('request');
    expect(read({ op: 'mark', id: 'a', at: AT, accountId: 'card', date: '2026-10-20' })).toBe(
      'request',
    );
    expect(read({ op: 'mark', id: 'a', at: AT, date: '20/10/2026' })).toBe('invalid');
    expect(read({ op: 'mark', id: 'a', at: AT, amount: 5 })).toBe('invalid');
    expect(read({ op: 'unmark', id: 'a', at: AT, accountId: 'card' })).toBe('invalid');
    expect(read({ op: 'unmark', id: 'a', at: 1 })).toBe('invalid');
    expect(read({ op: 'delete', id: 'a', at: AT })).toBe('invalid');
    const request = readEditRequest({
      id: 'aaaaaaaaaaaaaaaa',
      token: 't',
      ops: [{ entity: ENTITY, op: 'unmark', id: 'a', at: AT }],
    });
    if (request.kind !== 'request') throw new Error('unread');
    expect(editTransactionIds(request.request)).toEqual(['a']);
  });

  it('claims a pending expense back, on a free plan too', () => {
    const data = lookup([tx('a'), tx('b', { reimbursementAccountId: 'card' })]);
    expect(payloadOf(plan([{ op: 'mark', id: 'a', at: AT }], data))).toEqual({
      id: 'a',
      accountId: 'myr',
    });
    expect(payloadOf(plan([{ op: 'mark', id: 'b', at: AT }], data))).toEqual({
      id: 'b',
      accountId: 'card',
    });
    expect(
      payloadOf(
        plan([{ op: 'mark', id: 'a', at: AT, accountId: 'card', date: '2026-10-19' }], data),
      ),
    ).toEqual({ id: 'a', accountId: 'card', date: '2026-10-19' });
  });

  it('refuses what the page would not claim', () => {
    const data = lookup([
      tx('flagless', { reimbursable: false }),
      tx('done', { reimbursedAt: AT }),
      tx('transfer', { type: 'transfer' }),
      tx('nowhere', { accountId: null }),
    ]);
    for (const id of ['flagless', 'done', 'transfer', 'nowhere']) {
      expect(plan([{ op: 'mark', id, at: AT }], data)).toMatchObject({ error: 'invalid' });
    }
    expect(plan([{ op: 'mark', id: 'flagless', at: AT, accountId: 'old' }], data)).toMatchObject({
      error: 'invalid',
    });
    // An impossible day is not even read.
    expect(plan([{ op: 'mark', id: 'done', at: AT, date: '2026-02-30' }], data)).toMatchObject({
      error: 'unread',
    });
  });

  it('undoes a claimed expense', () => {
    const data = lookup([tx('a', { reimbursedAt: AT }), tx('b')]);
    expect(payloadOf(plan([{ op: 'unmark', id: 'a', at: AT }], data))).toEqual({ id: 'a' });
    expect(plan([{ op: 'unmark', id: 'b', at: AT }], data)).toMatchObject({ error: 'invalid' });
  });

  it('refuses a stale copy, a gone row, and one named twice', () => {
    const data = lookup([tx('a')]);
    expect(plan([{ op: 'mark', id: 'a', at: 'older' }], data)).toMatchObject({ error: 'conflict' });
    expect(plan([{ op: 'mark', id: 'zed', at: AT }], data)).toMatchObject({ error: 'conflict' });
    expect(
      plan(
        [
          { op: 'mark', id: 'a', at: AT },
          { op: 'unmark', id: 'a', at: AT },
        ],
        data,
      ),
    ).toMatchObject({ error: 'invalid' });
  });
});

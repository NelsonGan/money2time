import { type EditLookup, planEdit, readEditRequest } from '~/services/webDashboardEdits';
import type { Account } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';

const account = (id: string, currency: string, patch: Partial<Account> = {}) =>
  ({ id, name: id, type: 'debit', currency, updatedAt: AT, deletedAt: null, ...patch }) as Account;

function lookup(fxCurrencies: string[], patch: Partial<EditLookup> = {}): EditLookup {
  return {
    transactions: [],
    accounts: [
      account('myr', 'MYR'),
      account('usd', 'USD'),
      account('gone', 'GBP', { deletedAt: AT }),
    ],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR', ...fxCurrencies, 'USD'],
    isPro: false,
    convert: () => null,
    isCategoryIcon: () => false,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: { 'module:currency': { reporting: 'MYR', fxCurrencies } },
    ...patch,
  };
}

const read = (ops: unknown[]) =>
  readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 'tok', ops });

function plan(ops: unknown[], fx: string[], patch: Partial<EditLookup> = {}) {
  const request = read(ops);
  if (request.kind !== 'request') throw new Error('unreadable');
  return planEdit(request.request, lookup(fx, patch));
}

const op = (verb: string, fields: Record<string, unknown>) => ({
  entity: 'module:currency',
  op: verb,
  ...fields,
});

describe('module:currency read', () => {
  it('refuses bad codes, rates and keys', () => {
    for (const bad of [
      op('add', { code: 'usd' }),
      op('add', { code: 'USDT' }),
      op('add', { code: 'EUR', rate: 1 }),
      op('rate', { code: 'EUR', rate: 0 }),
      op('rate', { code: 'EUR', rate: -2 }),
      op('rate', { code: 'EUR', rate: '4.2' }),
      op('reorder', { codes: [] }),
      op('reorder', { codes: ['EUR', 'EUR'] }),
      op('reorder', { codes: ['EUR', 1] }),
      op('main', { code: 'EUR' }),
      op('refresh', {}),
    ]) {
      expect(read([bad]).kind).toBe('invalid');
    }
    expect(read([op('rate', { code: 'EUR', rate: 4.2 })]).kind).toBe('request');
  });
});

describe('module:currency plan', () => {
  it('adds a currency the picker offers', () => {
    const result = plan([op('add', { code: 'EUR' })], []);
    expect(result.ok && result.plan.steps).toEqual([
      { kind: 'module', entity: 'module:currency', action: 'add', payload: { code: 'EUR' } },
    ]);
    // The main currency, one already listed, one the feed lacks.
    expect(plan([op('add', { code: 'MYR' })], [])).toMatchObject({ error: 'invalid' });
    expect(plan([op('add', { code: 'BGN' })], [])).toMatchObject({ error: 'invalid' });
    expect(plan([op('add', { code: 'XYZ' })], [])).toMatchObject({ error: 'invalid' });
    expect(plan([op('add', { code: 'USD' })], [])).toMatchObject({ error: 'conflict' });
    expect(plan([op('add', { code: 'EUR' })], ['EUR'], { isPro: true })).toMatchObject({
      error: 'conflict',
    });
  });

  it('holds a free plan to one added currency; account ones do not count', () => {
    expect(plan([op('add', { code: 'EUR' })], ['USD']).ok).toBe(true);
    expect(plan([op('add', { code: 'EUR' })], ['JPY'])).toEqual({
      ok: false,
      error: 'pro_required',
      feature: 'subcurrencies',
    });
    expect(plan([op('add', { code: 'EUR' }), op('add', { code: 'JPY' })], [])).toMatchObject({
      error: 'pro_required',
    });
    expect(plan([op('add', { code: 'EUR' })], ['JPY'], { isPro: true }).ok).toBe(true);
  });

  it('removes only an added currency no account uses', () => {
    expect(plan([op('remove', { code: 'EUR' })], ['EUR']).ok).toBe(true);
    expect(plan([op('remove', { code: 'USD' })], ['USD'])).toMatchObject({ error: 'invalid' });
    expect(plan([op('remove', { code: 'EUR' })], [])).toMatchObject({ error: 'conflict' });
  });

  it('reorders the whole list as shown, added ones first then account ones', () => {
    expect(plan([op('reorder', { codes: ['USD', 'EUR'] })], ['EUR']).ok).toBe(true);
    // Missing or extra codes mean the browser's list is behind.
    expect(plan([op('reorder', { codes: ['EUR'] })], ['EUR'])).toMatchObject({
      error: 'conflict',
    });
    expect(plan([op('reorder', { codes: ['USD', 'EUR', 'JPY'] })], ['EUR'])).toMatchObject({
      error: 'conflict',
    });
    // A deleted account's currency is not on the list.
    expect(plan([op('reorder', { codes: ['USD', 'GBP'] })], [])).toMatchObject({
      error: 'conflict',
    });
  });

  it('sets a manual rate for a listed currency', () => {
    const result = plan([op('rate', { code: 'USD', rate: 0.21 })], []);
    expect(result.ok && result.plan.steps).toEqual([
      {
        kind: 'module',
        entity: 'module:currency',
        action: 'rate',
        payload: { code: 'USD', rate: 0.21 },
      },
    ]);
    expect(plan([op('rate', { code: 'EUR', rate: 0.2 })], [])).toMatchObject({
      error: 'conflict',
    });
    expect(
      plan([op('rate', { code: 'USD', rate: 0.2 }), op('rate', { code: 'USD', rate: 0.3 })], []),
    ).toMatchObject({ error: 'invalid' });
  });
});

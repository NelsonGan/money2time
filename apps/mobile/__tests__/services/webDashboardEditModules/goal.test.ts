import {
  type EditLookup,
  type EditStep,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Account, RecurringTransactionRule } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const NOW = new Date(2026, 9, 20, 14, 30);

const account = (id: string, patch: Partial<Account> = {}) =>
  ({
    id,
    name: id,
    type: 'debit',
    currency: 'MYR',
    startingBalance: 0,
    includeInTotals: true,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Account;

const goal = (id: string, patch: Partial<Account> = {}) =>
  account(id, {
    type: 'goal',
    name: 'Trip',
    goalTargetAmount: 1000,
    goalTargetDate: null,
    goalEmoji: 'emoji:✈️',
    goalCoverUri: 'goal-covers/a.jpg',
    goalArchivedAt: null,
    goalAchievedAt: null,
    ...patch,
  });

const autoSave = (patch: Partial<RecurringTransactionRule> = {}) =>
  ({
    id: 'r1',
    name: 'Save for Trip',
    type: 'transfer',
    amount: 100,
    currency: 'MYR',
    accountId: null,
    categoryId: null,
    fromAccountId: 'myr',
    toAccountId: 'trip',
    toAmount: null,
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
    accounts: [account('myr'), account('usd', { currency: 'USD' }), goal('trip')],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map([['trip', 400]]),
    reportingCurrency: 'MYR',
    currencies: ['MYR', 'USD'],
    isPro: false,
    convert: (amount, from, to) => (from === 'USD' && to === 'MYR' ? amount * 4 : amount / 4),
    isCategoryIcon: (id) => id === 'meal' || id === 'travel',
    suggestIcon: (name) => (name.toLowerCase().includes('trip') ? 'travel' : null),
    now: NOW,
    extras: { 'module:goal': { ruleName: (name: string) => `Save for ${name}` } },
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

const create = (fields: Record<string, unknown>) => ({
  entity: 'module:goal',
  op: 'create',
  goal: { name: 'Car', target: 5000, currency: 'MYR', targetDate: null, ...fields },
});
const update = (set: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  entity: 'module:goal',
  op: 'update',
  id: 'trip',
  at: AT,
  set,
  ...extra,
});
const payloadOf = (step: EditStep) => (step as Extract<EditStep, { kind: 'module' }>).payload;

describe('module:goal read', () => {
  it.each([
    ['an unknown field', create({ cover: 'x.jpg' })],
    ['a zero-length id', { entity: 'module:goal', op: 'delete', id: '', at: AT }],
    ['a long id', { entity: 'module:goal', op: 'delete', id: 'x'.repeat(65), at: AT }],
    ['an endless target', create({ target: Infinity })],
    ['a bad cadence', create({ autoSave: { amount: 5, cadence: 'daily', fromAccountId: 'myr' } })],
    ['a balance on create', create({ balance: 5 })],
    ['a starting amount on update', update({ startingBalance: 5 })],
    ['an empty update', update({})],
    ['an auto-save without the rule it replaces', update({ autoSave: null })],
    ['an archive without a flag', { entity: 'module:goal', op: 'archive', id: 'trip', at: AT }],
    ['a made-up op', { entity: 'module:goal', op: 'rename', id: 'trip', at: AT }],
  ])('refuses %s', (_name, op) => {
    expect(
      readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 't', ops: [op] }),
    ).toEqual({ kind: 'invalid' });
  });
});

describe('module:goal create', () => {
  it('creates the goal as the editor does, with its auto-save', () => {
    const [step] = steps([
      create({
        name: ' Trip to Japan ',
        targetDate: '2027-01-20',
        startingBalance: 250,
        includeInTotals: false,
        autoSave: { amount: 200, cadence: 'weekly', fromAccountId: 'myr' },
      }),
    ]);
    expect(step).toEqual({
      kind: 'module',
      entity: 'module:goal',
      action: 'create',
      payload: {
        input: {
          name: 'Trip to Japan',
          type: 'goal',
          accountGroup: null,
          logoId: null,
          creditStatementDay: null,
          creditDueDay: null,
          currency: 'MYR',
          startingBalance: 250,
          includeInTotals: false,
          goalTargetAmount: 5000,
          goalTargetDate: '2027-01-20',
          // Left untouched, the icon is suggested from the name.
          goalEmoji: 'travel',
          goalCoverUri: null,
        },
        autoSave: {
          name: 'Save for Trip to Japan',
          type: 'transfer',
          amount: 200,
          currency: 'MYR',
          fromAccountId: 'myr',
          recurrencePattern: 'weekly',
          recurrenceInterval: 1,
          nextRunDate: '2026-10-27',
        },
        analytics: { hasTargetDate: true, hasAutoSave: true, hasCover: false },
      },
    });
  });

  it('keeps a picked or cleared icon', () => {
    expect((payloadOf(steps([create({ emoji: '' })])[0]).input as Account).goalEmoji).toBeNull();
    expect((payloadOf(steps([create({ emoji: 'emoji:🚗' })])[0]).input as Account).goalEmoji).toBe(
      'emoji:🚗',
    );
  });

  it.each([
    ['no name', { name: '  ' }],
    ['a zero target', { target: 0 }],
    ['a deadline today', { targetDate: '2026-10-20' }],
    ['a currency the app does not offer', { currency: 'EUR' }],
    ['an icon outside the default pack', { emoji: 'pro/rocket' }],
    [
      'an auto-save from another currency',
      { autoSave: { amount: 5, cadence: 'monthly', fromAccountId: 'usd' } },
    ],
    [
      'an auto-save from a goal',
      { autoSave: { amount: 5, cadence: 'monthly', fromAccountId: 'trip' } },
    ],
    [
      'an auto-save of nothing',
      { autoSave: { amount: 0, cadence: 'monthly', fromAccountId: 'myr' } },
    ],
  ])('refuses %s', (_name, fields) => {
    expect(refusal([create(fields)])).toEqual({ error: 'invalid' });
  });

  it('holds a free plan to two active goals, counting the batch', () => {
    expect(refusal([create({}), create({})])).toEqual({ error: 'pro_required', feature: 'goals' });
    expect(refusal([create({})])).toBeNull();
    const archived = [account('myr'), goal('trip'), goal('old', { goalArchivedAt: AT })];
    expect(refusal([create({})], { accounts: archived })).toBeNull();
    expect(refusal([create({}), create({})], { isPro: true })).toBeNull();
  });
});

describe('module:goal update', () => {
  it('saves the form, keeping the cover photo', () => {
    const [step] = steps([update({ name: 'Japan', target: 1200, includeInTotals: false })]);
    expect(payloadOf(step)).toEqual({
      id: 'trip',
      updates: {
        name: 'Japan',
        includeInTotals: false,
        goalTargetAmount: 1200,
        goalTargetDate: null,
        goalEmoji: 'emoji:✈️',
        goalCoverUri: 'goal-covers/a.jpg',
      },
      rules: [],
    });
  });

  it('refuses a stale or missing goal', () => {
    expect(refusal([update({ name: 'x' }, { at: 'old' })])).toEqual({ error: 'conflict' });
    expect(refusal([{ ...update({ name: 'x' }), id: 'myr' }])).toEqual({ error: 'conflict' });
  });

  it('refuses a deadline that has passed, as the editor will not save one', () => {
    expect(refusal([update({ targetDate: '2026-10-01' })])).toEqual({ error: 'invalid' });
    const past = [account('myr'), goal('trip', { goalTargetDate: '2026-09-01' })];
    expect(refusal([update({ name: 'x' })], { accounts: past })).toEqual({ error: 'invalid' });
    expect(refusal([update({ targetDate: null })], { accounts: past })).toBeNull();
  });

  it('records a changed saved amount the way the user picks', () => {
    expect(
      payloadOf(steps([update({ balance: 450, balanceRecord: 'difference' })])[0]),
    ).toMatchObject({ adjustment: { type: 'balance_adjustment', amount: 50, currency: 'MYR' } });
    expect(payloadOf(steps([update({ balance: 300, balanceRecord: 'flow' })])[0])).toMatchObject({
      adjustment: { type: 'expense', amount: 100, currency: 'MYR' },
    });
    expect(refusal([update({ balance: 300 })])).toEqual({ error: 'invalid' });
    expect(payloadOf(steps([update({ balance: 400 })])[0]).adjustment).toBeUndefined();
  });

  it('clears the achievement when the target moves back above the saved amount', () => {
    const done = [account('myr'), goal('trip', { goalAchievedAt: AT })];
    expect(
      payloadOf(steps([update({ target: 500 })], { accounts: done })[0]).updates,
    ).toMatchObject({ goalAchievedAt: null });
    expect(
      payloadOf(steps([update({ target: 300 })], { accounts: done })[0]).updates,
    ).not.toHaveProperty('goalAchievedAt');
  });

  it('re-denominates on a new currency without touching the saved amount', () => {
    const [step] = steps([update({ currency: 'USD', target: 250 })]);
    expect(payloadOf(step)).toMatchObject({ currency: 'USD', rules: [] });
    expect(refusal([update({ currency: 'USD', balance: 5, balanceRecord: 'flow' })])).toEqual({
      error: 'invalid',
    });
  });

  it('creates, updates and removes the auto-save like the editor', () => {
    const rule = autoSave();
    const ref = { rule: { id: 'r1', at: AT } };
    const created = steps([
      update(
        { autoSave: { amount: 50, cadence: 'monthly', fromAccountId: 'myr' } },
        { rule: null },
      ),
    ]);
    expect(payloadOf(created[0]).rules).toEqual([
      {
        op: 'create',
        input: {
          name: 'Save for Trip',
          type: 'transfer',
          amount: 50,
          currency: 'MYR',
          fromAccountId: 'myr',
          toAccountId: 'trip',
          recurrencePattern: 'monthly',
          recurrenceInterval: 1,
          nextRunDate: '2026-11-20',
        },
      },
    ]);
    // A new amount keeps the schedule; a renamed goal renames its generated rule.
    const changed = steps(
      [
        update(
          { name: 'Japan', autoSave: { amount: 150, cadence: 'monthly', fromAccountId: 'myr' } },
          ref,
        ),
      ],
      { recurringRules: [rule] },
    );
    expect(payloadOf(changed[0]).rules).toEqual([
      {
        op: 'update',
        id: 'r1',
        input: {
          amount: 150,
          currency: 'MYR',
          fromAccountId: 'myr',
          recurrencePattern: 'monthly',
          name: 'Save for Japan',
        },
      },
    ]);
    // A new cadence restarts it.
    const weekly = steps(
      [update({ autoSave: { amount: 100, cadence: 'weekly', fromAccountId: 'myr' } }, ref)],
      { recurringRules: [rule] },
    );
    expect(payloadOf(weekly[0]).rules).toMatchObject([
      { op: 'update', input: { recurrencePattern: 'weekly', nextRunDate: '2026-10-27' } },
    ]);
    const removed = steps([update({ autoSave: null }, ref)], { recurringRules: [rule] });
    expect(payloadOf(removed[0]).rules).toEqual([{ op: 'delete', id: 'r1' }]);
  });

  it('keeps its auto-save rule to itself within a batch', () => {
    const goalOp = update({ autoSave: null }, { rule: { id: 'r1', at: AT } });
    const ruleOp = { entity: 'recurring', op: 'delete', id: 'r1', at: AT };
    const data = { recurringRules: [autoSave()] };
    expect(refusal([goalOp, ruleOp], data)).toEqual({ error: 'invalid' });
    expect(refusal([ruleOp, goalOp], data)).toEqual({ error: 'invalid' });
  });

  it('refuses an auto-save edit against a rule that changed or one it cannot show', () => {
    const save = { autoSave: { amount: 5, cadence: 'monthly', fromAccountId: 'myr' } };
    expect(
      refusal([update(save, { rule: { id: 'r1', at: 'old' } })], { recurringRules: [autoSave()] }),
    ).toEqual({ error: 'conflict' });
    expect(refusal([update(save, { rule: null })], { recurringRules: [autoSave()] })).toEqual({
      error: 'conflict',
    });
    const daily = autoSave({ recurrencePattern: 'daily' });
    expect(
      refusal([update(save, { rule: { id: 'r1', at: AT } })], { recurringRules: [daily] }),
    ).toEqual({ error: 'invalid' });
    // Left alone, such a rule does not stop the rest of the form.
    expect(refusal([update({ name: 'x' })], { recurringRules: [daily] })).toBeNull();
  });

  it('needs a new source when the currency changes under an auto-save', () => {
    expect(refusal([update({ currency: 'USD' })], { recurringRules: [autoSave()] })).toEqual({
      error: 'invalid',
    });
    expect(
      refusal(
        [
          update(
            { currency: 'USD', autoSave: { amount: 25, cadence: 'monthly', fromAccountId: 'usd' } },
            { rule: { id: 'r1', at: AT } },
          ),
        ],
        { recurringRules: [autoSave()] },
      ),
    ).toBeNull();
  });
});

describe('module:goal archive and delete', () => {
  const archive = (archived: boolean) => ({
    entity: 'module:goal',
    op: 'archive',
    id: 'trip',
    at: AT,
    archived,
  });

  it('archives and deletes', () => {
    expect(steps([archive(true)])).toEqual([
      {
        kind: 'module',
        entity: 'module:goal',
        action: 'archive',
        payload: { id: 'trip', archived: true },
      },
    ]);
    expect(steps([{ entity: 'module:goal', op: 'delete', id: 'trip', at: AT }])).toEqual([
      { kind: 'module', entity: 'module:goal', action: 'delete', payload: { id: 'trip' } },
    ]);
  });

  it('re-runs the free limit when a goal comes back from the archive', () => {
    const full = [account('myr'), goal('trip', { goalArchivedAt: AT }), goal('a'), goal('b')];
    expect(refusal([archive(false)], { accounts: full })).toEqual({
      error: 'pro_required',
      feature: 'goals',
    });
    expect(refusal([archive(false)], { accounts: full.slice(0, 3) })).toBeNull();
  });

  it('refuses the same goal twice in one batch', () => {
    expect(
      refusal([archive(true), { entity: 'module:goal', op: 'delete', id: 'trip', at: AT }]),
    ).toEqual({ error: 'invalid' });
  });
});

describe('module:goal names, archive and analytics', () => {
  it('re-denominates an archived goal without touching its paused auto-save', () => {
    const archived = [account('myr'), goal('trip', { goalArchivedAt: AT })];
    expect(
      payloadOf(
        steps([update({ currency: 'USD' })], {
          accounts: archived,
          recurringRules: [autoSave()],
        })[0],
      ),
    ).toMatchObject({ currency: 'USD', rules: [] });
  });

  it('holds a changed name to 200 characters, but keeps a longer one the goal has', () => {
    expect(refusal([create({ name: 'x'.repeat(201) })])).toEqual({ error: 'invalid' });
    const long = [account('myr'), goal('trip', { name: 'y'.repeat(300) })];
    expect(refusal([update({ name: 'y'.repeat(300) })], { accounts: long })).toBeNull();
    expect(refusal([update({ name: 'z'.repeat(201) })], { accounts: long })).toEqual({
      error: 'invalid',
    });
  });

  it('reports GOAL_CREATED with the screen’s properties', () => {
    expect(payloadOf(steps([create({ targetDate: '2027-01-01' })])[0]).analytics).toEqual({
      hasTargetDate: true,
      hasAutoSave: false,
      hasCover: false,
    });
  });
});

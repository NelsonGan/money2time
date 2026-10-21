import { type EditLookup, planEdit, readEditRequest } from '~/services/webDashboardEdits';
import type { MonthlyWageSettings, WageConfig } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';

const config: WageConfig = {
  wageType: 'monthly',
  wageAmount: 5000,
  hoursWorkedPerWeek: 40,
  workdaysPerWeek: 5,
  commuteMinutesPerWorkday: 30,
};

const entry = (month: string, patch: Partial<MonthlyWageSettings> = {}) =>
  ({
    id: `w-${month}`,
    month,
    ...config,
    baseHourlyRate: 28.87,
    trueHourlyRate: 25.66,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as MonthlyWageSettings;

function lookup(wages: MonthlyWageSettings[], patch: Partial<EditLookup> = {}): EditLookup {
  return {
    transactions: [],
    accounts: [],
    accountGroups: [],
    categories: [],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro: false,
    convert: () => null,
    isCategoryIcon: () => false,
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: { 'module:wage': wages },
    ...patch,
  };
}

const read = (ops: unknown[]) =>
  readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 'tok', ops });

function plan(ops: unknown[], wages: MonthlyWageSettings[], patch: Partial<EditLookup> = {}) {
  const request = read(ops);
  if (request.kind !== 'request') throw new Error('unreadable');
  return planEdit(request.request, lookup(wages, patch));
}

const create = (month: string, patch: Partial<WageConfig> = {}) => ({
  entity: 'module:wage',
  op: 'create',
  month,
  config: { ...config, ...patch },
});

describe('module:wage read', () => {
  it('reads the three ops', () => {
    expect(read([create('2026-10')]).kind).toBe('request');
    expect(
      read([{ entity: 'module:wage', op: 'update', month: '2026-10', at: AT, config }]).kind,
    ).toBe('request');
    expect(read([{ entity: 'module:wage', op: 'delete', month: '2026-10', at: null }]).kind).toBe(
      'request',
    );
  });

  it('refuses bad months, configs and extra keys', () => {
    for (const op of [
      create('2026-13'),
      create('2026-1'),
      create('1900-01'),
      create('2026-10', { wageType: 'daily' as never }),
      create('2026-10', { wageAmount: -1 }),
      create('2026-10', { wageAmount: Infinity }),
      create('2026-10', { hoursWorkedPerWeek: '40' as never }),
      { ...create('2026-10'), at: AT },
      { ...create('2026-10'), config: { ...config, bonus: 1 } },
      { entity: 'module:wage', op: 'create', month: '2026-10', config: { wageType: 'hourly' } },
      { entity: 'module:wage', op: 'delete', month: '2026-10' },
      { entity: 'module:wage', op: 'rename', month: '2026-10', at: AT },
    ]) {
      expect(read([op]).kind).toBe('invalid');
    }
  });
});

describe('module:wage plan', () => {
  it('saves a new month through the calculator save', () => {
    const result = plan([create('2026-10')], [entry('2026-09')]);
    expect(result).toEqual({
      ok: true,
      plan: {
        steps: [
          {
            kind: 'module',
            entity: 'module:wage',
            action: 'save',
            payload: { month: '2026-10', config },
          },
        ],
        count: 1,
        kinds: ['wage_create'],
      },
    });
  });

  it('refuses what the calculator would not let through', () => {
    expect(plan([create('2026-10', { wageAmount: 0 })], [])).toMatchObject({ error: 'invalid' });
    expect(plan([create('2026-10', { hoursWorkedPerWeek: 0 })], [])).toMatchObject({
      error: 'invalid',
    });
    expect(plan([create('2026-10', { workdaysPerWeek: 0 })], [])).toMatchObject({
      error: 'invalid',
    });
  });

  it('takes only the years the month picker offers', () => {
    expect(plan([create('2021-01')], []).ok).toBe(true);
    expect(plan([create('2029-12')], []).ok).toBe(true);
    expect(plan([create('2020-12')], [])).toMatchObject({ error: 'invalid' });
    expect(plan([create('2030-01')], [])).toMatchObject({ error: 'invalid' });
    // A year the history already has stays on the list.
    expect(plan([create('2015-02')], [entry('2015-01')]).ok).toBe(true);
  });

  it('treats a month that already has an entry as a stale copy', () => {
    expect(plan([create('2026-10')], [entry('2026-10')])).toMatchObject({ error: 'conflict' });
    // An older backup's unpadded month is the same month.
    expect(plan([create('2026-03')], [entry('2026-3')])).toMatchObject({ error: 'conflict' });
  });

  it('holds a free plan to five months, counting this batch', () => {
    const four = ['2026-01', '2026-02', '2026-03', '2026-04'].map((m) => entry(m));
    expect(plan([create('2026-05')], four).ok).toBe(true);
    expect(plan([create('2026-05'), create('2026-06')], four)).toEqual({
      ok: false,
      error: 'pro_required',
      feature: 'wage_entries',
    });
    expect(plan([create('2026-05'), create('2026-06')], four, { isPro: true }).ok).toBe(true);
    // Editing is never limited.
    const five = [...four, entry('2026-05')];
    expect(
      plan([{ entity: 'module:wage', op: 'update', month: '2026-05', at: AT, config }], five).ok,
    ).toBe(true);
  });

  it('updates and deletes only the entry the browser saw', () => {
    const wages = [entry('2026-10')];
    const update = { entity: 'module:wage', op: 'update', month: '2026-10', at: AT, config };
    expect(plan([update], wages).ok).toBe(true);
    expect(plan([{ ...update, at: 'older' }], wages)).toMatchObject({ error: 'conflict' });
    expect(plan([{ ...update, month: '2026-11' }], wages)).toMatchObject({ error: 'conflict' });
    expect(plan([update], [entry('2026-10', { deletedAt: AT })])).toMatchObject({
      error: 'conflict',
    });
    const remove = { entity: 'module:wage', op: 'delete', month: '2026-10', at: AT };
    const result = plan([remove], wages);
    expect(result.ok && result.plan.steps).toEqual([
      { kind: 'module', entity: 'module:wage', action: 'delete', payload: { month: '2026-10' } },
    ]);
  });

  it('compares against the latest row of a month', () => {
    const wages = [entry('2026-10'), entry('2026-10', { id: 'newer', updatedAt: 'z-latest' })];
    const update = { entity: 'module:wage', op: 'update', month: '2026-10', at: AT, config };
    expect(plan([update], wages)).toMatchObject({ error: 'conflict' });
    expect(plan([{ ...update, at: 'z-latest' }], wages).ok).toBe(true);
  });

  it('refuses one month named twice', () => {
    const update = { entity: 'module:wage', op: 'update', month: '2026-10', at: AT, config };
    expect(plan([update, update], [entry('2026-10')])).toMatchObject({ error: 'invalid' });
  });
});

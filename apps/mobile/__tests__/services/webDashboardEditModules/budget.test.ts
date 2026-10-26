import {
  type EditLookup,
  type EditStep,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { BudgetTemplate, Category, MonthlyBudget } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';
const ENTITY = 'module:budget';

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

const template = (id: string, patch: Partial<BudgetTemplate> = {}): BudgetTemplate => ({
  id,
  name: 'Monthly',
  emoji: null,
  totalAmount: 100,
  isDefault: true,
  countUnbudgeted: true,
  sortOrder: 0,
  allocations: [],
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  ...patch,
});

const budget = (id: string, month: string, patch: Partial<MonthlyBudget> = {}): MonthlyBudget => ({
  id,
  month,
  templateId: null,
  templateName: null,
  templateEmoji: null,
  totalAmount: 100,
  countUnbudgeted: true,
  lines: [],
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  ...patch,
});

function lookup(
  extra: { templates?: BudgetTemplate[]; budgets?: MonthlyBudget[] } = {},
  patch: Partial<EditLookup> = {},
): EditLookup {
  return {
    transactions: [],
    accounts: [],
    accountGroups: [],
    categories: [
      category('food', 'expense'),
      category('coffee', 'expense', { parentId: 'food' }),
      category('lunch', 'expense', { parentId: 'food' }),
      category('rent', 'expense'),
      category('gone', 'expense', { deletedAt: AT }),
      category('salary', 'income'),
    ],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR'],
    isPro: true,
    convert: () => null,
    isCategoryIcon: (id) => id === 'meal',
    suggestIcon: () => null,
    now: new Date(2026, 9, 20),
    extras: {
      [ENTITY]: {
        templates: extra.templates ?? [template('t1')],
        budgets: extra.budgets ?? [budget('b1', '2026-10')],
        months: ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'],
      },
    },
    ...patch,
  };
}

const read = (ops: unknown[]) =>
  readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 'tok', ops });

function plan(ops: unknown[], data?: Parameters<typeof lookup>[0], patch?: Partial<EditLookup>) {
  const request = read(ops);
  if (request.kind !== 'request') throw new Error('unreadable');
  return planEdit(request.request, lookup(data, patch));
}

function steps(ops: unknown[], data?: Parameters<typeof lookup>[0]): EditStep[] {
  const result = plan(ops, data);
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.plan.steps;
}

function refusal(ops: unknown[], data?: Parameters<typeof lookup>[0], patch?: Partial<EditLookup>) {
  const result = plan(ops, data, patch);
  if (result.ok) return null;
  return result.feature
    ? { error: result.error, feature: result.feature }
    : { error: result.error };
}

const fields = (patch: Record<string, unknown> = {}) => ({
  name: ' Lean ',
  emoji: 'emoji:🍜',
  totalAmount: 100,
  countUnbudgeted: false,
  allocations: [
    { categoryId: 'rent', amount: 60 },
    { categoryId: 'food', amount: 40 },
  ],
  ...patch,
});
const create = (patch: Record<string, unknown> = {}) => ({
  entity: ENTITY,
  op: 'template_create',
  template: { ...fields(patch), backPopulate: true },
});
const lines = (list: [string, number][]) =>
  list.map(([categoryId, amount]) => ({ categoryId, amount }));

describe('budget module: reading', () => {
  it('reads every op', () => {
    const request = read([
      create(),
      { entity: ENTITY, op: 'template_update', id: 't1', at: AT, template: fields() },
      { entity: ENTITY, op: 'template_delete', id: 't1', at: AT },
      { entity: ENTITY, op: 'template_default', id: 't2', at: AT },
      { entity: ENTITY, op: 'month_create', month: '2026-11', templateId: 't1' },
      {
        entity: ENTITY,
        op: 'month_custom',
        month: '2026-12',
        budget: { totalAmount: 5, countUnbudgeted: true, lines: lines([['rent', 5]]) },
      },
      {
        entity: ENTITY,
        op: 'month_update',
        id: 'b1',
        at: AT,
        budget: { totalAmount: 5, countUnbudgeted: true, lines: lines([['rent', 5]]) },
      },
      { entity: ENTITY, op: 'month_delete', id: 'b1', at: null },
    ]);
    expect(request.kind).toBe('request');
  });

  it.each([
    ['an unknown op', { entity: ENTITY, op: 'template_copy', id: 't1', at: AT }],
    ['an unknown key', { ...create(), extra: 1 }],
    ['a template key too many', create({ isDefault: true })],
    [
      'back-fill on an update',
      {
        entity: ENTITY,
        op: 'template_update',
        id: 't1',
        at: AT,
        template: { ...fields(), backPopulate: true },
      },
    ],
    ['a missing key', { entity: ENTITY, op: 'template_create', template: { name: 'x' } }],
    ['no allocations', create({ allocations: [] })],
    ['a zero line', create({ allocations: lines([['rent', 0]]) })],
    ['a line with extra keys', create({ allocations: [{ categoryId: 'rent', amount: 1, x: 1 }] })],
    ['a huge amount', create({ totalAmount: 1e13 })],
    ['a long id', { entity: ENTITY, op: 'template_delete', id: 'x'.repeat(65), at: AT }],
    ['a bad month', { entity: ENTITY, op: 'month_create', month: '2026-13', templateId: 't1' }],
    [
      'a day for a month',
      { entity: ENTITY, op: 'month_create', month: '2026-10-01', templateId: 't1' },
    ],
    ['a long name', create({ name: 'x'.repeat(81) })],
  ])('refuses %s', (_label, op) => {
    expect(read([op]).kind).toBe('invalid');
  });
});

describe('budget module: templates', () => {
  it('creates a template as the editor saves it', () => {
    expect(
      steps([
        create({
          allocations: lines([
            ['coffee', 15],
            ['rent', 60],
            ['food', 40],
            ['lunch', 25],
          ]),
        }),
      ]),
    ).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'template_create',
        payload: {
          input: {
            name: 'Lean',
            emoji: 'emoji:🍜',
            totalAmount: 100,
            countUnbudgeted: false,
            // Roots first in the order given, then each root's subcategories.
            allocations: lines([
              ['rent', 60],
              ['food', 40],
              ['coffee', 15],
              ['lunch', 25],
            ]),
            backPopulate: true,
          },
        },
      },
    ]);
  });

  it('keeps Save disabled where the editor does', () => {
    // Remaining not zero.
    expect(refusal([create({ totalAmount: 120 })])).toEqual({ error: 'invalid' });
    // A blank name.
    expect(refusal([create({ name: '  ' })])).toEqual({ error: 'invalid' });
    // An income, deleted or unknown category.
    for (const id of ['salary', 'gone', 'nope']) {
      expect(refusal([create({ totalAmount: 10, allocations: lines([[id, 10]]) })])).toEqual({
        error: 'invalid',
      });
    }
    // Subcategories only: no root line.
    expect(refusal([create({ totalAmount: 10, allocations: lines([['coffee', 10]]) })])).toEqual({
      error: 'invalid',
    });
    // A breakdown larger than its parent.
    expect(
      refusal([
        create({
          allocations: lines([
            ['rent', 60],
            ['food', 40],
            ['coffee', 30],
            ['lunch', 25],
          ]),
        }),
      ]),
    ).toEqual({ error: 'invalid' });
    // A category twice.
    expect(
      refusal([
        create({
          allocations: lines([
            ['rent', 60],
            ['rent', 40],
          ]),
        }),
      ]),
    ).toEqual({ error: 'invalid' });
    // An icon outside the default pack.
    expect(refusal([create({ emoji: 'other-pack/meal' })])).toEqual({ error: 'invalid' });
  });

  it('accepts amounts that only differ by float dust', () => {
    expect(
      steps([
        create({
          totalAmount: 0.3,
          allocations: lines([
            ['rent', 0.1],
            ['food', 0.2],
          ]),
        }),
      ]),
    ).toHaveLength(1);
  });

  it('accepts a partial subcategory breakdown, leaving the rest on the parent', () => {
    expect(
      steps([
        create({
          allocations: lines([
            ['rent', 60],
            ['food', 40],
            ['coffee', 30],
          ]),
        }),
      ]),
    ).toHaveLength(1);
  });

  it('holds a free plan to one template', () => {
    expect(refusal([create()], undefined, { isPro: false })).toEqual({
      error: 'pro_required',
      feature: 'budget_templates',
    });
    expect(refusal([create(), create()], { templates: [] }, { isPro: false })).toEqual({
      error: 'pro_required',
      feature: 'budget_templates',
    });
    expect(plan([create()], { templates: [] }, { isPro: false }).ok).toBe(true);
  });

  it('updates, keeping an icon the web cannot pick', () => {
    const custom = template('t1', { emoji: 'custom/abc' });
    expect(
      steps(
        [
          {
            entity: ENTITY,
            op: 'template_update',
            id: 't1',
            at: AT,
            template: fields({ emoji: 'custom/abc' }),
          },
        ],
        { templates: [custom] },
      )[0],
    ).toMatchObject({
      action: 'template_update',
      payload: { id: 't1', input: { name: 'Lean', emoji: 'custom/abc' } },
    });
  });

  it('refuses a template changed or gone on the phone', () => {
    const op = { entity: ENTITY, op: 'template_update', id: 't1', at: 'older', template: fields() };
    expect(refusal([op])).toEqual({ error: 'conflict' });
    expect(refusal([{ entity: ENTITY, op: 'template_delete', id: 'tx', at: AT }])).toEqual({
      error: 'conflict',
    });
    expect(
      refusal([{ entity: ENTITY, op: 'template_delete', id: 't1', at: AT }], {
        templates: [template('t1', { deletedAt: AT })],
      }),
    ).toEqual({ error: 'conflict' });
  });

  it('deletes and sets the default', () => {
    const data = { templates: [template('t1'), template('t2', { isDefault: false })] };
    expect(
      steps(
        [
          { entity: ENTITY, op: 'template_default', id: 't2', at: AT },
          { entity: ENTITY, op: 'template_delete', id: 't1', at: AT },
        ],
        data,
      ),
    ).toEqual([
      { kind: 'module', entity: ENTITY, action: 'template_default', payload: { id: 't2' } },
      { kind: 'module', entity: ENTITY, action: 'template_delete', payload: { id: 't1' } },
    ]);
    // Already the default: nothing to save.
    expect(steps([{ entity: ENTITY, op: 'template_default', id: 't1', at: AT }], data)).toEqual([]);
    // One template twice in a batch.
    expect(
      refusal(
        [
          { entity: ENTITY, op: 'template_default', id: 't2', at: AT },
          { entity: ENTITY, op: 'template_delete', id: 't2', at: AT },
        ],
        data,
      ),
    ).toEqual({ error: 'invalid' });
  });
});

describe('budget module: monthly budgets', () => {
  const body = (patch: Record<string, unknown> = {}) => ({
    totalAmount: 50,
    countUnbudgeted: false,
    lines: lines([
      ['food', 50],
      ['coffee', 50],
    ]),
    ...patch,
  });

  it('creates a month from a template or a custom budget', () => {
    expect(
      steps([
        { entity: ENTITY, op: 'month_create', month: '2026-11', templateId: 't1' },
        { entity: ENTITY, op: 'month_custom', month: '2026-12', budget: body() },
      ]),
    ).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'month_create',
        payload: { month: '2026-11', templateId: 't1' },
      },
      {
        kind: 'module',
        entity: ENTITY,
        action: 'month_custom',
        payload: { month: '2026-12', input: body() },
      },
    ]);
  });

  it('refuses a month that already has a budget, or a template gone', () => {
    expect(
      refusal([{ entity: ENTITY, op: 'month_custom', month: '2026-10', budget: body() }]),
    ).toEqual({ error: 'conflict' });
    expect(
      refusal([{ entity: ENTITY, op: 'month_create', month: '2026-11', templateId: 'tx' }]),
    ).toEqual({ error: 'conflict' });
    // A deleted month can be made again.
    expect(
      steps([{ entity: ENTITY, op: 'month_create', month: '2026-10', templateId: 't1' }], {
        budgets: [budget('b1', '2026-10', { deletedAt: AT })],
      }),
    ).toHaveLength(1);
    // The same month twice in a batch.
    expect(
      refusal([
        { entity: ENTITY, op: 'month_create', month: '2026-11', templateId: 't1' },
        { entity: ENTITY, op: 'month_custom', month: '2026-11', budget: body() },
      ]),
    ).toEqual({ error: 'invalid' });
  });

  it('makes months from a template the batch does not also change', () => {
    const fromT1 = (month: string) => ({
      entity: ENTITY,
      op: 'month_create',
      month,
      templateId: 't1',
    });
    expect(steps([fromT1('2026-11'), fromT1('2026-12')])).toHaveLength(2);
    const change = { entity: ENTITY, op: 'template_update', id: 't1', at: AT, template: fields() };
    const remove = { entity: ENTITY, op: 'template_delete', id: 't1', at: AT };
    for (const op of [change, remove]) {
      expect(refusal([fromT1('2026-11'), op])).toEqual({ error: 'invalid' });
      expect(refusal([op, fromT1('2026-11')])).toEqual({ error: 'invalid' });
    }
  });

  it('only makes a month the budget pager offers', () => {
    for (const month of ['2026-08', '2027-02']) {
      expect(refusal([{ entity: ENTITY, op: 'month_create', month, templateId: 't1' }])).toEqual({
        error: 'invalid',
      });
      expect(refusal([{ entity: ENTITY, op: 'month_custom', month, budget: body() }])).toEqual({
        error: 'invalid',
      });
    }
  });

  it('updates and deletes a month', () => {
    expect(
      steps([{ entity: ENTITY, op: 'month_update', id: 'b1', at: AT, budget: body() }]),
    ).toEqual([
      {
        kind: 'module',
        entity: ENTITY,
        action: 'month_update',
        payload: { id: 'b1', input: body() },
      },
    ]);
    expect(steps([{ entity: ENTITY, op: 'month_delete', id: 'b1', at: AT }])).toEqual([
      { kind: 'module', entity: ENTITY, action: 'month_delete', payload: { id: 'b1' } },
    ]);
  });

  it('checks a month like the template editor', () => {
    expect(
      refusal([
        { entity: ENTITY, op: 'month_update', id: 'b1', at: AT, budget: body({ totalAmount: 60 }) },
      ]),
    ).toEqual({ error: 'invalid' });
    expect(
      refusal([{ entity: ENTITY, op: 'month_update', id: 'b1', at: 'older', budget: body() }]),
    ).toEqual({ error: 'conflict' });
    expect(refusal([{ entity: ENTITY, op: 'month_delete', id: 'bx', at: AT }])).toEqual({
      error: 'conflict',
    });
  });
});

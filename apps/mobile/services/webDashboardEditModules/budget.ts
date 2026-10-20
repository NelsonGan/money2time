/**
 * Web Dashboard edits: Budget templates and monthly budgets (BudgetTemplateEditorScreen, MonthlyBudgetEditorScreen).
 * Planned on the phone like the app's own editor; applied by
 * features/settings/lib/webDashboardApply/budget.ts.
 *
 *   template_create  { template: { name, emoji, totalAmount, countUnbudgeted, allocations, backPopulate } }
 *   template_update  { id, at, template: { name, emoji, totalAmount, countUnbudgeted, allocations } }
 *   template_delete  { id, at }
 *   template_default { id, at }
 *   month_create     { month, templateId }        a month's budget from a template
 *   month_custom     { month, budget: { totalAmount, countUnbudgeted, lines } }
 *   month_update     { id, at, budget: { totalAmount, countUnbudgeted, lines } }
 *   month_delete     { id, at }
 *
 * Allocations (and a month's lines) are `{ categoryId, amount }`, as the app's
 * allocation editor builds them: root expense categories that sum exactly to
 * the total, plus optional subcategory breakdowns that sum exactly to their
 * parent's amount.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import type { BudgetTemplate, MonthlyBudget } from '~/types';

import type { EditModule, EditStep, ModuleOp, PlanTools, Result } from '../webDashboardEdits';

const ENTITY = 'module:budget';
const MAX_NAME = 80;
const MAX_AMOUNT = 1e12;
const MAX_LINES = 300;

type Allocation = { categoryId: string; amount: number };
type BudgetFields = { totalAmount: number; countUnbudgeted: boolean; lines: Allocation[] };
type TemplateFields = {
  name: string;
  emoji: string | null;
  totalAmount: number;
  countUnbudgeted: boolean;
  allocations: Allocation[];
  backPopulate?: boolean;
};

/** What the planner reads from the app: see webDashboardApply/budget.ts `select`. */
export type BudgetExtra = {
  templates: BudgetTemplate[];
  budgets: MonthlyBudget[];
  /** The budget pager's months (`computeBudgetPagerMonths`): first budget or expense month to a year ahead. */
  months: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;
const isAt = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT;
const isMonth = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1970 && year <= 2200;
};
/** Rounded to cents, as the app's editor compares amounts (`normalizeMoneyAmount`). */
const cents = (amount: number) => {
  const rounded = Math.round(amount * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Exactly these keys (the optional ones may be missing), nothing else. */
function onlyKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const keys = Object.keys(value);
  return (
    required.every((key) => key in value) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function readLines(value: unknown): Allocation[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES) return null;
  const lines: Allocation[] = [];
  for (const line of value) {
    if (!isRecord(line) || !onlyKeys(line, ['categoryId', 'amount'])) return null;
    if (!isId(line.categoryId) || !isMoney(line.amount) || line.amount <= 0) return null;
    lines.push({ categoryId: line.categoryId, amount: line.amount });
  }
  return lines;
}

function readBudget(value: unknown): BudgetFields | null {
  if (!isRecord(value) || !onlyKeys(value, ['totalAmount', 'countUnbudgeted', 'lines'])) {
    return null;
  }
  const lines = readLines(value.lines);
  if (!lines || !isMoney(value.totalAmount) || typeof value.countUnbudgeted !== 'boolean') {
    return null;
  }
  return { totalAmount: value.totalAmount, countUnbudgeted: value.countUnbudgeted, lines };
}

function readTemplate(value: unknown, create: boolean): TemplateFields | null {
  const required = ['name', 'emoji', 'totalAmount', 'countUnbudgeted', 'allocations'];
  if (!isRecord(value) || !onlyKeys(value, required, create ? ['backPopulate'] : [])) return null;
  const allocations = readLines(value.allocations);
  if (
    !allocations ||
    typeof value.name !== 'string' ||
    value.name.length > MAX_NAME ||
    !(value.emoji === null || (typeof value.emoji === 'string' && value.emoji.length <= 64)) ||
    !isMoney(value.totalAmount) ||
    typeof value.countUnbudgeted !== 'boolean' ||
    !(value.backPopulate === undefined || typeof value.backPopulate === 'boolean')
  ) {
    return null;
  }
  return {
    name: value.name,
    emoji: value.emoji,
    totalAmount: value.totalAmount,
    countUnbudgeted: value.countUnbudgeted,
    allocations,
    ...(create ? { backPopulate: value.backPopulate === true } : {}),
  };
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const entity = ENTITY;
  switch (op) {
    case 'template_create': {
      if (!onlyKeys(raw, ['entity', 'op', 'template'])) return null;
      const template = readTemplate(raw.template, true);
      return template ? { entity, op, template } : null;
    }
    case 'template_update': {
      if (!onlyKeys(raw, ['entity', 'op', 'id', 'at', 'template'])) return null;
      const template = readTemplate(raw.template, false);
      return template && isId(raw.id) && isAt(raw.at)
        ? { entity, op, id: raw.id, at: raw.at, template }
        : null;
    }
    case 'template_delete':
    case 'template_default':
    case 'month_delete':
      if (!onlyKeys(raw, ['entity', 'op', 'id', 'at'])) return null;
      return isId(raw.id) && isAt(raw.at) ? { entity, op, id: raw.id, at: raw.at } : null;
    case 'month_create':
      if (!onlyKeys(raw, ['entity', 'op', 'month', 'templateId'])) return null;
      return isMonth(raw.month) && isId(raw.templateId)
        ? { entity, op, month: raw.month, templateId: raw.templateId }
        : null;
    case 'month_custom': {
      if (!onlyKeys(raw, ['entity', 'op', 'month', 'budget'])) return null;
      const budget = readBudget(raw.budget);
      return budget && isMonth(raw.month) ? { entity, op, month: raw.month, budget } : null;
    }
    case 'month_update': {
      if (!onlyKeys(raw, ['entity', 'op', 'id', 'at', 'budget'])) return null;
      const budget = readBudget(raw.budget);
      return budget && isId(raw.id) && isAt(raw.at)
        ? { entity, op, id: raw.id, at: raw.at, budget }
        : null;
    }
    default:
      return null;
  }
}

function extraOf(tools: PlanTools): BudgetExtra {
  const extra = tools.extra as Partial<BudgetExtra> | undefined;
  return {
    templates: (extra?.templates ?? []).filter((template) => !template.deletedAt),
    budgets: (extra?.budgets ?? []).filter((budget) => !budget.deletedAt),
    months: extra?.months ?? [],
  };
}

/**
 * The allocations as the app's allocation editor saves them, or null when it
 * would keep Save disabled: root expense categories summing exactly to a
 * positive total, each subcategory breakdown summing exactly to its parent,
 * roots first (in the order given) and then each root's subcategories.
 */
function allocationsFor(tools: PlanTools, total: number, lines: Allocation[]): Allocation[] | null {
  if (total <= 0) return null;
  const seen = new Set<string>();
  const roots: Allocation[] = [];
  const childrenByRoot = new Map<string, Allocation[]>();
  for (const line of lines) {
    if (seen.has(line.categoryId)) return null;
    seen.add(line.categoryId);
    const category = tools.findCategory(line.categoryId);
    if (!category || category.type !== 'expense') return null;
    if (!category.parentId) {
      roots.push(line);
      continue;
    }
    const parent = tools.findCategory(category.parentId);
    if (!parent || parent.parentId || parent.type !== 'expense') return null;
    const list = childrenByRoot.get(parent.id) ?? [];
    list.push(line);
    childrenByRoot.set(parent.id, list);
  }
  if (roots.length === 0) return null;
  // A breakdown only exists under an allocated parent.
  if ([...childrenByRoot.keys()].some((id) => !roots.some((root) => root.categoryId === id))) {
    return null;
  }
  const allocated = roots.reduce((sum, root) => sum + root.amount, 0);
  if (cents(total - allocated) !== 0) return null;
  const out = [...roots];
  const order = new Map(tools.liveCategories.map((category, index) => [category.id, index]));
  for (const root of roots) {
    const children = childrenByRoot.get(root.categoryId) ?? [];
    if (!children.length) continue;
    const childSum = children.reduce((sum, child) => sum + child.amount, 0);
    if (cents(root.amount - childSum) !== 0) return null;
    // In the category list's order, as the editor builds them.
    out.push(
      ...[...children].sort(
        (a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0),
      ),
    );
  }
  return out;
}

/** No icon, an emoji, a bundled icon of the default pack, or the one it already has. */
function validEmoji(tools: PlanTools, emoji: string | null, current?: string | null): boolean {
  if (emoji === null || emoji === (current ?? null)) return true;
  if (emoji.startsWith('emoji:')) {
    const glyph = emoji.slice('emoji:'.length);
    return glyph.length > 0 && glyph.length <= 16 && !/[\x00-\x7f]/.test(glyph);
  }
  return emoji !== '' && !emoji.includes('/') && tools.lookup.isCategoryIcon(emoji);
}

const step = (action: string, payload: Record<string, unknown>): EditStep => ({
  kind: 'module',
  entity: ENTITY,
  action,
  payload,
});

function plan(tools: PlanTools, op: ModuleOp, steps: EditStep[]): Result<number> {
  const { templates, budgets, months } = extraOf(tools);

  if (op.op === 'template_create' || op.op === 'template_update') {
    const fields = op.template as TemplateFields;
    let current: BudgetTemplate | null = null;
    if (op.op === 'template_update') {
      if (!tools.claim(`budget-template:${op.id as string}`)) return tools.refuse('invalid');
      current = templates.find((template) => template.id === op.id) ?? null;
      if (!current || current.updatedAt !== op.at) return tools.refuse('conflict');
    } else {
      // As the templates screen checks before opening a new template's editor.
      const made = tools.created.budget_templates ?? 0;
      if (!tools.lookup.isPro && templates.length + made >= PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES) {
        return tools.refuse('pro_required', 'budget_templates');
      }
    }
    const name = fields.name.trim();
    if (!name || !validEmoji(tools, fields.emoji, current?.emoji)) return tools.refuse('invalid');
    const allocations = allocationsFor(tools, fields.totalAmount, fields.allocations);
    if (!allocations) return tools.refuse('invalid');
    const input = {
      name,
      emoji: fields.emoji,
      totalAmount: fields.totalAmount,
      countUnbudgeted: fields.countUnbudgeted,
      allocations,
    };
    if (current) {
      steps.push(step('template_update', { id: current.id, input }));
    } else {
      tools.created.budget_templates = (tools.created.budget_templates ?? 0) + 1;
      steps.push(
        step('template_create', {
          input: { ...input, backPopulate: fields.backPopulate === true },
        }),
      );
    }
    return tools.ok(1);
  }

  if (op.op === 'template_delete' || op.op === 'template_default') {
    if (!tools.claim(`budget-template:${op.id as string}`)) return tools.refuse('invalid');
    const current = templates.find((template) => template.id === op.id);
    if (!current || current.updatedAt !== op.at) return tools.refuse('conflict');
    // Picking the default again does nothing in the app.
    if (op.op === 'template_default' && current.isDefault) return tools.ok(1);
    steps.push(step(op.op, { id: current.id }));
    return tools.ok(1);
  }

  if (op.op === 'month_create' || op.op === 'month_custom') {
    const month = op.month as string;
    // Only a month the app's budget pager offers.
    if (!months.length || month < months[0] || month > months[months.length - 1]) {
      return tools.refuse('invalid');
    }
    if (!tools.claim(`budget-month:${month}`)) return tools.refuse('invalid');
    // One live budget a month: one made since the browser's copy wins.
    if (budgets.some((budget) => budget.month === month)) return tools.refuse('conflict');
    if (op.op === 'month_create') {
      const template = templates.find((item) => item.id === op.templateId);
      if (!template) return tools.refuse('conflict');
      steps.push(step('month_create', { month, templateId: template.id }));
      return tools.ok(1);
    }
    const fields = op.budget as BudgetFields;
    const lines = allocationsFor(tools, fields.totalAmount, fields.lines);
    if (!lines) return tools.refuse('invalid');
    steps.push(
      step('month_custom', {
        month,
        input: { totalAmount: fields.totalAmount, countUnbudgeted: fields.countUnbudgeted, lines },
      }),
    );
    return tools.ok(1);
  }

  if (op.op === 'month_update' || op.op === 'month_delete') {
    if (!tools.claim(`budget:${op.id as string}`)) return tools.refuse('invalid');
    const current = budgets.find((budget) => budget.id === op.id);
    if (!current || current.updatedAt !== op.at) return tools.refuse('conflict');
    if (!tools.claim(`budget-month:${current.month}`)) return tools.refuse('invalid');
    if (op.op === 'month_delete') {
      steps.push(step('month_delete', { id: current.id }));
      return tools.ok(1);
    }
    const fields = op.budget as BudgetFields;
    const lines = allocationsFor(tools, fields.totalAmount, fields.lines);
    if (!lines) return tools.refuse('invalid');
    steps.push(
      step('month_update', {
        id: current.id,
        input: { totalAmount: fields.totalAmount, countUnbudgeted: fields.countUnbudgeted, lines },
      }),
    );
    return tools.ok(1);
  }

  return tools.refuse('invalid');
}

export const budgetModule: EditModule = {
  entity: ENTITY,
  read,
  size: (op) => {
    const lines =
      (op.template as TemplateFields | undefined)?.allocations ??
      (op.budget as BudgetFields | undefined)?.lines ??
      [];
    return 1 + lines.length;
  },
  plan,
};

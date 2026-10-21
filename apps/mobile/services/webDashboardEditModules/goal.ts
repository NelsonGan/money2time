/**
 * Web Dashboard edits: savings goals, as GoalEditorScreen and GoalDetailScreen
 * make them. Planned on the phone like the app's own editor; applied by
 * features/settings/lib/webDashboardApply/goal.ts.
 *
 *   create   { goal: GoalFields }
 *   update   { id, at, set: GoalFields & { balance?, balanceRecord? }, rule? }
 *   archive  { id, at, archived }
 *   delete   { id, at }
 *
 * `rule` names the auto-save rule the browser's editor was showing (`{ id, at }`
 * or null), and is required whenever `set.autoSave` is: the form is reconciled
 * against that rule, so one changed on the phone since refuses the edit. A
 * cover photo stays app-only: an existing one is kept, none is ever added.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import { findGoalAutoSaveRule } from '~/features/goals/lib/goalMath';
import type { Account, RecurringTransactionRule } from '~/types';
import { dayKeyFromDateLocal as localDay } from '~/utils/formatters';

import type { EditModule, EditStep, ModuleOp, PlanTools, Result } from '../webDashboardEdits';
import { isAt, isDayKey, isId, isMoney, isRecord, validIcon } from './shared';

const ENTITY = 'module:goal';
const MAX_NAME = 200;
/** What a read lets through; the plan holds a changed name to MAX_NAME. */
const MAX_TEXT = 10000;

type Cadence = 'monthly' | 'weekly';
export type GoalAutoSave = { amount: number; cadence: Cadence; fromAccountId: string };

export type GoalFields = {
  name?: string;
  /** '' for none, a default-pack icon id, or `emoji:<glyph>`. Omitted on create: suggested from the name. */
  emoji?: string;
  target?: number;
  currency?: string;
  /** `YYYY-MM-DD`, after today, or null for no deadline. */
  targetDate?: string | null;
  includeInTotals?: boolean;
  /** Create only: "Already saved (optional)", the starting balance. */
  startingBalance?: number;
  /** The goal's auto-save transfer, or null for none. */
  autoSave?: GoalAutoSave | null;
  /** Update only: the amount saved it should show now. */
  balance?: number;
  /** Update only: how a changed amount is recorded, as the app asks. */
  balanceRecord?: 'difference' | 'flow';
};

/** What the planner reads from the app (the apply module's `select`). */
export type GoalExtra = {
  /** The generated name of a goal's auto-save rule (`goals.auto_save_rule_name`). */
  ruleName: (goalName: string) => string;
};

export type GoalRuleOp =
  | { op: 'create'; input: Record<string, unknown> }
  | { op: 'update'; id: string; input: Record<string, unknown> }
  | { op: 'delete'; id: string };

export type GoalCreatePayload = {
  input: Record<string, unknown>;
  autoSave: Record<string, unknown> | null;
  /** The properties GoalEditorScreen reports GOAL_CREATED with. */
  analytics: { hasTargetDate: boolean; hasAutoSave: boolean; hasCover: boolean };
};

export type GoalUpdatePayload = {
  id: string;
  updates: Record<string, unknown>;
  /** Re-denominate the goal (`changeAccountCurrency`); its saved amount is left alone then. */
  currency?: string;
  /** A corrected saved amount, recorded as the app's editor records it. */
  adjustment?: {
    type: 'balance_adjustment' | 'income' | 'expense';
    amount: number;
    currency: string;
  };
  rules: GoalRuleOp[];
};

function readAutoSave(value: unknown): GoalAutoSave | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.every((key) => ['amount', 'cadence', 'fromAccountId'].includes(key))
  )
    return undefined;
  const { amount, cadence, fromAccountId } = value;
  if (!isMoney(amount) || (cadence !== 'monthly' && cadence !== 'weekly') || !isId(fromAccountId)) {
    return undefined;
  }
  return { amount, cadence, fromAccountId };
}

const FIELD_CHECKS: Record<string, (value: unknown) => boolean> = {
  name: (v) => typeof v === 'string' && v.length <= MAX_TEXT,
  emoji: (v) => typeof v === 'string' && v.length <= 64,
  target: isMoney,
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  targetDate: (v) => v === null || isDayKey(v),
  includeInTotals: (v) => typeof v === 'boolean',
  startingBalance: isMoney,
  autoSave: (v) => readAutoSave(v) !== undefined,
  balance: isMoney,
  balanceRecord: (v) => v === 'difference' || v === 'flow',
};
const CREATE_ONLY = ['startingBalance'];
const UPDATE_ONLY = ['balance', 'balanceRecord'];

function readGoalFields(value: unknown, mode: 'create' | 'update'): GoalFields | null {
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const check = Object.prototype.hasOwnProperty.call(FIELD_CHECKS, key)
      ? FIELD_CHECKS[key]
      : undefined;
    if (!check || !check(item)) return null;
    if (mode === 'create' && UPDATE_ONLY.includes(key)) return null;
    if (mode === 'update' && CREATE_ONLY.includes(key)) return null;
  }
  return value as GoalFields;
}

function readRuleRef(value: unknown): { id: string; at: string | null } | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'id' && key !== 'at')) {
    return undefined;
  }
  return isId(value.id) && isAt(value.at) ? { id: value.id, at: value.at } : undefined;
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const allowed = (keys: string[]) => Object.keys(raw).every((key) => keys.includes(key));
  if (op === 'create') {
    if (!allowed(['entity', 'op', 'goal'])) return null;
    const goal = readGoalFields(raw.goal, 'create');
    return goal ? { entity: ENTITY, op, goal } : null;
  }
  if (!isId(raw.id) || !isAt(raw.at)) return null;
  if (op === 'delete') {
    return allowed(['entity', 'op', 'id', 'at'])
      ? { entity: ENTITY, op, id: raw.id, at: raw.at }
      : null;
  }
  if (op === 'archive') {
    if (!allowed(['entity', 'op', 'id', 'at', 'archived']) || typeof raw.archived !== 'boolean') {
      return null;
    }
    return { entity: ENTITY, op, id: raw.id, at: raw.at, archived: raw.archived };
  }
  if (op === 'update') {
    if (!allowed(['entity', 'op', 'id', 'at', 'set', 'rule'])) return null;
    const set = readGoalFields(raw.set, 'update');
    if (!set || Object.keys(set).length === 0) return null;
    const rule = 'rule' in raw ? readRuleRef(raw.rule) : undefined;
    if ('rule' in raw && rule === undefined) return null;
    // The form is reconciled against the rule it showed, so it has to say which.
    if ('autoSave' in set && rule === undefined) return null;
    return { entity: ENTITY, op, id: raw.id, at: raw.at, set, rule: rule ?? null };
  }
  return null;
}

// ------------------------------------------------------------------ planning --

/** When a new or re-timed auto-save first runs, as GoalEditorScreen's `nextRunDateFor`. */
function goalNextRunDate(cadence: Cadence, now: Date): string {
  if (cadence === 'weekly') {
    return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  }
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(now.getDate(), lastDay));
  return localDay(next);
}

const liveRules = (tools: PlanTools): RecurringTransactionRule[] =>
  tools.lookup.recurringRules.filter((rule) => !rule.deletedAt);

const activeGoalCount = (tools: PlanTools) =>
  tools.liveAccounts.filter((item) => item.type === 'goal' && item.goalArchivedAt == null).length;

/** An auto-save source as the editor's picker offers it: any non-goal account in the goal's currency. */
function autoSaveSource(tools: PlanTools, id: string | null | undefined, currency: string) {
  const source = tools.findAccount(id);
  return source && source.type !== 'goal' && source.currency === currency ? source : null;
}

function goalLimit(tools: PlanTools): Result<null> {
  if (
    !tools.lookup.isPro &&
    activeGoalCount(tools) + (tools.created.goals ?? 0) >= PRO_LIMITS.FREE_MAX_SAVINGS_GOALS
  ) {
    return tools.refuse('pro_required', 'goals');
  }
  return tools.ok(null);
}

function planCreate(tools: PlanTools, fields: GoalFields, steps: EditStep[]): Result<number> {
  const name = fields.name?.trim() ?? '';
  const target = fields.target;
  const currency = fields.currency ?? tools.lookup.reportingCurrency;
  const targetDate = fields.targetDate ?? null;
  if (!name || name.length > MAX_NAME || target === undefined || !(target > 0)) {
    return tools.refuse('invalid');
  }
  if (!tools.lookup.currencies.includes(currency)) return tools.refuse('invalid');
  if (targetDate && targetDate <= localDay(tools.lookup.now)) {
    return tools.refuse('invalid');
  }
  // Left untouched, the editor suggests an icon from the name.
  let emoji = fields.emoji;
  if (emoji === undefined) emoji = tools.lookup.suggestIcon(name) ?? '';
  else if (!validIcon(emoji, tools.lookup.isCategoryIcon)) return tools.refuse('invalid');
  let autoSave: GoalCreatePayload['autoSave'] = null;
  if (fields.autoSave) {
    const source = autoSaveSource(tools, fields.autoSave.fromAccountId, currency);
    if (!(fields.autoSave.amount > 0) || !source) return tools.refuse('invalid');
    autoSave = {
      name: (tools.extra as GoalExtra).ruleName(name),
      type: 'transfer',
      amount: fields.autoSave.amount,
      currency,
      fromAccountId: source.id,
      recurrencePattern: fields.autoSave.cadence,
      recurrenceInterval: 1,
      nextRunDate: goalNextRunDate(fields.autoSave.cadence, tools.lookup.now),
    };
  }
  const limit = goalLimit(tools);
  if (!limit.ok) return limit;
  tools.created.goals = (tools.created.goals ?? 0) + 1;
  const payload: GoalCreatePayload = {
    input: {
      name,
      type: 'goal',
      accountGroup: null,
      logoId: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency,
      startingBalance: fields.startingBalance ?? 0,
      includeInTotals: fields.includeInTotals ?? true,
      goalTargetAmount: target,
      goalTargetDate: targetDate,
      goalEmoji: emoji.trim() || null,
      goalCoverUri: null,
    },
    autoSave,
    analytics: {
      hasTargetDate: targetDate != null,
      hasAutoSave: autoSave != null,
      hasCover: false,
    },
  };
  steps.push({ kind: 'module', entity: ENTITY, action: 'create', payload });
  return tools.ok(1);
}

function existingGoal(tools: PlanTools, id: string, at: string | null): Account | null {
  const current = tools.findAccount(id);
  return current && current.type === 'goal' && current.updatedAt === at ? current : null;
}

function planUpdate(
  tools: PlanTools,
  current: Account,
  set: GoalFields,
  ruleRef: { id: string; at: string | null } | null,
  steps: EditStep[],
): Result<number> {
  const { lookup } = tools;
  const name = (set.name ?? current.name).trim();
  const target = set.target ?? current.goalTargetAmount ?? 0;
  const targetDate =
    'targetDate' in set ? (set.targetDate ?? null) : (current.goalTargetDate ?? null);
  const currency = set.currency ?? current.currency;
  const currencyChanged = currency !== current.currency;
  // A name past the limit only stays where the goal already has it.
  if (!name || (name.length > MAX_NAME && name !== current.name.trim()) || !(target > 0)) {
    return tools.refuse('invalid');
  }
  // As the editor's Save: a deadline that is set must lie ahead.
  if (targetDate && targetDate <= localDay(lookup.now)) {
    return tools.refuse('invalid');
  }
  if (currencyChanged && !lookup.currencies.includes(currency)) return tools.refuse('invalid');
  let emoji = current.goalEmoji ?? '';
  if (set.emoji !== undefined && set.emoji !== emoji) {
    if (!validIcon(set.emoji, tools.lookup.isCategoryIcon)) return tools.refuse('invalid');
    emoji = set.emoji;
  }

  // The auto-save the editor shows: one it can represent, on a goal not archived.
  const rules = liveRules(tools);
  const existingAutoSave = findGoalAutoSaveRule(rules, current.id, current.currency);
  const inlineRule = existingAutoSave?.inlineEditable ? existingAutoSave.rule : null;
  const showAutoSave = current.goalArchivedAt == null && existingAutoSave?.inlineEditable !== false;
  let wanted: GoalAutoSave | null = inlineRule
    ? {
        amount: inlineRule.amount,
        cadence: inlineRule.recurrencePattern === 'weekly' ? 'weekly' : 'monthly',
        fromAccountId: inlineRule.fromAccountId ?? '',
      }
    : null;
  if ('autoSave' in set) {
    if (!showAutoSave) return tools.refuse('invalid');
    const shown = inlineRule ? { id: inlineRule.id, at: inlineRule.updatedAt } : null;
    if (shown?.id !== ruleRef?.id || shown?.at !== ruleRef?.at) return tools.refuse('conflict');
    wanted = set.autoSave ?? null;
  } else if (currencyChanged && inlineRule && showAutoSave) {
    // A new currency clears the editor's source, so the rule has to be re-picked.
    return tools.refuse('invalid');
  }
  if (showAutoSave && wanted) {
    if (!(wanted.amount > 0) || !autoSaveSource(tools, wanted.fromAccountId, currency)) {
      return tools.refuse('invalid');
    }
  }

  const balanceNow = lookup.balances.get(current.id) ?? current.startingBalance;
  const balanceInSelected = currencyChanged
    ? (lookup.convert(balanceNow, current.currency, currency) ?? balanceNow)
    : balanceNow;
  // Raising the target back above the saved amount revives the goal.
  const clearsAchievement = current.goalAchievedAt != null && target > balanceInSelected;
  const updates: Record<string, unknown> = {
    name,
    includeInTotals: set.includeInTotals ?? current.includeInTotals,
    goalTargetAmount: target,
    goalTargetDate: targetDate,
    goalEmoji: emoji.trim() || null,
    goalCoverUri: current.goalCoverUri ?? null,
    ...(clearsAchievement ? { goalAchievedAt: null } : {}),
  };

  const ruleOps: GoalRuleOp[] = [];
  if (showAutoSave) {
    const { ruleName } = tools.extra as GoalExtra;
    if (!wanted) {
      if (inlineRule) ruleOps.push({ op: 'delete', id: inlineRule.id });
    } else {
      const input = {
        name: ruleName(name),
        type: 'transfer' as const,
        amount: wanted.amount,
        currency,
        fromAccountId: wanted.fromAccountId,
        toAccountId: current.id,
        recurrencePattern: wanted.cadence,
        recurrenceInterval: 1,
        nextRunDate: goalNextRunDate(wanted.cadence, lookup.now),
      };
      if (!inlineRule) {
        ruleOps.push({ op: 'create', input });
      } else {
        // The schedule restarts only on a new cadence; the name follows a rename
        // only while it is still the generated one.
        const cadenceChanged = inlineRule.recurrencePattern !== wanted.cadence;
        const keepsGeneratedName = inlineRule.name === ruleName(current.name);
        const unchanged =
          !cadenceChanged &&
          inlineRule.amount === input.amount &&
          inlineRule.currency === input.currency &&
          inlineRule.fromAccountId === input.fromAccountId &&
          (!keepsGeneratedName || inlineRule.name === input.name);
        if (!unchanged) {
          ruleOps.push({
            op: 'update',
            id: inlineRule.id,
            input: {
              amount: input.amount,
              currency: input.currency,
              fromAccountId: input.fromAccountId,
              recurrencePattern: input.recurrencePattern,
              ...(keepsGeneratedName ? { name: input.name } : {}),
              ...(cadenceChanged ? { nextRunDate: input.nextRunDate } : {}),
            },
          });
        }
      }
    }
  }

  // The rule is this goal's to change: the same batch must not also edit it as a recurring rule.
  for (const rule of ruleOps) {
    if (rule.op !== 'create' && !tools.claim(`rule:${rule.id}`)) return tools.refuse('invalid');
  }
  const payload: GoalUpdatePayload = { id: current.id, updates, rules: ruleOps };
  if (currencyChanged) {
    // Re-denominating runs as its own operation; the saved amount waits for a later edit.
    if (set.balance !== undefined) return tools.refuse('invalid');
    payload.currency = currency;
  } else if (set.balance !== undefined) {
    const delta = set.balance - balanceInSelected;
    if (Math.abs(delta) > 0.000001) {
      if (!set.balanceRecord) return tools.refuse('invalid');
      payload.adjustment =
        set.balanceRecord === 'difference'
          ? { type: 'balance_adjustment', amount: delta, currency }
          : { type: delta > 0 ? 'income' : 'expense', amount: Math.abs(delta), currency };
    }
  }
  steps.push({ kind: 'module', entity: ENTITY, action: 'update', payload });
  return tools.ok(1);
}

function plan(tools: PlanTools, op: ModuleOp, steps: EditStep[]): Result<number> {
  if (op.op === 'create') return planCreate(tools, op.goal as GoalFields, steps);
  const id = op.id as string;
  if (!tools.claim(`account:${id}`)) return tools.refuse('invalid');
  const current = existingGoal(tools, id, op.at as string | null);
  if (!current) return tools.refuse('conflict');
  if (op.op === 'delete') {
    steps.push({ kind: 'module', entity: ENTITY, action: 'delete', payload: { id } });
    tools.forget('account', id);
    return tools.ok(1);
  }
  if (op.op === 'archive') {
    const archived = op.archived as boolean;
    // Un-archiving re-enters the active pool, so it re-runs the free plan's limit.
    if (!archived && current.goalArchivedAt != null) {
      const limit = goalLimit(tools);
      if (!limit.ok) return limit;
      tools.created.goals = (tools.created.goals ?? 0) + 1;
    }
    steps.push({ kind: 'module', entity: ENTITY, action: 'archive', payload: { id, archived } });
    return tools.ok(1);
  }
  return planUpdate(
    tools,
    current,
    op.set as GoalFields,
    op.rule as { id: string; at: string | null } | null,
    steps,
  );
}

export const goalModule: EditModule = { entity: ENTITY, read, plan };

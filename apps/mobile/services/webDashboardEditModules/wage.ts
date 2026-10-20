/**
 * Web Dashboard edits: Hourly value: monthly wage entries (HourlyValueScreen
 * and its wage calculator). Planned on the phone like the app's own editor;
 * applied by features/settings/lib/webDashboardApply/wage.ts.
 *
 *   module:wage  create { month, config }   update { month, at, config }   delete { month, at }
 *
 * `month` is `YYYY-MM`, the key the app files an entry under; `at` is that
 * entry's `updated_at` in the browser's copy. `config` is the calculator's
 * answers: { wageType, wageAmount, hoursWorkedPerWeek, workdaysPerWeek,
 * commuteMinutesPerWorkday }.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import type { MonthlyWageSettings, WageConfig, WageType } from '~/types';

import type { EditModule, ModuleOp } from '../webDashboardEdits';

const WAGE_TYPES: WageType[] = ['hourly', 'monthly', 'yearly'];
const MAX_AMOUNT = 1e12;
/** Hours, days and minutes: far past any real week, short of anything absurd. */
const MAX_TIME = 1e6;

type WageOp =
  | { entity: 'module:wage'; op: 'create'; month: string; config: WageConfig }
  | { entity: 'module:wage'; op: 'update'; month: string; at: string | null; config: WageConfig }
  | { entity: 'module:wage'; op: 'delete'; month: string; at: string | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

/** `YYYY-MM`, as the app's month picker builds one. */
function isMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1970 && year <= 2200;
}

const CONFIG_KEYS: Record<keyof WageConfig, (value: unknown) => boolean> = {
  wageType: (v) => WAGE_TYPES.includes(v as WageType),
  wageAmount: (v) => isNumber(v, MAX_AMOUNT),
  hoursWorkedPerWeek: (v) => isNumber(v, MAX_TIME),
  workdaysPerWeek: (v) => isNumber(v, MAX_TIME),
  commuteMinutesPerWorkday: (v) => isNumber(v, MAX_TIME),
};

/** Every answer, each of the right shape, and nothing else. */
function readConfig(value: unknown): WageConfig | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== Object.keys(CONFIG_KEYS).length) return null;
  for (const key of keys) {
    const check = Object.prototype.hasOwnProperty.call(CONFIG_KEYS, key)
      ? CONFIG_KEYS[key as keyof WageConfig]
      : undefined;
    if (!check || !check(value[key])) return null;
  }
  const config = value as unknown as WageConfig;
  return {
    wageType: config.wageType,
    wageAmount: config.wageAmount,
    hoursWorkedPerWeek: config.hoursWorkedPerWeek,
    workdaysPerWeek: config.workdaysPerWeek,
    commuteMinutesPerWorkday: config.commuteMinutesPerWorkday,
  };
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const allowed =
    raw.op === 'create'
      ? ['entity', 'op', 'month', 'config']
      : raw.op === 'update'
        ? ['entity', 'op', 'month', 'at', 'config']
        : raw.op === 'delete'
          ? ['entity', 'op', 'month', 'at']
          : null;
  if (!allowed || Object.keys(raw).some((key) => !allowed.includes(key))) return null;
  if (!isMonth(raw.month)) return null;
  if (raw.op !== 'create' && !(raw.at === null || typeof raw.at === 'string')) return null;
  if (raw.op === 'delete') {
    return { entity: 'module:wage', op: 'delete', month: raw.month, at: raw.at as string | null };
  }
  const config = readConfig(raw.config);
  if (!config) return null;
  return raw.op === 'create'
    ? { entity: 'module:wage', op: 'create', month: raw.month, config }
    : {
        entity: 'module:wage',
        op: 'update',
        month: raw.month,
        at: raw.at as string | null,
        config,
      };
}

/** The app's list: one entry per month, the latest saved one winning, as the screen dedupes. */
function entriesByMonth(extra: unknown): Map<string, MonthlyWageSettings> {
  const rows = Array.isArray(extra) ? (extra as MonthlyWageSettings[]) : [];
  const byMonth = new Map<string, MonthlyWageSettings>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const match = /^(\d{4})-(\d{1,2})$/.exec(row.month.trim());
    const month = match ? `${match[1]}-${match[2].padStart(2, '0')}` : row.month;
    const existing = byMonth.get(month);
    if (!existing || row.updatedAt > existing.updatedAt) byMonth.set(month, row);
  }
  return byMonth;
}

export const wageModule: EditModule = {
  entity: 'module:wage',
  read,
  plan: (tools, raw, steps) => {
    const op = raw as unknown as WageOp;
    if (!tools.claim(`wage:${op.month}`)) return tools.refuse('invalid');
    const entries = entriesByMonth(tools.extra);
    const current = entries.get(op.month) ?? null;
    if (op.op === 'create') {
      // The app offers to edit a month that already has an entry; the browser's copy lacked it.
      if (current) return tools.refuse('conflict');
      // The app's month picker offers five years back to three ahead, plus years it has entries in.
      const year = Number(op.month.slice(0, 4));
      const thisYear = tools.lookup.now.getFullYear();
      const listed = [...entries.keys()].some((month) => Number(month.slice(0, 4)) === year);
      if (!listed && (year < thisYear - 5 || year > thisYear + 3)) return tools.refuse('invalid');
      // As the screen's add button: checkLimit('wage_entries', monthlyWages.length).
      const count = entries.size + (tools.created.wage ?? 0);
      if (!tools.lookup.isPro && count >= PRO_LIMITS.FREE_MAX_WAGE_ENTRIES) {
        return tools.refuse('pro_required', 'wage_entries');
      }
    } else if (!current || current.updatedAt !== op.at) {
      return tools.refuse('conflict');
    }
    if (op.op === 'delete') {
      steps.push({
        kind: 'module',
        entity: 'module:wage',
        action: 'delete',
        payload: { month: op.month },
      });
      return tools.ok(1);
    }
    const { config } = op;
    // The calculator moves on only with a wage, hours and workdays.
    if (config.wageAmount <= 0 || config.hoursWorkedPerWeek <= 0 || config.workdaysPerWeek <= 0) {
      return tools.refuse('invalid');
    }
    if (op.op === 'create') tools.created.wage = (tools.created.wage ?? 0) + 1;
    steps.push({
      kind: 'module',
      entity: 'module:wage',
      action: 'save',
      payload: { month: op.month, config },
    });
    return tools.ok(1);
  },
};

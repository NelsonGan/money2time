/**
 * Web Dashboard edits: Multi currency (ExchangeRatesScreen): the added
 * sub-currencies, their order and their manual rates. Planned on the phone
 * like the app's own screen; applied by
 * features/settings/lib/webDashboardApply/currency.ts.
 *
 *   module:currency  add { code }   remove { code }   reorder { codes }   rate { code, rate }
 *
 * `rate` is how many of `code` one main-currency unit buys, as the screen's
 * rate editor asks it. Changing the main currency (which wipes all data) and
 * fetching rates online stay in the app.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import { isAutoRateSupported } from '~/utils/currency';

import type { EditModule, ModuleOp, PlanTools } from '../webDashboardEdits';
import { isCurrency as isCode } from './shared';

const MAX_RATE = 1e12;
/** More than every currency there is. */
const MAX_CODES = 200;

type CurrencyOp =
  | { entity: 'module:currency'; op: 'add'; code: string }
  | { entity: 'module:currency'; op: 'remove'; code: string }
  | { entity: 'module:currency'; op: 'reorder'; codes: string[] }
  | { entity: 'module:currency'; op: 'rate'; code: string; rate: number };

/** What the planner reads from the app (the apply module's `select`). */
export type CurrencyExtra = { reporting: string; fxCurrencies: string[] };

const KEYS: Record<CurrencyOp['op'], string[]> = {
  add: ['code'],
  remove: ['code'],
  reorder: ['codes'],
  rate: ['code', 'rate'],
};

function read(raw: Record<string, unknown>): ModuleOp | null {
  const op = raw.op as CurrencyOp['op'];
  const keys = Object.prototype.hasOwnProperty.call(KEYS, op) ? KEYS[op] : null;
  if (!keys) return null;
  if (Object.keys(raw).some((key) => key !== 'entity' && key !== 'op' && !keys.includes(key))) {
    return null;
  }
  if (op === 'reorder') {
    const { codes } = raw;
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > MAX_CODES) return null;
    if (!codes.every(isCode) || new Set(codes).size !== codes.length) return null;
    return { entity: 'module:currency', op, codes: [...codes] };
  }
  if (!isCode(raw.code)) return null;
  if (op === 'rate') {
    const { rate } = raw;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > MAX_RATE) {
      return null;
    }
    return { entity: 'module:currency', op, code: raw.code, rate };
  }
  return { entity: 'module:currency', op, code: raw.code };
}

/**
 * The screen's list: the added currencies in their saved order, then any
 * account currency not added yet; never the main one.
 */
function screenState(tools: PlanTools) {
  const { reporting, fxCurrencies } = tools.extra as CurrencyExtra;
  const inUse = new Set(
    tools.liveAccounts
      .map((account) => account.currency)
      .filter((code) => code && code !== reporting),
  );
  const shown: string[] = [];
  for (const code of [...fxCurrencies, ...inUse]) {
    if (code !== reporting && !shown.includes(code)) shown.push(code);
  }
  return { reporting, fxCurrencies, inUse, shown };
}

export const currencyModule: EditModule = {
  entity: 'module:currency',
  read,
  size: (op) => (op.op === 'reorder' ? (op as unknown as { codes: string[] }).codes.length : 1),
  plan: (tools, raw, steps) => {
    const op = raw as unknown as CurrencyOp;
    const { reporting, fxCurrencies, inUse, shown } = screenState(tools);
    const push = (action: string, payload: Record<string, unknown>) => {
      steps.push({ kind: 'module', entity: 'module:currency', action, payload });
      return tools.ok(1);
    };
    if (op.op === 'reorder') {
      if (!tools.claim('currency:order')) return tools.refuse('invalid');
      // The whole list as the browser showed it, reordered; anything else is stale.
      const same =
        op.codes.length === shown.length && op.codes.every((code) => shown.includes(code));
      if (!same) return tools.refuse('conflict');
      return push('reorder', { codes: op.codes });
    }
    if (!tools.claim(`currency:${op.code}`)) return tools.refuse('invalid');
    if (op.op === 'add') {
      // The picker offers what the rate feed knows, minus the main and listed ones.
      if (op.code === reporting || !isAutoRateSupported(op.code)) return tools.refuse('invalid');
      if (shown.includes(op.code)) return tools.refuse('conflict');
      // As the screen's Add button: checkLimit('subcurrencies', added ones not in use).
      const added =
        fxCurrencies.filter((code) => code !== reporting && !inUse.has(code)).length +
        (tools.created.subcurrencies ?? 0);
      if (!tools.lookup.isPro && added >= PRO_LIMITS.FREE_MAX_SUBCURRENCIES) {
        return tools.refuse('pro_required', 'subcurrencies');
      }
      tools.created.subcurrencies = (tools.created.subcurrencies ?? 0) + 1;
      return push('add', { code: op.code });
    }
    if (op.op === 'remove') {
      // An account's currency stays: the screen offers no Remove for it.
      if (inUse.has(op.code)) return tools.refuse('invalid');
      if (!fxCurrencies.includes(op.code)) return tools.refuse('conflict');
      return push('remove', { code: op.code });
    }
    // A rate is set for a currency on the list, as its rate editor does.
    if (!shown.includes(op.code)) return tools.refuse('conflict');
    return push('rate', { code: op.code, rate: op.rate });
  },
};

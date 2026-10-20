/**
 * Web Dashboard edits: loans, as the app's account editor makes them
 * (AccountsScreen: AccountEditorSheet's loan fields, AccountEditorScreen's
 * save). Planned on the phone like that editor; applied by
 * features/settings/lib/webDashboardApply/loan.ts.
 *
 *   create   { loan: LoanForm }
 *   update   { id, at, loan: LoanForm, balance?, balanceRecord?, rateApply? }
 *   archive  { id, at, archived }
 *   delete   { id, at }
 *
 * `loan` is the editor's whole form as the browser shows it, not a diff: the
 * rate, the total repayable and the instalment are one contract worked out
 * from each other, so the phone recomputes it with the app's own loan math
 * (`loanMath.ts`) exactly as the editor does on Save, and stores what that
 * gives. `rateApply` answers the editor's "When does the new rate apply?"
 * and is required when the save changes a reducing balance loan's rate.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import { resolveLoanContractFields } from '~/features/loans/lib/loanContractFields';
import {
  computeLoanProgress,
  computeLoanQuote,
  isContractTrackingRule,
  isRepaymentRule,
  loanRateHistoryIsStale,
  pendingLoanRateChange,
  rateForTotalRepayable,
} from '~/features/loans/lib/loanMath';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import type { Account, LoanInterestModel, LoanRateChange } from '~/types';
import { flowTypeForBalanceDelta } from '~/utils/accountBalances';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { nextOccurrenceOfMonthDay } from '~/utils/statementPeriods';

import type { EditModule, EditStep, ModuleOp, PlanTools, Result } from '../webDashboardEdits';

const ENTITY = 'module:loan';
const MAX_NAME = 200;
/** What a read lets through; the plan holds a changed name to MAX_NAME. */
const MAX_TEXT = 10000;
const MAX_AMOUNT = 1e12;
/** The seeded expense category a loan repayment is filed under by default. */
const DEFAULT_LOAN_CATEGORY_NAME = 'bills';

/** The loan editor's form, as the browser shows it on Save. */
export type LoanForm = {
  name: string;
  /** The group's name, as accounts store it, or null for ungrouped. */
  group: string | null;
  logoId: string | null;
  currency: string;
  includeInTotals: boolean;
  model: LoanInterestModel;
  /** Loan amount. */
  principal: number;
  /** Loan period in months, or null when left empty (an existing loan only). */
  termMonths: number | null;
  /** Which of the rate and the total the borrower typed last; the other follows it. */
  driver: 'rate' | 'total';
  /** Interest rate (%) as typed, under `model`; read while it drives. */
  rate: number | null;
  /** Total repayable as typed; read while it drives. */
  total: number | null;
  /** The monthly instalment the borrower set, or null for "follows the total". */
  instalment: number | null;
  /** Create only: instalments already paid. */
  paidPeriods?: number;
  /** Start date, `YYYY-MM-DD`. */
  startDate: string;
  countAsExpense: boolean;
  /** The repayment category, or null for the editor's default (Bills). */
  paymentCategoryId: string | null;
  /**
   * The account repayments are collected from, or null for manual. Left out on
   * an update when the loan's rule is one the editor cannot show.
   */
  collectFromAccountId?: string | null;
};

/** What the planner reads from the app (the apply module's `select`). */
export type LoanExtra = {
  /** The generated name of a loan's repayment rule (`accounts.loan.autopay_rule_name`). */
  ruleName: (loanName: string) => string;
};

export type LoanRuleOp =
  | { op: 'create'; input: Record<string, unknown> }
  | { op: 'update'; id: string; input: Record<string, unknown> }
  | { op: 'delete'; id: string };

export type LoanCreatePayload = {
  input: Record<string, unknown>;
  rule: Record<string, unknown> | null;
  /** The properties AccountEditorScreen reports LOAN_CREATED with. */
  analytics: {
    interestModel: string;
    hasRate: boolean;
    hasCollectAccount: boolean;
    countsAsExpense: boolean;
    currency: string;
  };
};

export type LoanUpdatePayload = {
  id: string;
  updates: Record<string, unknown>;
  /** Re-denominate the loan (`changeAccountCurrency`); its rules are left to the recurring editor. */
  currency?: string;
  adjustment?: {
    type: 'balance_adjustment' | 'income' | 'expense';
    amount: number;
    currency: string;
  };
  rules: LoanRuleOp[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;
const isAt = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT;
const isCount = (value: unknown, max: number) =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
/** A catalog logo, or an uploaded one (which the plan only lets a loan keep). */
const isLogo = (value: unknown) =>
  value === null ||
  (typeof value === 'string' &&
    (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(value) || /^custom:[\w./-]{1,200}$/.test(value)));

const FORM_KEYS: Record<string, { check: (value: unknown) => boolean; optional?: boolean }> = {
  name: { check: (v) => typeof v === 'string' && v.length <= MAX_TEXT },
  group: { check: (v) => v === null || (typeof v === 'string' && v.length <= MAX_TEXT) },
  logoId: { check: isLogo },
  currency: { check: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v) },
  includeInTotals: { check: (v) => typeof v === 'boolean' },
  model: { check: (v) => v === 'reducing' || v === 'flat' },
  principal: { check: isMoney },
  termMonths: { check: (v) => v === null || isCount(v, 100000) },
  driver: { check: (v) => v === 'rate' || v === 'total' },
  rate: {
    check: (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6),
  },
  total: { check: (v) => v === null || isMoney(v) },
  instalment: { check: (v) => v === null || isMoney(v) },
  paidPeriods: { check: (v) => isCount(v, 100000), optional: true },
  startDate: { check: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) },
  countAsExpense: { check: (v) => typeof v === 'boolean' },
  paymentCategoryId: { check: (v) => v === null || isId(v) },
  collectFromAccountId: { check: (v) => v === null || isId(v), optional: true },
};

function readForm(value: unknown, mode: 'create' | 'update'): LoanForm | null {
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const spec = Object.prototype.hasOwnProperty.call(FORM_KEYS, key) ? FORM_KEYS[key] : undefined;
    if (!spec || !spec.check(item)) return null;
  }
  for (const [key, spec] of Object.entries(FORM_KEYS)) {
    if (!spec.optional && !Object.prototype.hasOwnProperty.call(value, key)) return null;
  }
  // Instalments already paid shape a new loan's opening balance; an existing
  // loan's balance is its own source of truth.
  if (mode === 'update' && 'paidPeriods' in value) return null;
  return value as LoanForm;
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const allowed = (keys: string[]) => Object.keys(raw).every((key) => keys.includes(key));
  if (op === 'create') {
    if (!allowed(['entity', 'op', 'loan'])) return null;
    const loan = readForm(raw.loan, 'create');
    return loan ? { entity: ENTITY, op, loan } : null;
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
    if (!allowed(['entity', 'op', 'id', 'at', 'loan', 'balance', 'balanceRecord', 'rateApply'])) {
      return null;
    }
    const loan = readForm(raw.loan, 'update');
    if (!loan) return null;
    if ('balance' in raw && !isMoney(raw.balance)) return null;
    if (
      'balanceRecord' in raw &&
      raw.balanceRecord !== 'difference' &&
      raw.balanceRecord !== 'flow'
    ) {
      return null;
    }
    if ('rateApply' in raw && raw.rateApply !== 'start' && raw.rateApply !== 'today') return null;
    const out: ModuleOp = { entity: ENTITY, op, id: raw.id, at: raw.at, loan };
    for (const key of ['balance', 'balanceRecord', 'rateApply']) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
    }
    return out;
  }
  return null;
}

// ------------------------------------------------------------------ planning --

function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function extraOf(tools: PlanTools): LoanExtra {
  const extra = tools.extra as Partial<LoanExtra> | undefined;
  return { ruleName: extra?.ruleName ?? ((name) => name) };
}

/** A collect account as the editor's picker offers it: a debit account in the loan's currency. */
function collectSource(tools: PlanTools, id: string | null | undefined, currency: string) {
  const source = tools.findAccount(id);
  return source && source.type === 'debit' && source.currency === currency ? source : null;
}

/**
 * The repayment category the editor saves: the one picked while it is still an
 * expense category it can draw, else Bills, else the first root expense category.
 */
function effectiveCategoryId(tools: PlanTools, picked: string | null): string | null {
  const roots = tools.liveCategories.filter(
    (item) => item.type === 'expense' && item.parentId === null,
  );
  const drawable = (id: string) => {
    const category = tools.findCategory(id);
    if (!category || category.type !== 'expense') return false;
    return category.parentId === null || roots.some((root) => root.id === category.parentId);
  };
  if (picked && drawable(picked)) return picked;
  const byName = roots.find(
    (item) => item.name.trim().toLowerCase() === DEFAULT_LOAN_CATEGORY_NAME,
  );
  return byName?.id ?? roots[0]?.id ?? null;
}

type EditorInput = Record<string, unknown> & {
  name: string;
  currency: string;
  loanMonthlyPayment: number | null;
  loanPaymentDay: number | null;
  loanCountAsExpense: boolean;
  loanPaymentCategoryId: string | null;
  loanInterestModel: LoanInterestModel;
  loanOriginalPrincipal: number | null;
  loanTotalRepayable: number | null;
  loanTermMonths: number | null;
  loanInterestRate: number | null;
  loanRateChanges?: LoanRateChange[] | null;
};

type Contract = {
  /** The account fields the editor's Save builds (its `AccountEditorInput`, form state aside). */
  input: EditorInput;
  firstInstalmentDate: string | null;
  finalInstalmentDate: string | null;
  /** Whether `loanQuote` came out, for validation. */
  hasQuote: boolean;
};

/** What AccountEditorSheet's handleSave builds from the form, with its checks. */
function contractOf(
  tools: PlanTools,
  form: LoanForm,
  current: Account | null,
  balance: number,
): Result<Contract> {
  const today = localDay(tools.lookup.now);
  const isEdit = current !== null;
  const name = form.name.trim();
  // A name past the limit only stays where the loan already has it.
  if (!name || (name.length > MAX_NAME && name !== current?.name.trim())) {
    return tools.refuse('invalid');
  }
  // The web cannot upload a logo: an uploaded one only stays where the loan has it.
  if (form.logoId?.startsWith('custom:') && form.logoId !== current?.logoId) {
    return tools.refuse('invalid');
  }
  const group = groupOf(tools, form.group, current);
  if (group === undefined) return tools.refuse('invalid');
  if (!tools.isDayKey(form.startDate)) return tools.refuse('invalid');
  const principal = form.principal;
  const termEmpty = form.termMonths === null;
  const term = form.termMonths ?? 0;
  const fields = resolveLoanContractFields({
    model: form.model,
    principal,
    termMonths: term,
    driver: form.driver,
    rateInput: form.rate === null ? '' : String(form.rate),
    totalInput: form.total === null ? '' : String(form.total),
  });
  const totalText = fields.total;
  const total = Number(totalText);
  const derivedInstalment =
    totalText.trim().length === 0 ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isInteger(term) ||
    term <= 0
      ? null
      : normalizeMoneyAmount(total / term);
  const instalment = form.instalment === null ? derivedInstalment : form.instalment;
  const derivedRate = rateForTotalRepayable(principal, total, term);
  const paidPeriods = form.paidPeriods ?? 0;

  let progressPaid: number | null = null;
  if (isEdit && Number.isFinite(balance) && balance > 0) {
    const paying = instalment ?? current.loanMonthlyPayment ?? 0;
    if (paying > 0) {
      progressPaid = computeLoanProgress({
        balance,
        originalPrincipal: principal,
        monthlyPayment: paying,
        paymentDay: null,
        annualRatePercent: derivedRate,
        interestModel: form.model,
        termMonths: Number.isInteger(term) ? term : null,
        totalRepayable: totalText.trim().length > 0 ? total : (current.loanTotalRepayable ?? null),
        todayIso: today,
      }).instalmentsPaid;
    }
  }
  const quote = computeLoanQuote({
    principal,
    annualRatePercent: null,
    termMonths: term,
    paidPeriods: isEdit
      ? Math.min(Math.max(0, progressPaid ?? 0), Math.max(0, term - 1))
      : paidPeriods,
    startDate: form.startDate,
    totalRepayable: totalText.trim().length > 0 ? total : null,
    instalment,
  });
  const hasValidPrincipal = Number.isFinite(principal) && principal > 0;
  // A contract that yields a quote is a valid one; an existing loan may go without a term.
  const valid = isEdit ? hasValidPrincipal && (termEmpty || quote != null) : quote != null;
  if (!valid) return tools.refuse('invalid');

  const isNewLoan = !isEdit;
  const countAsExpense = form.countAsExpense;
  const input: EditorInput = {
    name,
    type: 'loan',
    logoId: form.logoId,
    cardDesign: current?.cardDesign ?? null,
    accountGroup: group,
    creditStatementDay: null,
    creditDueDay: null,
    includeInTotals: form.includeInTotals,
    startingBalance: isNewLoan && quote ? quote.openingBalance : balance,
    currency: form.currency,
    loanInterestModel: form.model,
    loanOriginalPrincipal: hasValidPrincipal ? principal : null,
    loanMonthlyPayment: quote?.instalment ?? current?.loanMonthlyPayment ?? null,
    loanPaymentDay: quote?.paymentDay ?? current?.loanPaymentDay ?? null,
    loanTermMonths: quote ? term : (current?.loanTermMonths ?? null),
    loanStartDate: form.startDate,
    loanLedgerAnchorDate: isNewLoan && quote ? quote.openingBalanceDate : null,
    loanTotalRepayable: quote ? quote.totalRepayable : null,
    loanInterestRate: derivedRate != null ? derivedRate : null,
    loanCountAsExpense: countAsExpense,
    loanPaymentCategoryId: countAsExpense
      ? effectiveCategoryId(tools, form.paymentCategoryId)
      : null,
  };
  return tools.ok({
    input,
    firstInstalmentDate: quote ? quote.firstInstalmentDate : null,
    finalInstalmentDate: quote ? quote.payoffDate : null,
    hasQuote: quote != null,
  });
}

/** AccountsScreen's `buildLoanRepaymentRule`: the transfer that pays the instalment. */
function repaymentRule(
  tools: PlanTools,
  contract: Contract,
  loanAccountId: string | null,
  fromAccountId: string,
  instalment: number,
): Record<string, unknown> {
  const { input } = contract;
  const today = localDay(tools.lookup.now);
  return {
    name: extraOf(tools).ruleName(input.name),
    type: 'transfer',
    amount: instalment,
    currency: input.currency,
    fromAccountId,
    ...(loanAccountId ? { toAccountId: loanAccountId } : {}),
    countsAsExpense: input.loanCountAsExpense ?? false,
    categoryId: input.loanCountAsExpense ? input.loanPaymentCategoryId : null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate:
      contract.firstInstalmentDate && contract.firstInstalmentDate > today
        ? contract.firstInstalmentDate
        : localDay(nextOccurrenceOfMonthDay(input.loanPaymentDay ?? 1, tools.lookup.now)),
    endDate: contract.finalInstalmentDate,
  };
}

/**
 * The group the editor saves: a group that exists, or none. The app's picker
 * only offers group records, so a loan on a group name without one is saved
 * ungrouped, as the app's editor saves it. Undefined for anything else.
 */
function groupOf(tools: PlanTools, group: string | null, current: Account | null) {
  if (!group) return null;
  if (tools.lookup.accountGroups.some((item) => !item.deletedAt && item.name === group))
    return group;
  return current && group === current.accountGroup ? null : undefined;
}

function planCreate(tools: PlanTools, form: LoanForm, steps: EditStep[]): Result<number> {
  const { lookup } = tools;
  if (!lookup.currencies.includes(form.currency)) {
    return tools.refuse('invalid');
  }
  const contract = contractOf(tools, form, null, 0);
  if (!contract.ok) return contract;
  let collect: string | null = null;
  if (form.collectFromAccountId) {
    const source = collectSource(tools, form.collectFromAccountId, form.currency);
    if (!source) return tools.refuse('invalid');
    collect = source.id;
  }
  // As the editor's Save: the accounts limit for any account, then the loans one.
  if (!lookup.isPro) {
    const accounts = countAccountsTowardFreeLimit(lookup.accounts) + tools.created.accounts;
    if (accounts >= PRO_LIMITS.FREE_MAX_ACCOUNTS) return tools.refuse('pro_required', 'accounts');
    const loans =
      tools.liveAccounts.filter((item) => item.type === 'loan' && item.loanArchivedAt == null)
        .length + (tools.created.loans ?? 0);
    if (loans >= PRO_LIMITS.FREE_MAX_LOANS) return tools.refuse('pro_required', 'loans');
  }
  tools.created.accounts++;
  tools.created.loans = (tools.created.loans ?? 0) + 1;
  const instalment = contract.value.input.loanMonthlyPayment;
  const payload: LoanCreatePayload = {
    input: contract.value.input,
    rule:
      collect && instalment
        ? repaymentRule(tools, contract.value, null, collect, instalment)
        : null,
    analytics: {
      interestModel: contract.value.input.loanInterestModel ?? 'flat',
      hasRate: contract.value.input.loanInterestRate != null,
      hasCollectAccount: collect != null,
      countsAsExpense: contract.value.input.loanCountAsExpense ?? false,
      currency: contract.value.input.currency,
    },
  };
  steps.push({ kind: 'module', entity: ENTITY, action: 'create', payload });
  return tools.ok(1);
}

function planUpdate(tools: PlanTools, current: Account, op: ModuleOp, steps: EditStep[]) {
  const { lookup } = tools;
  const form = op.loan as LoanForm;
  const currencyChanged = form.currency !== current.currency;
  if (currencyChanged && !lookup.currencies.includes(form.currency)) return tools.refuse('invalid');
  const balanceNow = lookup.balances.get(current.id) ?? current.startingBalance;
  const balance = typeof op.balance === 'number' ? op.balance : balanceNow;
  // A currency change runs on its own; the balance field is not read with it.
  if (currencyChanged && op.balance !== undefined) return tools.refuse('invalid');
  const contract = contractOf(tools, form, current, balance);
  if (!contract.ok) return contract;
  const { input } = contract.value;

  const rules = lookup.recurringRules.filter((rule) => !rule.deletedAt);
  const existingRule = rules.find((rule) => isRepaymentRule(rule, current.id)) ?? null;
  // A rule paying from an account the editor's picker cannot offer is shown
  // read-only, and left alone.
  const external =
    existingRule != null && !collectSource(tools, existingRule.fromAccountId, form.currency);
  let collect: string | null | undefined = form.collectFromAccountId;
  if (external) {
    if (collect !== undefined && collect !== existingRule.fromAccountId) {
      return tools.refuse('invalid');
    }
    collect = undefined;
  } else if (collect === undefined) {
    collect = existingRule?.fromAccountId ?? null;
  } else if (collect !== null && !collectSource(tools, collect, form.currency)) {
    return tools.refuse('invalid');
  }

  // "When does the new rate apply?", as the editor asks it.
  const rateChange = pendingLoanRateChange(current, input, localDay(lookup.now));
  if (rateChange) {
    if (op.rateApply === undefined) return tools.refuse('invalid');
    input.loanRateChanges = op.rateApply === 'today' ? rateChange.changes : null;
  } else if (loanRateHistoryIsStale(current, form.model)) {
    input.loanRateChanges = null;
  }

  const loanUpdates: Record<string, unknown> = {
    loanOriginalPrincipal: input.loanOriginalPrincipal,
    loanMonthlyPayment: input.loanMonthlyPayment,
    loanPaymentDay: input.loanPaymentDay,
    loanInterestRate: input.loanInterestRate,
    loanInterestModel: input.loanInterestModel,
    loanTotalRepayable: input.loanTotalRepayable,
    loanTermMonths: input.loanTermMonths,
    loanStartDate: input.loanStartDate,
    loanCountAsExpense: input.loanCountAsExpense,
    loanPaymentCategoryId: input.loanPaymentCategoryId,
    ...(input.loanRateChanges !== undefined ? { loanRateChanges: input.loanRateChanges } : {}),
  };
  const common = {
    name: input.name,
    accountGroup: input.accountGroup,
    logoId: input.logoId,
    cardDesign: input.cardDesign,
    creditStatementDay: input.creditStatementDay,
    creditDueDay: input.creditDueDay,
    includeInTotals: input.includeInTotals,
  };

  if (currencyChanged) {
    const payload: LoanUpdatePayload = {
      id: current.id,
      currency: form.currency,
      updates: { ...common, ...loanUpdates },
      rules: [],
    };
    steps.push({ kind: 'module', entity: ENTITY, action: 'update', payload });
    return tools.ok(1);
  }

  const ruleOps: LoanRuleOp[] = [];
  // A rule that still pays the old instalment follows the corrected contract.
  const previous = current.loanMonthlyPayment;
  const next = input.loanMonthlyPayment;
  if (previous != null && next != null && Math.abs(next - previous) > 0.005) {
    for (const rule of rules) {
      if (isContractTrackingRule(rule, current.id, previous)) {
        ruleOps.push({ op: 'update', id: rule.id, input: { amount: next } });
      }
    }
  }
  // Every rule paying in reports the way the loan says.
  const counted = input.loanCountAsExpense ?? false;
  const categoryId = counted ? (input.loanPaymentCategoryId ?? null) : null;
  for (const rule of rules) {
    if (!isRepaymentRule(rule, current.id)) continue;
    if (rule.countsAsExpense === counted && rule.categoryId === categoryId) continue;
    ruleOps.push({ op: 'update', id: rule.id, input: { countsAsExpense: counted, categoryId } });
  }
  // "Collect from", reconciled against the rule paying in now.
  if (collect !== undefined) {
    if (!collect) {
      if (existingRule) ruleOps.push({ op: 'delete', id: existingRule.id });
    } else if (existingRule) {
      if (existingRule.fromAccountId !== collect) {
        ruleOps.push({ op: 'update', id: existingRule.id, input: { fromAccountId: collect } });
      }
    } else if (next) {
      ruleOps.push({
        op: 'create',
        input: repaymentRule(tools, contract.value, current.id, collect, next),
      });
    }
  }

  const payload: LoanUpdatePayload = {
    id: current.id,
    updates: { ...common, currency: input.currency, ...loanUpdates },
    rules: ruleOps,
  };
  const delta = balance - balanceNow;
  if (Math.abs(delta) > 0.000001) {
    // The app asks how a changed balance is recorded; so must the web.
    if (op.balanceRecord === undefined) return tools.refuse('invalid');
    payload.adjustment =
      op.balanceRecord === 'difference'
        ? { type: 'balance_adjustment', amount: delta, currency: input.currency }
        : {
            type: flowTypeForBalanceDelta(current.type, delta),
            amount: Math.abs(delta),
            currency: input.currency,
          };
  }
  steps.push({ kind: 'module', entity: ENTITY, action: 'update', payload });
  return tools.ok(1);
}

function plan(tools: PlanTools, op: ModuleOp, steps: EditStep[]): Result<number> {
  if (op.op === 'create') return planCreate(tools, op.loan as LoanForm, steps);
  const id = op.id as string;
  if (!tools.claim(`account:${id}`)) return tools.refuse('invalid');
  const current = tools.findAccount(id);
  if (!current || current.type !== 'loan' || current.updatedAt !== op.at) {
    return tools.refuse('conflict');
  }
  if (op.op === 'delete') {
    steps.push({ kind: 'module', entity: ENTITY, action: 'delete', payload: { id } });
    tools.forget('account', id);
    return tools.ok(1);
  }
  if (op.op === 'archive') {
    steps.push({
      kind: 'module',
      entity: ENTITY,
      action: 'archive',
      payload: { id, archived: op.archived as boolean },
    });
    return tools.ok(1);
  }
  return planUpdate(tools, current, op, steps);
}

export const loanModule: EditModule = { entity: ENTITY, read, plan };

import { computeLoanQuote } from '~/features/loans/lib/loanMath';
import {
  type EditLookup,
  type EditStep,
  planEdit,
  readEditRequest,
} from '~/services/webDashboardEdits';
import type { Account, Category, RecurringTransactionRule } from '~/types';

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
    accountGroup: null,
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Account;

/** A flat 10% loan of 12,000 over a year: 13,200 back, 1,100 a month. */
const car = (patch: Partial<Account> = {}) =>
  account('car', {
    type: 'loan',
    name: 'Car',
    startingBalance: 13200,
    cardDesign: 'genre/plain',
    loanInterestModel: 'flat',
    loanOriginalPrincipal: 12000,
    loanTotalRepayable: 13200,
    loanMonthlyPayment: 1100,
    loanTermMonths: 12,
    loanPaymentDay: 15,
    loanInterestRate: 18.03,
    loanStartDate: '2026-06-15',
    loanLedgerAnchorDate: '2026-06-15',
    loanCountAsExpense: true,
    loanPaymentCategoryId: 'bills',
    loanArchivedAt: null,
    ...patch,
  });

const category = (id: string, patch: Partial<Category> = {}) =>
  ({
    id,
    name: id,
    type: 'expense',
    parentId: null,
    icon: 'meal',
    updatedAt: AT,
    deletedAt: null,
    ...patch,
  }) as Category;

const repayment = (patch: Partial<RecurringTransactionRule> = {}) =>
  ({
    id: 'r1',
    name: 'Car repayment',
    type: 'transfer',
    amount: 1100,
    currency: 'MYR',
    accountId: null,
    fromAccountId: 'myr',
    toAccountId: 'car',
    toAmount: null,
    categoryId: 'bills',
    countsAsExpense: true,
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
    accounts: [
      account('myr'),
      account('usd', { currency: 'USD' }),
      account('card', { type: 'credit' }),
    ],
    accountGroups: [
      { id: 'g1', name: 'Bank', deletedAt: null } as EditLookup['accountGroups'][number],
    ],
    categories: [category('food'), category('bills'), category('car-loan', { parentId: 'bills' })],
    recurringRules: [],
    balances: new Map(),
    reportingCurrency: 'MYR',
    currencies: ['MYR', 'USD'],
    isPro: true,
    convert: (amount) => amount,
    isCategoryIcon: () => true,
    suggestIcon: () => null,
    now: NOW,
    extras: { 'module:loan': { ruleName: (name: string) => `${name} repayment` } },
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

const form = (patch: Record<string, unknown> = {}) => ({
  name: 'Car',
  group: null,
  logoId: null,
  currency: 'MYR',
  includeInTotals: true,
  model: 'flat',
  principal: 12000,
  termMonths: 12,
  driver: 'rate',
  rate: 10,
  total: null,
  instalment: null,
  startDate: '2026-06-15',
  countAsExpense: true,
  paymentCategoryId: null,
  ...patch,
});
const create = (patch: Record<string, unknown> = {}) => ({
  entity: 'module:loan',
  op: 'create',
  loan: form(patch),
});
/** The form as the editor opens an existing loan: the total leads. */
const editForm = (patch: Record<string, unknown> = {}) =>
  form({ driver: 'total', rate: null, total: 13200, paymentCategoryId: 'bills', ...patch });
const update = (patch: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  entity: 'module:loan',
  op: 'update',
  id: 'car',
  at: AT,
  loan: editForm(patch),
  ...extra,
});
const payloadOf = (step: EditStep) => (step as Extract<EditStep, { kind: 'module' }>).payload;
const withCar = (patch: Partial<Account> = {}) => ({
  accounts: [account('myr'), account('usd', { currency: 'USD' }), car(patch)],
  balances: new Map([['car', 13200]]),
});

describe('module:loan read', () => {
  it.each([
    ['a missing field', { entity: 'module:loan', op: 'create', loan: { name: 'Car' } }],
    ['an unknown field', create({ colour: 'red' })],
    ['a made-up model', create({ model: 'balloon' })],
    ['a fractional term', create({ termMonths: 1.5 })],
    ['a bad logo', create({ logoId: 'Maybank' })],
    ['instalments paid on an edit', update({ paidPeriods: 2 })],
    ['a made-up rate answer', update({}, { rateApply: 'later' })],
    ['an endless balance', update({}, { balance: Infinity })],
  ])('refuses %s', (_name, op) => {
    expect(
      readEditRequest({ type: 'edit', id: 'abcdefghijklmnop', token: 't', ops: [op] }),
    ).toEqual({ kind: 'invalid' });
  });
});

describe('module:loan create', () => {
  it('works the contract out as the editor does, with the repayment rule', () => {
    const [step] = steps([create({ paidPeriods: 3, collectFromAccountId: 'myr', group: 'Bank' })]);
    const quote = computeLoanQuote({
      principal: 12000,
      annualRatePercent: null,
      termMonths: 12,
      paidPeriods: 3,
      startDate: '2026-06-15',
      totalRepayable: 13200,
      instalment: 1100,
    });
    expect(payloadOf(step)).toEqual({
      input: expect.objectContaining({
        name: 'Car',
        type: 'loan',
        accountGroup: 'Bank',
        cardDesign: null,
        startingBalance: quote?.openingBalance,
        loanInterestModel: 'flat',
        loanOriginalPrincipal: 12000,
        loanMonthlyPayment: 1100,
        loanTotalRepayable: 13200,
        loanTermMonths: 12,
        loanPaymentDay: 15,
        loanStartDate: '2026-06-15',
        loanLedgerAnchorDate: '2026-09-15',
        loanCountAsExpense: true,
        // Bills, the editor's default, since none was picked.
        loanPaymentCategoryId: 'bills',
      }),
      rule: {
        name: 'Car repayment',
        type: 'transfer',
        amount: 1100,
        currency: 'MYR',
        fromAccountId: 'myr',
        countsAsExpense: true,
        categoryId: 'bills',
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        nextRunDate: '2026-11-15',
        endDate: '2027-06-15',
      },
      analytics: expect.any(Object),
    });
  });

  it('takes the total or a rounded instalment as typed', () => {
    const byTotal = payloadOf(steps([create({ driver: 'total', rate: 99, total: 13200 })])[0]);
    expect(byTotal.input).toMatchObject({ loanMonthlyPayment: 1100, loanTotalRepayable: 13200 });
    const rounded = payloadOf(steps([create({ instalment: 1101 })])[0]);
    expect(rounded.input).toMatchObject({ loanMonthlyPayment: 1101, loanTotalRepayable: 13200 });
    expect(payloadOf(steps([create()])[0]).rule).toBeNull();
  });

  it.each([
    ['no name', { name: ' ' }],
    ['no term', { termMonths: null }],
    ['a term past 480 months', { termMonths: 481 }],
    ['every instalment already paid', { paidPeriods: 12 }],
    ['a total that never repays the amount', { driver: 'total', total: 100 }],
    ['a collect account in another currency', { collectFromAccountId: 'usd' }],
    ['a credit card to collect from', { collectFromAccountId: 'card' }],
    ['a group that is gone', { group: 'Old' }],
    ['a currency the app does not offer', { currency: 'EUR' }],
  ])('refuses %s', (_name, patch) => {
    expect(refusal([create(patch)])).toEqual({ error: 'invalid' });
  });

  it('holds a free plan to one active loan and its account limit', () => {
    expect(refusal([create(), create()], { isPro: false })).toEqual({
      error: 'pro_required',
      feature: 'loans',
    });
    expect(refusal([create()], { isPro: false, ...withCar() })).toEqual({
      error: 'pro_required',
      feature: 'loans',
    });
    expect(refusal([create()], { isPro: false, ...withCar({ loanArchivedAt: AT }) })).toBeNull();
    const six = Array.from({ length: 6 }, (_, i) => account(`a${i}`));
    expect(refusal([create()], { isPro: false, accounts: six })).toEqual({
      error: 'pro_required',
      feature: 'accounts',
    });
  });
});

describe('module:loan update', () => {
  it('saves an untouched form as the contract it already is', () => {
    const [step] = steps([update({ name: 'My car' })], withCar());
    const payload = payloadOf(step);
    expect(payload.updates).toMatchObject({
      name: 'My car',
      currency: 'MYR',
      cardDesign: 'genre/plain',
      loanMonthlyPayment: 1100,
      loanTotalRepayable: 13200,
      loanTermMonths: 12,
    });
    expect(payload.updates).not.toHaveProperty('loanRateChanges');
    expect(payload.rules).toEqual([]);
    expect(payload.adjustment).toBeUndefined();
  });

  it('refuses a stale loan, or a goal under its id', () => {
    expect(refusal([update({}, { at: 'old' })], withCar())).toEqual({ error: 'conflict' });
    expect(refusal([update({}, { id: 'myr' })], withCar())).toEqual({ error: 'conflict' });
  });

  it('keeps the repayment rule in step with the contract and its reporting', () => {
    const data = { ...withCar(), recurringRules: [repayment()] };
    const [step] = steps(
      [update({ total: 14400, countAsExpense: false, collectFromAccountId: 'myr' })],
      data,
    );
    expect(payloadOf(step).rules).toEqual([
      { op: 'update', id: 'r1', input: { amount: 1200 } },
      { op: 'update', id: 'r1', input: { countsAsExpense: false, categoryId: null } },
    ]);
    // Cleared, the rule goes; a new account re-points it.
    expect(payloadOf(steps([update({ collectFromAccountId: null })], data)[0]).rules).toEqual([
      { op: 'delete', id: 'r1' },
    ]);
    const other = { ...data, accounts: [...data.accounts, account('cash')] };
    expect(payloadOf(steps([update({ collectFromAccountId: 'cash' })], other)[0]).rules).toEqual([
      { op: 'update', id: 'r1', input: { fromAccountId: 'cash' } },
    ]);
  });

  it('keeps its repayment rule to itself within a batch', () => {
    const data = { ...withCar(), recurringRules: [repayment()] };
    // Two changes to one rule from the loan's own save are one claim.
    const loanOp = update({ total: 14400, countAsExpense: false, collectFromAccountId: 'myr' });
    expect(steps([loanOp], data)).toHaveLength(1);
    const ruleOp = { entity: 'recurring', op: 'delete', id: 'r1', at: AT };
    expect(refusal([loanOp, ruleOp], data)).toEqual({ error: 'invalid' });
    expect(refusal([ruleOp, loanOp], data)).toEqual({ error: 'invalid' });
  });

  it('rebuilds a deleted repayment rule from the loan', () => {
    const [step] = steps([update({ collectFromAccountId: 'myr' })], withCar());
    expect(payloadOf(step).rules).toEqual([
      {
        op: 'create',
        input: expect.objectContaining({
          toAccountId: 'car',
          amount: 1100,
          nextRunDate: '2026-11-15',
          endDate: '2027-06-15',
        }),
      },
    ]);
  });

  it('leaves alone a rule the editor cannot show', () => {
    const data = { ...withCar(), recurringRules: [repayment({ fromAccountId: 'usd' })] };
    expect(payloadOf(steps([update({ countAsExpense: true })], data)[0]).rules).toEqual([]);
    expect(refusal([update({ collectFromAccountId: null })], data)).toEqual({ error: 'invalid' });
  });

  it('records a changed balance the way the user picks', () => {
    expect(
      payloadOf(steps([update({}, { balance: 12000, balanceRecord: 'flow' })], withCar())[0])
        .adjustment,
    ).toEqual({ type: 'income', amount: 1200, currency: 'MYR' });
    expect(
      payloadOf(steps([update({}, { balance: 12000, balanceRecord: 'difference' })], withCar())[0])
        .adjustment,
    ).toEqual({ type: 'balance_adjustment', amount: -1200, currency: 'MYR' });
    expect(refusal([update({}, { balance: 12000 })], withCar())).toEqual({ error: 'invalid' });
  });

  it('re-denominates on a new currency, leaving the rules to the recurring editor', () => {
    const data = { ...withCar(), recurringRules: [repayment()] };
    const [step] = steps([update({ currency: 'USD', principal: 3000, total: 3300 })], data);
    expect(payloadOf(step)).toMatchObject({ currency: 'USD', rules: [] });
    expect(payloadOf(step).updates).not.toHaveProperty('currency');
    expect(
      refusal([update({ currency: 'USD' }, { balance: 1, balanceRecord: 'flow' })], data),
    ).toEqual({ error: 'invalid' });
  });

  it('asks when a reducing balance loan gets a new rate', () => {
    const reducing = withCar({
      loanInterestModel: 'reducing',
      loanTotalRepayable: 12600,
      loanMonthlyPayment: 1050,
    });
    const changed = { model: 'reducing', total: 12800 };
    expect(refusal([update(changed)], reducing)).toEqual({ error: 'invalid' });
    const fromStart = payloadOf(steps([update(changed, { rateApply: 'start' })], reducing)[0]);
    expect(fromStart.updates).toMatchObject({ loanRateChanges: null });
    const fromToday = payloadOf(steps([update(changed, { rateApply: 'today' })], reducing)[0]);
    const history = (fromToday.updates as { loanRateChanges: { from: string }[] }).loanRateChanges;
    expect(history.map((change) => change.from)).toEqual(['2026-06-15', '2026-10-20']);
    // The same rate asks nothing.
    expect(refusal([update({ model: 'reducing', total: 12600 })], reducing)).toBeNull();
  });
});

describe('module:loan archive and delete', () => {
  it('archives, unarchives and deletes', () => {
    const op = (patch: Record<string, unknown>) => ({
      entity: 'module:loan',
      id: 'car',
      at: AT,
      ...patch,
    });
    expect(steps([op({ op: 'archive', archived: true })], withCar())).toEqual([
      {
        kind: 'module',
        entity: 'module:loan',
        action: 'archive',
        payload: { id: 'car', archived: true },
      },
    ]);
    expect(steps([op({ op: 'delete' })], withCar())).toEqual([
      { kind: 'module', entity: 'module:loan', action: 'delete', payload: { id: 'car' } },
    ]);
    expect(refusal([op({ op: 'delete' })])).toEqual({ error: 'conflict' });
  });
});

describe('module:loan names, logos and groups', () => {
  it('keeps an uploaded logo the loan has, and refuses a new one', () => {
    const custom = withCar({ logoId: 'custom:account-logos/a.png' });
    expect(refusal([update({ logoId: 'custom:account-logos/a.png' })], custom)).toBeNull();
    expect(refusal([update({ logoId: 'custom:account-logos/b.png' })], custom)).toEqual({
      error: 'invalid',
    });
    expect(refusal([create({ logoId: 'custom:account-logos/a.png' })])).toEqual({
      error: 'invalid',
    });
  });

  it('holds a changed name to 200 characters, but keeps a longer one the loan has', () => {
    expect(refusal([create({ name: 'x'.repeat(200) })])).toBeNull();
    expect(refusal([create({ name: 'x'.repeat(201) })])).toEqual({ error: 'invalid' });
    const long = withCar({ name: 'y'.repeat(300) });
    expect(refusal([update({ name: 'y'.repeat(300) })], long)).toBeNull();
  });

  it('ungroups a loan on a group name with no record, as the app saves it', () => {
    const orphan = withCar({ accountGroup: 'Old' });
    const [step] = steps([update({ group: 'Old' })], orphan);
    expect(payloadOf(step).updates).toMatchObject({ accountGroup: null });
    expect(refusal([update({ group: 'Other' })], orphan)).toEqual({ error: 'invalid' });
  });

  it('reports LOAN_CREATED with the screen’s properties', () => {
    expect(payloadOf(steps([create({ collectFromAccountId: 'myr' })])[0]).analytics).toEqual({
      interestModel: 'flat',
      hasRate: true,
      hasCollectAccount: true,
      countsAsExpense: true,
      currency: 'MYR',
    });
  });
});

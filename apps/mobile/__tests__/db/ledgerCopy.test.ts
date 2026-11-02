import { lastLoanRestOnOrBefore } from '~/features/loans/lib/loanMath';
import {
  copiedRuleNextRun,
  LEDGER_COPY_TABLES,
  type LedgerCopyPart,
  ledgerPartsCopySpecs,
  planLedgerCopy,
  withCopyNeeds,
} from '~/lib/db/ledgerCopy';

type Row = Record<string, unknown>;

/** A fake source ledger: two ledgers' rows, so the plan must pick only one's. */
function source(): Record<string, Row[]> {
  return {
    account_groups: [{ id: 'g1', ledger_id: 'src', name: 'Banks' }],
    categories: [
      { id: 'c1', ledger_id: 'src', parent_id: null },
      { id: 'c2', ledger_id: 'src', parent_id: 'c1' },
    ],
    accounts: [
      {
        id: 'a1',
        ledger_id: 'src',
        loan_payment_category_id: null,
        auto_log_identifiers_json: '["1234"]',
      },
      { id: 'a2', ledger_id: 'src', loan_payment_category_id: 'c1' },
    ],
    transactions: [
      {
        id: 't1',
        ledger_id: 'src',
        account_id: 'a1',
        category_id: 'c2',
        reimbursement_transaction_id: 't2',
        updated_at: 'old',
      },
      { id: 't2', ledger_id: 'src', account_id: 'a2', reimbursement_of_id: 't1' },
      // Points outside the copy: must become null, never the source's id.
      { id: 't3', ledger_id: 'src', account_id: 'gone', category_id: null },
    ],
    recurring_rules: [{ id: 'r1', ledger_id: 'src', account_id: 'a1', category_id: 'c1' }],
    transaction_splits: [
      { id: 's1', transaction_id: 't1', payback_account_id: 'a2', paid_transaction_id: 't2' },
      { id: 's-other', transaction_id: 'another-ledger-tx' },
    ],
    albums: [{ id: 'al1', ledger_id: 'src' }],
    album_transactions: [
      { id: 'at1', album_id: 'al1', transaction_id: 't1' },
      // Its entry was deleted (not copied): a NOT NULL join is left out.
      { id: 'at-gone', album_id: 'al1', transaction_id: 'deleted-tx' },
    ],
    items: [],
    budget_templates: [{ id: 'bt1', ledger_id: 'src' }],
    budget_template_categories: [{ id: 'btc1', template_id: 'bt1', category_id: 'c1' }],
    monthly_budgets: [{ id: 'mb1', ledger_id: 'src', template_id: 'bt1' }],
    monthly_budget_categories: [{ id: 'mbc1', budget_id: 'mb1', category_id: 'c2' }],
    receipt_splits: [{ id: 'rs1', transaction_id: 't1' }],
    receipt_split_items: [{ id: 'rsi1', receipt_split_id: 'rs1' }],
    receipt_split_item_shares: [{ id: 'rss1', receipt_split_id: 'rs1', item_id: 'rsi1' }],
  };
}

function plan() {
  const rows = source();
  let n = 0;
  const result = planLedgerCopy(
    (spec) => rows[spec.table] ?? [],
    'dst',
    () => `new${++n}`,
    'now',
  );
  const byTable = Object.fromEntries(result.map(({ table, rows: r }) => [table, r]));
  // The copy's id for a source id, by matching position in the source table.
  const idOf = (table: string, sourceId: string) => {
    const index = rows[table].findIndex((row) => row.id === sourceId);
    return byTable[table][index]?.id;
  };
  return { byTable, idOf };
}

describe('planLedgerCopy', () => {
  it('covers every table in order and gives every row a new id in the new ledger', () => {
    const { byTable } = plan();
    expect(Object.keys(byTable)).toEqual(LEDGER_COPY_TABLES.map((spec) => spec.table));
    const all = Object.values(byTable).flat();
    const ids = all.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of all) expect(String(row.id)).toMatch(/^new\d+$/);
    for (const row of [...byTable.accounts, ...byTable.transactions]) {
      expect(row.ledger_id).toBe('dst');
      expect(row.updated_at).toBe('now');
    }
  });

  it('points references at the copies, including self-references', () => {
    const { byTable, idOf } = plan();
    const [t1, t2, t3] = byTable.transactions;
    expect(t1.account_id).toBe(idOf('accounts', 'a1'));
    expect(t1.category_id).toBe(idOf('categories', 'c2'));
    expect(t1.reimbursement_transaction_id).toBe(t2.id);
    expect(t2.reimbursement_of_id).toBe(t1.id);
    expect(t3.account_id).toBeNull();
    expect(byTable.categories[1].parent_id).toBe(idOf('categories', 'c1'));
    expect(byTable.accounts[1].loan_payment_category_id).toBe(idOf('categories', 'c1'));
    expect(byTable.monthly_budgets[0].template_id).toBe(idOf('budget_templates', 'bt1'));
    expect(byTable.receipt_split_item_shares[0]).toMatchObject({
      receipt_split_id: idOf('receipt_splits', 'rs1'),
      item_id: idOf('receipt_split_items', 'rsi1'),
    });
  });

  it('copies only the children of copied parents, without a ledger_id of their own', () => {
    const { byTable, idOf } = plan();
    expect(byTable.transaction_splits).toHaveLength(1);
    expect(byTable.transaction_splits[0]).toMatchObject({
      transaction_id: idOf('transactions', 't1'),
      payback_account_id: idOf('accounts', 'a2'),
      paid_transaction_id: idOf('transactions', 't2'),
    });
    expect(byTable.transaction_splits[0]).not.toHaveProperty('ledger_id');
    expect(byTable.album_transactions).toHaveLength(1);
    expect(byTable.album_transactions[0].transaction_id).toBe(idOf('transactions', 't1'));
    expect(byTable.accounts[0].auto_log_identifiers_json).toBeNull();
  });
});

const NOW = '2026-11-02T09:00:00.000Z';

/** A source with one of every kind of row a parts copy can bring. */
function partsSource(): Record<string, Row[]> {
  const account = (id: string, type: string, extra: Row = {}) => ({
    id,
    ledger_id: 'src',
    type,
    currency: 'MYR',
    starting_balance: 500,
    created_at: 'old',
    ...extra,
  });
  return {
    account_groups: [{ id: 'g1', ledger_id: 'src', name: 'Banks' }],
    categories: [{ id: 'food', ledger_id: 'src', parent_id: null }],
    accounts: [
      account('cash', 'debit', { auto_log_identifiers_json: '["1234"]' }),
      account('usd-card', 'credit', { currency: 'USD' }),
      account('trip', 'goal', { goal_achieved_at: 'then' }),
      account('old-goal', 'goal', { goal_archived_at: 'then' }),
      account('car', 'loan', {
        loan_paid_off_at: 'then',
        loan_payment_category_id: 'food',
        // Rests on the 15th: the copy keeps them there.
        loan_ledger_anchor_date: '2026-06-15',
      }),
      account('settled', 'loan'),
    ],
    recurring_rules: [
      {
        id: 'rent',
        ledger_id: 'src',
        account_id: 'cash',
        category_id: 'food',
        recurrence_pattern: 'monthly',
        recurrence_interval: 1,
        // Behind: the source has not been opened since October.
        next_run_date: '2026-10-01T00:00:00.000Z',
        end_date: null,
      },
      {
        id: 'save',
        ledger_id: 'src',
        from_account_id: 'cash',
        to_account_id: 'trip',
        recurrence_pattern: 'weekly',
        recurrence_interval: 1,
        next_run_date: '2026-11-09T00:00:00.000Z',
        end_date: null,
      },
      {
        id: 'ended',
        ledger_id: 'src',
        account_id: 'cash',
        recurrence_pattern: 'monthly',
        recurrence_interval: 1,
        next_run_date: '2026-10-01T00:00:00.000Z',
        end_date: '2026-10-15',
      },
    ],
    budget_templates: [{ id: 'bt1', ledger_id: 'src', is_default: 1 }],
    budget_template_categories: [{ id: 'btc1', template_id: 'bt1', category_id: 'food' }],
    items: [{ id: 'phone', ledger_id: 'src', purchase_price: 999 }],
    albums: [{ id: 'japan', ledger_id: 'src', is_active: 1 }],
  };
}

function planParts(parts: LedgerCopyPart[]) {
  const rows = partsSource();
  let n = 0;
  const result = planLedgerCopy(
    (spec) => rows[spec.table] ?? [],
    'dst',
    () => `new${++n}`,
    NOW,
    ledgerPartsCopySpecs({
      parts: new Set(parts),
      currency: { from: 'MYR', to: 'SGD' },
      loanBalances: new Map([
        ['car', 12000],
        ['settled', 0],
      ]),
      nowIso: NOW,
      today: '2026-11-02',
    }),
  );
  return Object.fromEntries(result.map(({ table, rows: r }) => [table, r]));
}

describe('ledgerPartsCopySpecs', () => {
  it('brings what a part needs, whoever asks for it', () => {
    expect([...withCopyNeeds(['recurring', 'items'])].sort()).toEqual([
      'accounts',
      'categories',
      'items',
      'recurring',
    ]);
    // Asked for alone, a budget still gets its category lines.
    expect(Object.keys(planParts(['budgets']))).toEqual([
      'categories',
      'budget_templates',
      'budget_template_categories',
    ]);
  });

  it('copies only the chosen parts', () => {
    expect(Object.keys(planParts(['items']))).toEqual(['items']);
    expect(Object.keys(planParts(['budgets', 'categories']))).toEqual([
      'categories',
      'budget_templates',
      'budget_template_categories',
    ]);
  });

  it('starts everyday accounts at zero, in the new currency when they were in the old one', () => {
    const { accounts, account_groups } = planParts(['accounts']);
    expect(account_groups).toHaveLength(1);
    expect(accounts.map((row) => [row.type, row.currency, row.starting_balance])).toEqual([
      ['debit', 'SGD', 0],
      ['credit', 'USD', 0],
    ]);
    expect(accounts[0]).toMatchObject({
      ledger_id: 'dst',
      created_at: NOW,
      auto_log_identifiers_json: null,
    });
  });

  it('copies live goals at zero and loans at what they still owe, from their last rest', () => {
    const { accounts } = planParts(['goals', 'loans']);
    expect(accounts.map((row) => row.type)).toEqual(['goal', 'loan']);
    const [goal, loan] = accounts;
    expect(goal).toMatchObject({ starting_balance: 0, goal_achieved_at: null, currency: 'MYR' });
    expect(loan).toMatchObject({
      starting_balance: 12000,
      loan_ledger_anchor_date: '2026-10-15',
      loan_paid_off_at: null,
      // Its category stayed behind.
      loan_payment_category_id: null,
    });
  });

  it('brings a rule only with every account it names, from its next date after now', () => {
    const withoutGoals = planParts(['recurring', 'accounts', 'categories']).recurring_rules;
    expect(withoutGoals).toHaveLength(1);
    expect(withoutGoals[0].next_run_date).toBe('2026-12-01T00:00:00.000Z');
    const withGoals = planParts(['recurring', 'accounts', 'categories', 'goals']).recurring_rules;
    expect(withGoals.map((rule) => rule.next_run_date)).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2026-11-09T00:00:00.000Z',
    ]);
  });

  it('copies budget templates with their lines, and albums empty and inactive', () => {
    const copy = planParts(['budgets', 'categories', 'albums']);
    expect(copy.budget_templates[0]).toMatchObject({ is_default: 1, ledger_id: 'dst' });
    expect(copy.budget_template_categories[0]).toMatchObject({
      template_id: copy.budget_templates[0].id,
      category_id: copy.categories[0].id,
    });
    expect(copy.albums[0]).toMatchObject({ is_active: 0, ledger_id: 'dst' });
    expect(copy).not.toHaveProperty('album_transactions');
  });
});

describe('copiedRuleNextRun', () => {
  const rule = {
    nextRunDate: '2026-10-31T00:00:00.000Z',
    recurrencePattern: 'monthly' as const,
    recurrenceInterval: 1,
    endDate: null,
  };

  it('keeps a future run date, and moves a past one to the first after now', () => {
    expect(copiedRuleNextRun({ ...rule, nextRunDate: '2026-12-25T00:00:00.000Z' }, NOW)).toBe(
      '2026-12-25T00:00:00.000Z',
    );
    expect(copiedRuleNextRun(rule, NOW)).toBe('2026-11-30T00:00:00.000Z');
  });

  it('has nothing to run for a past one-off or a rule past its end', () => {
    expect(copiedRuleNextRun({ ...rule, recurrencePattern: 'none' }, NOW)).toBeNull();
    expect(copiedRuleNextRun({ ...rule, endDate: '2026-11-15' }, NOW)).toBeNull();
  });
});

describe('lastLoanRestOnOrBefore', () => {
  it('moves the anchor on by whole months, up to today', () => {
    expect(lastLoanRestOnOrBefore('2026-06-15', '2026-11-02')).toBe('2026-10-15');
    expect(lastLoanRestOnOrBefore('2026-06-15', '2026-11-15')).toBe('2026-11-15');
    // A 31st rests on the last day of a shorter month.
    expect(lastLoanRestOnOrBefore('2026-01-31', '2026-03-01')).toBe('2026-02-28');
  });

  it('keeps an anchor that is today or later', () => {
    expect(lastLoanRestOnOrBefore('2026-11-02', '2026-11-02')).toBe('2026-11-02');
    expect(lastLoanRestOnOrBefore('2026-12-01', '2026-11-02')).toBe('2026-12-01');
  });
});

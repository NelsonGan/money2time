import { LEDGER_COPY_TABLES, planLedgerCopy } from '~/lib/db/ledgerCopy';

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

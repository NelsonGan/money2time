import { filterBackupLedgers, restoreLedgerChoices } from '~/utils/backupLedgerPolicy';

const shared = {
  ledgerId: 'family',
  shareId: 'share-family',
  role: 'owner' as const,
  name: 'Family',
  active: true,
};
const tables = {
  ledgers: [{ id: 'default' }, { id: 'family', name: 'Family' }],
  accounts: [
    { id: 'cash', ledger_id: 'default' },
    { id: 'bank', ledger_id: 'family' },
  ],
  transactions: [{ id: 'lunch', ledger_id: 'family' }],
  transaction_splits: [{ id: 'split', transaction_id: 'lunch' }],
  receipt_splits: [{ id: 'receipt', transaction_id: 'lunch' }],
  receipt_split_items: [{ id: 'item', receipt_split_id: 'receipt' }],
  receipt_split_item_shares: [{ id: 'person', receipt_split_id: 'receipt' }],
  settings: [{ id: 'settings' }],
};

describe('backup ledger policy', () => {
  it('excludes a ledger and all its descendants, without mutating the source', () => {
    const filtered = filterBackupLedgers(tables, ['family']);
    expect(filtered.ledgers).toEqual([{ id: 'default' }]);
    expect(filtered.accounts).toEqual([{ id: 'cash', ledger_id: 'default' }]);
    for (const table of [
      'transactions',
      'transaction_splits',
      'receipt_splits',
      'receipt_split_items',
      'receipt_split_item_shares',
    ]) {
      expect(filtered[table as keyof typeof filtered]).toEqual([]);
    }
    expect(filtered.settings).toEqual(tables.settings);
    expect(tables.accounts).toHaveLength(2);
  });

  it('offers an owned live ledger but never selects it by default', () => {
    expect(restoreLedgerChoices({ tables, sharedLedgers: [shared] }, [shared])).toEqual([
      { ledgerId: 'family', shareId: 'share-family', name: 'Family', canRestore: true },
    ]);
  });

  it.each([
    ['signed out', []],
    ['now a member', [{ ...shared, role: 'member' as const }]],
    ['paused', [{ ...shared, active: false }]],
    ['different live share', [{ ...shared, shareId: 'new-share' }]],
  ])('does not authorize a backup through its historical ownership: %s', (_name, current) => {
    expect(restoreLedgerChoices({ tables, sharedLedgers: [shared] }, current)[0].canRestore).toBe(
      false,
    );
  });

  it('recognizes current ownership in legacy backups', () => {
    expect(restoreLedgerChoices({ tables }, [shared])[0].canRestore).toBe(true);
  });

  it('does not offer shared ledgers absent or deleted in the backup', () => {
    expect(restoreLedgerChoices({ tables: { ledgers: [] } }, [shared])).toEqual([]);
    expect(
      restoreLedgerChoices({ tables: { ledgers: [{ id: 'family', deleted_at: 'yesterday' }] } }, [
        shared,
      ]),
    ).toEqual([]);
  });

  it('filters album joins through both referenced records', () => {
    expect(
      filterBackupLedgers(
        {
          ...tables,
          albums: [{ id: 'private', ledger_id: 'default' }],
          album_transactions: [{ id: 'join', album_id: 'private', transaction_id: 'lunch' }],
        },
        ['family'],
      ).album_transactions,
    ).toEqual([]);
  });

  it('filters budgets, albums, accounts, categories and recurring rules with their ledger', () => {
    const extra = {
      ...tables,
      account_groups: [{ id: 'group', ledger_id: 'family' }],
      categories: [{ id: 'category', ledger_id: 'family' }],
      recurring_rules: [{ id: 'rule', ledger_id: 'family' }],
      albums: [{ id: 'album', ledger_id: 'family' }],
      album_transactions: [{ id: 'join', album_id: 'album', transaction_id: 'lunch' }],
      budget_templates: [{ id: 'template', ledger_id: 'family' }],
      budget_template_categories: [{ id: 'line', template_id: 'template' }],
      monthly_budgets: [{ id: 'budget', ledger_id: 'family' }],
      monthly_budget_categories: [{ id: 'month-line', budget_id: 'budget' }],
      items: [{ id: 'owned-item', ledger_id: 'family' }],
    };
    const filtered = filterBackupLedgers(extra, ['family']);
    for (const [table, rows] of Object.entries(filtered))
      if (!['ledgers', 'accounts', 'settings'].includes(table)) expect(rows).toEqual([]);
  });
});

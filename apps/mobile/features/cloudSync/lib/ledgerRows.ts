// Which synced rows belong to a ledger, for shared ledgers: their rows sync
// with the ledger's own cloud database instead of the user's. Pure, shared by
// the engine and the tests.
//
// Root tables carry `ledger_id`. Child tables carry no ledger of their own and
// follow their parent row (as lib/repositories/ledgersRepository.ts deletes
// them), and the `ledgers` row is the ledger itself. Every other synced table
// (settings, wage months, exchange rates) is the user's own.

import type { SyncTable } from './syncTables';

export const PERSONAL_CHANNEL = 'personal';

/** Synced tables with a `ledger_id` column (`LEDGER_TABLES` minus the unsynced captures). */
export const LEDGER_ROOT_SYNC_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>([
  'account_groups',
  'accounts',
  'categories',
  'recurring_rules',
  'transactions',
  'albums',
  'items',
  'budget_templates',
  'monthly_budgets',
]);

/** Child table → [its parent-id column, the parent table]. */
export const LEDGER_CHILD_SYNC_TABLES: Readonly<Partial<Record<SyncTable, [string, SyncTable]>>> = {
  transaction_splits: ['transaction_id', 'transactions'],
  receipt_splits: ['transaction_id', 'transactions'],
  album_transactions: ['album_id', 'albums'],
  budget_template_categories: ['template_id', 'budget_templates'],
  monthly_budget_categories: ['budget_id', 'monthly_budgets'],
  receipt_split_items: ['receipt_split_id', 'receipt_splits'],
  receipt_split_item_shares: ['receipt_split_id', 'receipt_splits'],
};

/** Whether rows of `table` can belong to a ledger (and so to a shared one). */
export function isLedgerScoped(table: string): boolean {
  return (
    table === 'ledgers' ||
    LEDGER_ROOT_SYNC_TABLES.has(table as SyncTable) ||
    table in LEDGER_CHILD_SYNC_TABLES
  );
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * SQL condition, on `table`'s rows, for "belongs to one of `ledgerIds`".
 * Ledger ids are inlined (subqueries nest, so bound parameters would need
 * counting); anything but a plain id is refused.
 */
export function inLedgersSql(table: string, ledgerIds: readonly string[]): string {
  const ids = ledgerIds.filter((id) => SAFE_ID.test(id));
  if (!ids.length) return '0';
  const list = ids.map((id) => `'${id}'`).join(', ');
  if (table === 'ledgers') return `id IN (${list})`;
  if (LEDGER_ROOT_SYNC_TABLES.has(table as SyncTable)) return `ledger_id IN (${list})`;
  const child = LEDGER_CHILD_SYNC_TABLES[table as SyncTable];
  if (child) {
    const [column, parent] = child;
    return `${column} IN (SELECT id FROM "${parent}" WHERE ${inLedgersSql(parent, ids)})`;
  }
  return '0';
}

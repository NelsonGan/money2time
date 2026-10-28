import { type AnyColumn, eq, type SQL } from 'drizzle-orm';

/**
 * The ledger open on this phone. Every repository reads it to scope its
 * queries: reads of a ledger table filter on `ledger_id`, and inserts stamp it.
 *
 * It lives at module level, like the database connection itself, so the
 * repositories need no extra argument. `AppProvider` sets it from
 * `settings.active_ledger_id` before its first load and on every switch, and
 * nothing else may write it.
 */

export const DEFAULT_LEDGER_ID = 'default';

/**
 * Tables whose rows belong to one ledger (migration 075). Their child tables
 * (splits, receipt splits, album joins, budget lines) follow the parent row.
 * Deleting a ledger retires every row in these tables.
 */
export const LEDGER_TABLES = [
  'accounts',
  'account_groups',
  'categories',
  'transactions',
  'recurring_rules',
  'albums',
  'items',
  'budget_templates',
  'monthly_budgets',
  'auto_log_captures',
] as const;

let activeLedgerId: string = DEFAULT_LEDGER_ID;

export function getActiveLedgerId(): string {
  return activeLedgerId;
}

export function setActiveLedgerId(ledgerId: string | null | undefined): void {
  activeLedgerId = ledgerId || DEFAULT_LEDGER_ID;
}

/**
 * Run `work` with another ledger open, then put the previous one back, even on
 * a throw. Used to seed or copy into a ledger that is being created. `work`
 * must be synchronous: an await inside would leak the scope to other code.
 */
export function withLedgerScope<T>(ledgerId: string, work: () => T): T {
  const previous = activeLedgerId;
  activeLedgerId = ledgerId;
  try {
    return work();
  } finally {
    activeLedgerId = previous;
  }
}

/** `ledger_id = <open ledger>` for a Drizzle query on a ledger table. */
export function inActiveLedger(table: { ledgerId: AnyColumn }): SQL {
  return eq(table.ledgerId, activeLedgerId);
}

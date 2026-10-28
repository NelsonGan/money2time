import {
  inLedgersSql,
  isLedgerScoped,
  LEDGER_CHILD_SYNC_TABLES,
  LEDGER_ROOT_SYNC_TABLES,
} from '~/features/cloudSync/lib/ledgerRows';
import { SYNC_TABLES } from '~/features/cloudSync/lib/syncTables';
import { LEDGER_TABLES } from '~/lib/db/ledgerScope';

describe('ledger rows for shared ledgers', () => {
  it('roots are the synced ledger tables', () => {
    const synced = LEDGER_TABLES.filter((table) =>
      (SYNC_TABLES as readonly string[]).includes(table),
    );
    expect([...LEDGER_ROOT_SYNC_TABLES].sort()).toEqual([...synced].sort());
  });

  it('every child points at a synced parent that comes before it', () => {
    for (const [child, link] of Object.entries(LEDGER_CHILD_SYNC_TABLES)) {
      const [, parent] = link!;
      expect(SYNC_TABLES.indexOf(parent)).toBeLessThan(
        SYNC_TABLES.indexOf(child as (typeof SYNC_TABLES)[number]),
      );
      expect(isLedgerScoped(parent)).toBe(true);
    }
  });

  it('keeps the user’s own tables out of shared ledgers', () => {
    expect(isLedgerScoped('settings')).toBe(false);
    expect(isLedgerScoped('exchange_rates')).toBe(false);
    expect(isLedgerScoped('monthly_wage_settings')).toBe(false);
    expect(isLedgerScoped('ledgers')).toBe(true);
    expect(inLedgersSql('settings', ['a'])).toBe('0');
  });

  it('builds the membership condition through parents', () => {
    expect(inLedgersSql('ledgers', ['L1'])).toBe(`id IN ('L1')`);
    expect(inLedgersSql('transactions', ['L1', 'L2'])).toBe(`ledger_id IN ('L1', 'L2')`);
    expect(inLedgersSql('receipt_split_items', ['L1'])).toBe(
      `receipt_split_id IN (SELECT id FROM "receipt_splits" WHERE transaction_id IN (SELECT id FROM "transactions" WHERE ledger_id IN ('L1')))`,
    );
  });

  it('never inlines anything but a plain id', () => {
    expect(inLedgersSql('transactions', [`x') OR 1=1 --`])).toBe('0');
    expect(inLedgersSql('transactions', [])).toBe('0');
  });
});

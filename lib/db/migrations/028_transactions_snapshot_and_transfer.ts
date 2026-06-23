import type { DbMigration } from './types';

/**
 * Adds the reporting-currency snapshot columns (frozen at write time so history
 * never drifts when FX rates move) plus `to_amount` for cross-currency transfers.
 *
 * Backfill: every existing transaction predates multi-currency, so it is
 * implicitly denominated in the current single currency. Snapshot it exactly
 * (rate = 1, reporting amount = amount) using the active reporting currency.
 */
export const migration028TransactionsSnapshotAndTransfer: DbMigration = {
  version: 28,
  name: '028_transactions_snapshot_and_transfer',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(transactions);');
    const existing = new Set(columns.map((c) => c.name));

    if (!existing.has('reporting_currency')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN reporting_currency TEXT;');
    }
    if (!existing.has('reporting_amount')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN reporting_amount REAL;');
    }
    if (!existing.has('fx_rate')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN fx_rate REAL;');
    }
    if (!existing.has('to_amount')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN to_amount REAL;');
    }

    const settingsRow = db.getFirstSync<{ currency_code: string }>(
      "SELECT currency_code FROM settings WHERE id = 'primary';",
    );
    const reportingCurrency = (settingsRow?.currency_code ?? 'USD').replace(/'/g, "''");

    // Snapshot all non-transfer rows that have no snapshot yet.
    db.execSync(
      `UPDATE transactions
       SET reporting_currency = '${reportingCurrency}',
           reporting_amount = amount,
           fx_rate = 1
       WHERE reporting_currency IS NULL AND type != 'transfer';`,
    );
  },
};

export default migration028TransactionsSnapshotAndTransfer;

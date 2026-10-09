import type { SQLiteDatabase } from 'expo-sqlite';

function withWalletDefault(json: string | null, walletId: string | null): string | null {
  if (!walletId) return json;
  try {
    const prefs: unknown = json === null ? {} : JSON.parse(json);
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return json;
    return JSON.stringify({ ...prefs, defaultAccountId: walletId });
  } catch {
    // Malformed preferences already fall back at read time. Preserve their
    // original contents and never let them prevent an upgrade.
    return json;
  }
}

/**
 * Retire the legacy mode flag without touching financial data. The old wallet
 * remains an ordinary account with the same ID, name, currency, and balance.
 * Keep it as the default for new entries, which previously always used it.
 *
 * Called inside the migration / backup-restore transaction. Restore must run
 * this too: JSON backups replace settings without rolling back user_version.
 * The user_mode guard makes replay a no-op and preserves later default changes.
 */
export function retireSimpleMode(db: SQLiteDatabase): void {
  const rows = db.getAllSync<{ id: string; quick_entry_prefs_json: string | null }>(
    "SELECT id, quick_entry_prefs_json FROM settings WHERE user_mode = 'simple'",
  );
  if (rows.length === 0) return;

  const walletId =
    db.getFirstSync<{ id: string }>(
      `SELECT id FROM accounts WHERE name = 'Simple Wallet' AND deleted_at IS NULL
     ORDER BY sort_order, id LIMIT 1`,
    )?.id ?? null;

  for (const row of rows) {
    db.runSync(
      "UPDATE settings SET user_mode = 'power', quick_entry_prefs_json = ? WHERE id = ? AND user_mode = 'simple'",
      withWalletDefault(row.quick_entry_prefs_json, walletId),
      row.id,
    );
  }
}

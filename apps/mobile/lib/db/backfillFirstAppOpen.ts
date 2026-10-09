import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Lower bound for a backfilled `first_app_open`. Users who joined before the app
 * tracked this predate reliable timing, so their earliest transaction is clamped
 * up to this date rather than trusting a very old (possibly imported) date.
 */
export const FIRST_APP_OPEN_FLOOR_ISO = '2026-03-01T00:00:00.000Z';

interface BackfillOptions {
  /** Injectable clock for tests; defaults to the current time. */
  now?: Date;
}

/**
 * One-time backfill of `settings.first_app_open` for users who upgraded from a
 * build that didn't track it (the column is null for them).
 *
 * - Sets it to the user's earliest (non-deleted) transaction date.
 * - If that date is earlier than {@link FIRST_APP_OPEN_FLOOR_ISO}, clamps up to
 *   the floor instead.
 * - If the user has no transactions yet, treats this load as their first open.
 *
 * Fresh installs already get `first_app_open` set to `now` at seed time, so this
 * is a no-op for them. Idempotent: it only writes when the column is still null.
 */
export function backfillFirstAppOpen(db: SQLiteDatabase, options: BackfillOptions = {}): void {
  const settings = db.getFirstSync<{ firstAppOpen: string | null }>(
    "SELECT first_app_open AS firstAppOpen FROM settings WHERE id = 'primary' LIMIT 1",
  );
  // No settings row yet, or already set → nothing to do.
  if (!settings || settings.firstAppOpen != null) return;

  const now = options.now ?? new Date();
  const floorMs = Date.parse(FIRST_APP_OPEN_FLOOR_ISO);

  const row = db.getFirstSync<{ minDate: string | null }>(
    'SELECT MIN(date) AS minDate FROM transactions WHERE deleted_at IS NULL',
  );
  const minDate = row?.minDate ?? null;

  let firstAppOpen: string;
  if (minDate) {
    const minMs = Date.parse(minDate);
    firstAppOpen =
      !Number.isFinite(minMs) || minMs < floorMs
        ? FIRST_APP_OPEN_FLOOR_ISO
        : new Date(minMs).toISOString();
  } else {
    // No transactions — this load is effectively the first app open.
    firstAppOpen = now.toISOString();
  }

  db.runSync("UPDATE settings SET first_app_open = ? WHERE id = 'primary'", [firstAppOpen]);
}

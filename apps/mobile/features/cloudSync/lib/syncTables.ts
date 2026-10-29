// What Cloud Sync copies. Pure data, shared by the engine and the tests.
//
// The synced tables are exactly the tables a backup holds (services/
// dataManagementService.ts `buildBackupData`): the user's data, and nothing a
// phone only keeps for itself. Payment-alert captures and learned merchant
// categories stay on the phone that saw the notifications.

import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';

import type { Row } from './rowCodec';

export const SYNC_TABLES = [
  'settings',
  'ledgers',
  'account_groups',
  'accounts',
  'categories',
  'monthly_wage_settings',
  'exchange_rates',
  'recurring_rules',
  'transactions',
  'transaction_splits',
  'albums',
  'album_transactions',
  'items',
  'budget_templates',
  'budget_template_categories',
  'monthly_budgets',
  'monthly_budget_categories',
  'receipt_splits',
  'receipt_split_items',
  'receipt_split_item_shares',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export function isSyncTable(name: string): name is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(name);
}

/**
 * Settings that belong to one phone, never copied either way:
 * - app_user_id: the install's RevenueCat identity (README: Purchase identity).
 * - app lock, app icon, notification and payment-alert setup, backup target:
 *   tied to this device's hardware, OS permissions or files.
 * - onboarding, first open, FX fetch status, timestamps: this install's history.
 * - active_ledger_id: the ledger open on this phone (each phone opens its own).
 */
export const DEVICE_LOCAL_SETTINGS_COLUMNS: ReadonlySet<string> = new Set([
  'app_user_id',
  'app_icon',
  'biometric_lock_enabled',
  'biometric_lock_delay_seconds',
  'notification_prefs_json',
  'auto_log_prefs_json',
  'auto_backup_enabled',
  'auto_backup_target',
  'last_auto_backup_at',
  'last_auto_backup_error',
  'last_rate_fetch_at',
  'last_rate_fetch_error',
  'onboarding_completed',
  'active_ledger_id',
  'first_app_open',
  'created_at',
]);

/**
 * Whether a column stays on the phone. In a shared ledger (`shared`) the
 * ledger's own preferences do too: payment-alert accounts, quick-entry picks,
 * the payback account and Insights choices name one person's accounts and
 * habits, so each member keeps theirs.
 */
export function isDeviceLocalColumn(table: string, column: string, shared = false): boolean {
  if (table === 'settings') return DEVICE_LOCAL_SETTINGS_COLUMNS.has(column);
  return shared && table === 'ledgers' && column === 'prefs_json';
}

/**
 * Columns holding a user image (`receipts/x.jpg`, `custom:account-logos/x.png`).
 * Keep in step with `collectReferencedAssetPaths` in services/userAssetGc.ts.
 */
export const ASSET_COLUMNS: Readonly<Partial<Record<SyncTable, readonly string[]>>> = {
  transactions: ['receipt_uri'],
  receipt_splits: ['receipt_image_uri'],
  albums: ['cover_photo_uri'],
  accounts: ['logo_id', 'card_design', 'goal_cover_uri', 'goal_emoji'],
  categories: ['icon'],
  budget_templates: ['emoji'],
  monthly_budgets: ['template_emoji'],
  items: ['icon_id'],
  recurring_rules: ['logo_id'],
  settings: ['profile_avatar_uri', 'payment_qr_uri'],
};

/**
 * Rows that mean the user has recorded something, by table: `true` for any
 * live row, else a test on the row. A side with none (only the settings,
 * starter accounts, categories and wage set up during onboarding) is replaced
 * by the other without asking, so anything worth keeping must count here.
 */
export const MEANINGFUL_ROWS: Readonly<Partial<Record<SyncTable, true | ((row: Row) => boolean)>>> =
  {
    transactions: true,
    recurring_rules: true,
    albums: true,
    items: true,
    budget_templates: true,
    // A balance, a savings goal or a loan; a starter account at zero is not.
    accounts: (row) =>
      row.type === 'goal' || row.type === 'loan' || Number(row.starting_balance ?? 0) !== 0,
    // Any ledger the user made; the default one is on every install.
    ledgers: (row) => row.id !== DEFAULT_LEDGER_ID,
  };

/** Whether `rowsOf` (a side's live rows by table) hold anything the user recorded. */
export function hasMeaningfulRows(rowsOf: (table: SyncTable) => readonly Row[]): boolean {
  return Object.entries(MEANINGFUL_ROWS).some(([table, test]) => {
    const rows = rowsOf(table as SyncTable);
    return test === true ? rows.length > 0 : rows.some(test);
  });
}

/** What this app version syncs, saved on the phone to spot additions after an update. */
export interface SyncedShape {
  tables: readonly string[];
  assets: Readonly<Record<string, readonly string[]>>;
}

export const CURRENT_SYNCED_SHAPE: SyncedShape = { tables: SYNC_TABLES, assets: ASSET_COLUMNS };

/**
 * What an app update added to sync since `saved`: tables whose existing rows
 * must be uploaded, and whether image columns changed (existing images must
 * be queued too). Nothing for a phone that never saved a shape.
 */
export function shapeAdditions(
  saved: SyncedShape | null,
  current: SyncedShape = CURRENT_SYNCED_SHAPE,
): { newTables: string[]; assetsChanged: boolean } {
  if (!saved) return { newTables: [], assetsChanged: false };
  const known = new Set(saved.tables);
  const newTables = current.tables.filter((table) => !known.has(table));
  const assetsChanged = Object.entries(current.assets).some(([table, columns]) =>
    columns.some((column) => !(saved.assets[table] ?? []).includes(column)),
  );
  return { newTables, assetsChanged };
}

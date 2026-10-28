import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, getActiveLedgerId } from '~/lib/db/ledgerScope';
import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';
import { normalizeIconColumns } from '~/lib/db/normalizeIcons';
import { retireSimpleMode } from '~/lib/db/retireSimpleMode';
import { resetAutomationCaptureData } from '~/services/resetAutomationCaptureData';
import { runUserAssetGc } from '~/services/userAssetGc';
import {
  collectUserAssetsForBackup,
  restoreUserAssetsFromBackup,
  type UserAssetBackupEntry,
  type UserAssetReadCache,
} from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';
import { newAppUserId, nowIso } from '~/utils/id';

// Version 4 is a backup holding more than one ledger. It is written only then,
// so an app from before ledgers refuses it instead of restoring every ledger's
// rows into one book. A backup of the default ledger alone stays version 3,
// which every app version reads.
const BACKUP_VERSION = 3;
const MULTI_LEDGER_BACKUP_VERSION = 4;
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2, 3, 4]);

interface BackupTables {
  accounts: Record<string, unknown>[];
  account_groups: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  transaction_splits: Record<string, unknown>[];
  exchange_rates?: Record<string, unknown>[];
  recurring_rules: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  monthly_wage_settings: Record<string, unknown>[];
  // Trip albums and their transaction join rows. Optional so backups written
  // before albums existed still parse; absent on restore means "no albums".
  albums?: Record<string, unknown>[];
  album_transactions?: Record<string, unknown>[];
  // Cost-per-day items. Optional so older backups still parse; absent on
  // restore means "no items".
  items?: Record<string, unknown>[];
  // Budget templates and frozen monthly budgets. Optional so backups written
  // before budgets existed still parse; absent on restore means "no budgets".
  budget_templates?: Record<string, unknown>[];
  budget_template_categories?: Record<string, unknown>[];
  monthly_budgets?: Record<string, unknown>[];
  monthly_budget_categories?: Record<string, unknown>[];
  // Itemized receipt splits. Optional so backups written before the feature
  // existed still parse; absent on restore means "no itemized detail".
  receipt_splits?: Record<string, unknown>[];
  receipt_split_items?: Record<string, unknown>[];
  receipt_split_item_shares?: Record<string, unknown>[];
  // Ledgers (migration 073). Optional: a backup without it holds only the
  // default ledger, whose rows restore there through the column default.
  ledgers?: Record<string, unknown>[];
}

export interface BackupData {
  version: number;
  exportedAt: string;
  tables: BackupTables;
  /** User-uploaded assets (custom logos, …) embedded as base64. Added in v3. */
  userAssets?: UserAssetBackupEntry[];
}

export interface BackupSummary {
  exportedAt: string;
  accountCount: number;
  transactionCount: number;
  recurringRuleCount: number;
}

function sanitizeSettingsRowsForExport(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const { app_user_id: _appUserId, ...rest } = row;
    return rest;
  });
}

function withPreservedAppUserId(
  rows: Record<string, unknown>[] | undefined,
  appUserId: string,
): Record<string, unknown>[] {
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({
    ...row,
    app_user_id: appUserId,
  }));
}

/**
 * `includeAsset` limits which user-asset files are read into the backup, by
 * path under user-assets/ (the Web Dashboard leaves out receipts it never
 * shows). Every real backup includes them all. `assetCache` lets a caller
 * that exports repeatedly skip re-reading files that have not changed.
 */
export async function buildBackupData(opts?: {
  includeAsset?: (path: string) => boolean;
  assetCache?: UserAssetReadCache;
  /** Keep only the open ledger's rows (the Web Dashboard shows one ledger). */
  openLedgerOnly?: boolean;
}): Promise<BackupData> {
  const sqlite = getSQLite();
  const now = nowIso();
  const ledgers = tryReadTable(sqlite, 'ledgers');
  const liveLedgerCount = ledgers.filter((row) => row.deleted_at == null).length;

  const data: BackupData = {
    version: liveLedgerCount > 1 ? MULTI_LEDGER_BACKUP_VERSION : BACKUP_VERSION,
    exportedAt: now,
    userAssets: await collectUserAssetsForBackup(opts?.includeAsset, opts?.assetCache),
    tables: {
      accounts: sqlite.getAllSync('SELECT * FROM accounts') as Record<string, unknown>[],
      account_groups: sqlite.getAllSync('SELECT * FROM account_groups') as Record<
        string,
        unknown
      >[],
      categories: sqlite.getAllSync('SELECT * FROM categories') as Record<string, unknown>[],
      transactions: sqlite.getAllSync('SELECT * FROM transactions') as Record<string, unknown>[],
      transaction_splits: tryReadTable(sqlite, 'transaction_splits'),
      exchange_rates: tryReadTable(sqlite, 'exchange_rates'),
      recurring_rules: sqlite.getAllSync('SELECT * FROM recurring_rules') as Record<
        string,
        unknown
      >[],
      settings: sanitizeSettingsRowsForExport(
        sqlite.getAllSync('SELECT * FROM settings') as Record<string, unknown>[],
      ),
      monthly_wage_settings: sqlite.getAllSync('SELECT * FROM monthly_wage_settings') as Record<
        string,
        unknown
      >[],
      // Read defensively — albums were added in a later migration and may be
      // absent on very old databases.
      albums: tryReadTable(sqlite, 'albums'),
      album_transactions: tryReadTable(sqlite, 'album_transactions'),
      // Items were added in a later migration and may be absent on old databases.
      items: tryReadTable(sqlite, 'items'),
      // Budget tables were added in a later migration and may be absent too.
      budget_templates: tryReadTable(sqlite, 'budget_templates'),
      budget_template_categories: tryReadTable(sqlite, 'budget_template_categories'),
      monthly_budgets: tryReadTable(sqlite, 'monthly_budgets'),
      monthly_budget_categories: tryReadTable(sqlite, 'monthly_budget_categories'),
      // Itemized receipt splits were added in a later migration too.
      receipt_splits: tryReadTable(sqlite, 'receipt_splits'),
      receipt_split_items: tryReadTable(sqlite, 'receipt_split_items'),
      receipt_split_item_shares: tryReadTable(sqlite, 'receipt_split_item_shares'),
      ledgers,
    },
  };
  return opts?.openLedgerOnly ? onlyOpenLedger(data) : data;
}

/**
 * The backup's rows that belong to the open ledger, with the settings row
 * showing that ledger's currency. Root rows match on `ledger_id`; child rows
 * follow their parents.
 */
function onlyOpenLedger(data: BackupData): BackupData {
  const ledgerId = getActiveLedgerId();
  const tables = data.tables;
  const inLedger = (rows: Record<string, unknown>[] | undefined) =>
    (rows ?? []).filter((row) => (row.ledger_id ?? DEFAULT_LEDGER_ID) === ledgerId);
  const idsOf = (rows: Record<string, unknown>[]) => new Set(rows.map((row) => row.id));
  const childrenOf = (
    rows: Record<string, unknown>[] | undefined,
    column: string,
    parentIds: ReadonlySet<unknown>,
  ) => (rows ?? []).filter((row) => parentIds.has(row[column]));

  const transactions = inLedger(tables.transactions);
  const transactionIds = idsOf(transactions);
  const albums = inLedger(tables.albums);
  const budgetTemplates = inLedger(tables.budget_templates);
  const monthlyBudgets = inLedger(tables.monthly_budgets);
  const receiptSplits = childrenOf(tables.receipt_splits, 'transaction_id', transactionIds);
  const receiptSplitIds = idsOf(receiptSplits);
  const ledger = (tables.ledgers ?? []).find((row) => row.id === ledgerId);
  const ledgerCurrency = typeof ledger?.currency_code === 'string' ? ledger.currency_code : null;

  return {
    ...data,
    version: BACKUP_VERSION,
    tables: {
      ...tables,
      accounts: inLedger(tables.accounts),
      account_groups: inLedger(tables.account_groups),
      categories: inLedger(tables.categories),
      transactions,
      transaction_splits: childrenOf(tables.transaction_splits, 'transaction_id', transactionIds),
      recurring_rules: inLedger(tables.recurring_rules),
      albums,
      album_transactions: childrenOf(tables.album_transactions, 'album_id', idsOf(albums)),
      items: inLedger(tables.items),
      budget_templates: budgetTemplates,
      budget_template_categories: childrenOf(
        tables.budget_template_categories,
        'template_id',
        idsOf(budgetTemplates),
      ),
      monthly_budgets: monthlyBudgets,
      monthly_budget_categories: childrenOf(
        tables.monthly_budget_categories,
        'budget_id',
        idsOf(monthlyBudgets),
      ),
      receipt_splits: receiptSplits,
      receipt_split_items: childrenOf(
        tables.receipt_split_items,
        'receipt_split_id',
        receiptSplitIds,
      ),
      receipt_split_item_shares: childrenOf(
        tables.receipt_split_item_shares,
        'receipt_split_id',
        receiptSplitIds,
      ),
      settings: ledgerCurrency
        ? tables.settings.map((row) => ({
            ...row,
            currency_code: ledgerCurrency,
            currency_symbol: ledger?.currency_symbol ?? ledgerCurrency,
          }))
        : tables.settings,
      ledgers: ledger ? [ledger] : [],
    },
  };
}

// transaction_splits may not exist on very old databases; read defensively.
function tryReadTable(
  sqlite: ReturnType<typeof getSQLite>,
  table: string,
): Record<string, unknown>[] {
  try {
    return sqlite.getAllSync(`SELECT * FROM ${table}`) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function buildBackupJson(opts?: {
  pretty?: boolean;
  includeAsset?: (path: string) => boolean;
}): Promise<{ json: string; data: BackupData }> {
  const data = await buildBackupData({ includeAsset: opts?.includeAsset });
  // Reading every table and serializing the result each take a noticeable
  // slice of the JS thread on a large database. Let a frame render between the
  // two so the auto-backup reads as two short stalls rather than one long one.
  // (The table reads themselves stay back to back, so the backup is one
  // consistent snapshot.)
  await yieldToEventLoop();
  // Auto-backups call with the default (compact) since they're machine-read
  // only — pretty-printing roughly doubles file size and serialization cost.
  // The user-facing export passes { pretty: true } so a curious user can
  // open the file in a text editor.
  return { json: JSON.stringify(data, null, opts?.pretty ? 2 : undefined), data };
}

/** Resolve on a later macrotask, so pending frames and touches run first. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function summarizeBackup(data: BackupData): BackupSummary {
  return {
    exportedAt: data.exportedAt,
    accountCount: data.tables.accounts?.length ?? 0,
    transactionCount: data.tables.transactions?.length ?? 0,
    recurringRuleCount: data.tables.recurring_rules?.length ?? 0,
  };
}

export function parseBackupJson(json: string): BackupData {
  const parsed = JSON.parse(json) as BackupData;
  if (!parsed || typeof parsed.version !== 'number' || !parsed.tables) {
    throw new Error('Invalid backup format');
  }
  if (!SUPPORTED_BACKUP_VERSIONS.has(parsed.version)) {
    throw new Error(`Unsupported backup version: ${parsed.version}`);
  }
  return parsed;
}

export async function exportDatabase(): Promise<void> {
  const { json, data } = await buildBackupJson({ pretty: true });
  const fileName = `money2time-backup-${data.exportedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const file = new File(Paths.document, fileName);
  await file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Money2Time Backup',
      UTI: 'public.json',
    });
  } else {
    file.delete();
  }
}

export interface ImportResult {
  canceled: boolean;
  success?: boolean;
  error?: string;
}

function getTableColumnNames(
  sqlite: ReturnType<typeof getSQLite>,
  tableName: string,
): ReadonlySet<string> {
  const columns = sqlite.getAllSync(`PRAGMA table_info(${tableName})`) as {
    name?: string | null;
  }[];
  return new Set(
    columns.map((column) => column.name?.trim()).filter((name): name is string => Boolean(name)),
  );
}

function insertRows(
  sqlite: ReturnType<typeof getSQLite>,
  tableName: string,
  rows: Record<string, unknown>[] | undefined,
) {
  if (!rows || rows.length === 0) return;
  const validColumns = getTableColumnNames(sqlite, tableName);
  if (validColumns.size === 0) return;

  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => validColumns.has(key) && row[key] !== undefined);
    if (keys.length === 0) continue;

    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    sqlite.runSync(
      sql,
      keys.map((k) => row[k] as string | number | null),
    );
  }
}

export function applyBackupData(backup: BackupData): ImportResult {
  const sqlite = getSQLite();
  const currentAppUserId =
    (
      sqlite.getAllSync('SELECT app_user_id FROM settings LIMIT 1') as {
        app_user_id?: string | null;
      }[]
    )[0]?.app_user_id ?? newAppUserId();
  const settingsRows = withPreservedAppUserId(backup.tables.settings, currentAppUserId);

  try {
    sqlite.execSync('BEGIN TRANSACTION');

    // Delete in FK-safe order (splits depend on transactions; transactions on accounts/categories).
    try {
      sqlite.execSync('DELETE FROM transaction_splits');
    } catch {
      // Older databases without the table — ignore.
    }
    try {
      // Join rows reference transactions/albums — clear them before either side.
      sqlite.execSync('DELETE FROM album_transactions');
    } catch {
      // Older databases without the table — ignore.
    }
    try {
      sqlite.execSync('DELETE FROM albums');
    } catch {
      // Older databases without the table — ignore.
    }
    try {
      sqlite.execSync('DELETE FROM exchange_rates');
    } catch {
      // Older databases without the table — ignore.
    }
    try {
      sqlite.execSync('DELETE FROM items');
    } catch {
      // Older databases without the table — ignore.
    }
    // Budget tables — clear even when the backup has no budgets, so a restore
    // can't leave stale budget lines pointing at replaced category ids.
    for (const budgetTable of [
      'budget_template_categories',
      'budget_templates',
      'monthly_budget_categories',
      'monthly_budgets',
    ]) {
      try {
        sqlite.execSync(`DELETE FROM ${budgetTable}`);
      } catch {
        // Older databases without the table — ignore.
      }
    }
    // Itemized receipt-split tables — children before the header.
    for (const receiptSplitTable of [
      'receipt_split_item_shares',
      'receipt_split_items',
      'receipt_splits',
    ]) {
      try {
        sqlite.execSync(`DELETE FROM ${receiptSplitTable}`);
      } catch {
        // Older databases without the table — ignore.
      }
    }
    // Captures refer to replaced transactions. Also clear unused legacy category memory.
    for (const alertTable of ['auto_log_captures', 'merchant_categories']) {
      try {
        sqlite.execSync(`DELETE FROM ${alertTable}`);
      } catch {
        // Older databases without the table — ignore.
      }
    }
    sqlite.execSync('DELETE FROM recurring_rules');
    sqlite.execSync('DELETE FROM transactions');
    sqlite.execSync('DELETE FROM accounts');
    sqlite.execSync('DELETE FROM account_groups');
    sqlite.execSync('DELETE FROM categories');
    sqlite.execSync('DELETE FROM settings');
    sqlite.execSync('DELETE FROM monthly_wage_settings');
    const hasLedgers = getTableColumnNames(sqlite, 'ledgers').size > 0;
    if (hasLedgers) sqlite.execSync('DELETE FROM ledgers');

    insertRows(sqlite, 'account_groups', backup.tables.account_groups);
    insertRows(sqlite, 'accounts', backup.tables.accounts);
    insertRows(sqlite, 'categories', backup.tables.categories);
    insertRows(sqlite, 'transactions', backup.tables.transactions);
    insertRows(sqlite, 'transaction_splits', backup.tables.transaction_splits);
    // Itemized receipt splits after transactions (header references a
    // transaction id); header before its item/share rows.
    insertRows(sqlite, 'receipt_splits', backup.tables.receipt_splits);
    insertRows(sqlite, 'receipt_split_items', backup.tables.receipt_split_items);
    insertRows(sqlite, 'receipt_split_item_shares', backup.tables.receipt_split_item_shares);
    if (backup.tables.exchange_rates && backup.tables.exchange_rates.length > 0) {
      insertRows(sqlite, 'exchange_rates', backup.tables.exchange_rates);
    }
    insertRows(sqlite, 'recurring_rules', backup.tables.recurring_rules);
    // Albums before their join rows, both after transactions (join references both).
    insertRows(sqlite, 'albums', backup.tables.albums);
    insertRows(sqlite, 'album_transactions', backup.tables.album_transactions);
    // Items are standalone (no FK dependencies).
    insertRows(sqlite, 'items', backup.tables.items);
    // Budgets after categories (allocation lines reference category ids);
    // parents before their line rows.
    insertRows(sqlite, 'budget_templates', backup.tables.budget_templates);
    insertRows(sqlite, 'budget_template_categories', backup.tables.budget_template_categories);
    insertRows(sqlite, 'monthly_budgets', backup.tables.monthly_budgets);
    insertRows(sqlite, 'monthly_budget_categories', backup.tables.monthly_budget_categories);
    insertRows(sqlite, 'settings', settingsRows);
    insertRows(sqlite, 'monthly_wage_settings', backup.tables.monthly_wage_settings);
    if (hasLedgers) {
      insertRows(sqlite, 'ledgers', backup.tables.ledgers);
      // A backup from before ledgers has no ledger rows, and every ledger
      // needs the default one. A restore always opens the default ledger: the
      // one it was on may not be in this backup.
      sqlite.runSync(
        `INSERT OR IGNORE INTO ledgers (id, sort_order, created_at, updated_at)
         VALUES (?, 0, ?, ?)`,
        [DEFAULT_LEDGER_ID, nowIso(), nowIso()],
      );
      sqlite.runSync('UPDATE ledgers SET deleted_at = NULL WHERE id = ?', [DEFAULT_LEDGER_ID]);
      sqlite.execSync('UPDATE settings SET active_ledger_id = NULL');
    }

    // Old backups can restore the retired flag after migration 63 has already
    // run. Convert within this transaction so a failure rolls back the restore.
    retireSimpleMode(sqlite);
    sqlite.execSync('COMMIT');
    resetAutomationCaptureData(currentAppUserId);

    // Older backups stored currency symbols (e.g. "RM") instead of ISO codes —
    // normalize so multi-currency doesn't treat them as bogus sub-currencies.
    // A backup written before multi-currency has no `exchange_rates` table; such
    // data is single-currency, so collapse every value (even stray valid codes
    // like a "USD" placeholder) to the main currency. Backups from a
    // multi-currency build keep their genuine per-account codes.
    const isPreMultiCurrencyBackup = backup.tables.exchange_rates === undefined;
    try {
      normalizeCurrencyColumns(sqlite, { collapseAll: isPreMultiCurrencyBackup });
      // A backup written before the icon migration carries bare emoji glyphs in
      // the icon columns; fold them into the tagged grammar so restored rows
      // behave like freshly written ones.
      normalizeIconColumns(sqlite);
    } catch {
      // Best-effort — a normalization failure shouldn't fail the restore.
    }

    // Restore user-uploaded assets (custom logos, …) outside the DB transaction.
    try {
      restoreUserAssetsFromBackup(backup.userAssets);
      // The restored DB replaced every reference, so any file left from the
      // device's prior state (not carried by this backup) is now an orphan.
      runUserAssetGc();
    } catch {
      // Asset restore is best-effort — a failure here shouldn't fail the import.
    }
    return { canceled: false, success: true };
  } catch (e) {
    try {
      sqlite.execSync('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    return {
      canceled: false,
      success: false,
      error: getErrorMessage(e, 'Unknown error during import'),
    };
  }
}

export function applyBackupJson(json: string): ImportResult {
  let backup: BackupData;
  try {
    backup = parseBackupJson(json);
  } catch (e) {
    return { canceled: false, success: false, error: getErrorMessage(e, 'Invalid JSON file') };
  }
  return applyBackupData(backup);
}

export async function pickAndImportDatabase(options?: {
  onFilePicked?: () => void;
}): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'public.json'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  if (!asset) return { canceled: false, success: false, error: 'No file selected' };

  // Fires once the native picker has dismissed and we have a valid file.
  // Used by callers to reveal the blocking "importing..." overlay only after
  // the picker is out of the way — on iOS, presenting a RN Modal while the
  // picker is trying to present prevents the picker from opening at all.
  options?.onFilePicked?.();
  // Yield a frame so React actually paints the overlay before we block the
  // JS thread on the synchronous SQLite writes below. Without this, the
  // state update queued by `onFilePicked` gets batched with the `finally`
  // cleanup and the overlay never becomes visible.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  let json: string;
  try {
    json = await new File(asset.uri).text();
  } catch {
    return { canceled: false, success: false, error: 'Failed to read file' };
  }

  return applyBackupJson(json);
}

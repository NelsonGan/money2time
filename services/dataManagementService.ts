import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { getSQLite } from '~/lib/db/client';
import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';
import {
  collectUserAssetsForBackup,
  restoreUserAssetsFromBackup,
  type UserAssetBackupEntry,
} from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';
import { newAppUserId, nowIso } from '~/utils/id';

const BACKUP_VERSION = 3;
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2, 3]);

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

export async function buildBackupData(): Promise<BackupData> {
  const sqlite = getSQLite();
  const now = nowIso();

  return {
    version: BACKUP_VERSION,
    exportedAt: now,
    userAssets: await collectUserAssetsForBackup(),
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
}): Promise<{ json: string; data: BackupData }> {
  const data = await buildBackupData();
  // Auto-backups call with the default (compact) since they're machine-read
  // only — pretty-printing roughly doubles file size and serialization cost.
  // The user-facing export passes { pretty: true } so a curious user can
  // open the file in a text editor.
  return { json: JSON.stringify(data, null, opts?.pretty ? 2 : undefined), data };
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
  file.write(json);

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
  const columns = sqlite.getAllSync(`PRAGMA table_info(${tableName})`) as Array<{
    name?: string | null;
  }>;
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
      sqlite.getAllSync('SELECT app_user_id FROM settings LIMIT 1') as Array<{
        app_user_id?: string | null;
      }>
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
      sqlite.execSync('DELETE FROM exchange_rates');
    } catch {
      // Older databases without the table — ignore.
    }
    sqlite.execSync('DELETE FROM recurring_rules');
    sqlite.execSync('DELETE FROM transactions');
    sqlite.execSync('DELETE FROM accounts');
    sqlite.execSync('DELETE FROM account_groups');
    sqlite.execSync('DELETE FROM categories');
    sqlite.execSync('DELETE FROM settings');
    sqlite.execSync('DELETE FROM monthly_wage_settings');

    insertRows(sqlite, 'account_groups', backup.tables.account_groups);
    insertRows(sqlite, 'accounts', backup.tables.accounts);
    insertRows(sqlite, 'categories', backup.tables.categories);
    insertRows(sqlite, 'transactions', backup.tables.transactions);
    insertRows(sqlite, 'transaction_splits', backup.tables.transaction_splits);
    if (backup.tables.exchange_rates && backup.tables.exchange_rates.length > 0) {
      insertRows(sqlite, 'exchange_rates', backup.tables.exchange_rates);
    }
    insertRows(sqlite, 'recurring_rules', backup.tables.recurring_rules);
    insertRows(sqlite, 'settings', settingsRows);
    insertRows(sqlite, 'monthly_wage_settings', backup.tables.monthly_wage_settings);

    sqlite.execSync('COMMIT');

    // Older backups stored currency symbols (e.g. "RM") instead of ISO codes —
    // normalize so multi-currency doesn't treat them as bogus sub-currencies.
    try {
      normalizeCurrencyColumns(sqlite);
    } catch {
      // Best-effort — a normalization failure shouldn't fail the restore.
    }

    // Restore user-uploaded assets (custom logos, …) outside the DB transaction.
    try {
      restoreUserAssetsFromBackup(backup.userAssets);
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

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { getSQLite } from '~/lib/db/client';
import { getErrorMessage } from '~/utils/errorHandling';
import { newAppUserId, nowIso } from '~/utils/id';

const BACKUP_VERSION = 2;
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2]);

interface BackupTables {
  accounts: Record<string, unknown>[];
  account_groups: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  recurring_rules: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  monthly_wage_settings: Record<string, unknown>[];
}

interface BackupData {
  version: number;
  exportedAt: string;
  tables: BackupTables;
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

export async function exportDatabase(): Promise<void> {
  const sqlite = getSQLite();
  const now = nowIso();

  const backup: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: now,
    tables: {
      accounts: sqlite.getAllSync('SELECT * FROM accounts') as Record<string, unknown>[],
      account_groups: sqlite.getAllSync('SELECT * FROM account_groups') as Record<
        string,
        unknown
      >[],
      categories: sqlite.getAllSync('SELECT * FROM categories') as Record<string, unknown>[],
      transactions: sqlite.getAllSync('SELECT * FROM transactions') as Record<string, unknown>[],
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

  const json = JSON.stringify(backup, null, 2);
  const fileName = `money2time-backup-${now.replace(/[:.]/g, '-').slice(0, 19)}.json`;
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

function insertRows(
  sqlite: ReturnType<typeof getSQLite>,
  tableName: string,
  rows: Record<string, unknown>[] | undefined,
) {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  if (keys.length === 0) return;
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    sqlite.runSync(
      sql,
      keys.map((k) => row[k] as string | number | null),
    );
  }
}

export async function pickAndImportDatabase(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'public.json'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  if (!asset) return { canceled: false, success: false, error: 'No file selected' };

  let json: string;
  try {
    json = await new File(asset.uri).text();
  } catch {
    return { canceled: false, success: false, error: 'Failed to read file' };
  }

  let backup: BackupData;
  try {
    backup = JSON.parse(json) as BackupData;
  } catch {
    return { canceled: false, success: false, error: 'Invalid JSON file' };
  }

  if (!backup || typeof backup.version !== 'number' || !backup.tables) {
    return { canceled: false, success: false, error: 'Invalid backup format' };
  }

  if (!SUPPORTED_BACKUP_VERSIONS.has(backup.version)) {
    return {
      canceled: false,
      success: false,
      error: `Unsupported backup version: ${backup.version}`,
    };
  }

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
    insertRows(sqlite, 'recurring_rules', backup.tables.recurring_rules);
    insertRows(sqlite, 'settings', settingsRows);
    insertRows(sqlite, 'monthly_wage_settings', backup.tables.monthly_wage_settings);

    sqlite.execSync('COMMIT');
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

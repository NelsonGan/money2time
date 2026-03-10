import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { getSQLite } from '~/lib/db/client';

const BACKUP_VERSION = 1;

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

export async function exportDatabase(): Promise<void> {
  const sqlite = getSQLite();

  const backup: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
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
      settings: sqlite.getAllSync('SELECT * FROM settings') as Record<string, unknown>[],
      monthly_wage_settings: sqlite.getAllSync('SELECT * FROM monthly_wage_settings') as Record<
        string,
        unknown
      >[],
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `money2time-backup-${timestamp}.json`;
  const file = new File(Paths.document, fileName);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Money2Time Backup',
      UTI: 'public.json',
    });
  }
}

export interface ImportResult {
  canceled: boolean;
  success?: boolean;
  error?: string;
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
    const response = await fetch(asset.uri);
    json = await response.text();
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

  if (backup.version !== BACKUP_VERSION) {
    return {
      canceled: false,
      success: false,
      error: `Unsupported backup version: ${backup.version}`,
    };
  }

  const sqlite = getSQLite();

  try {
    sqlite.execSync('BEGIN TRANSACTION');

    sqlite.execSync('DELETE FROM recurring_rules');
    sqlite.execSync('DELETE FROM transactions');
    sqlite.execSync('DELETE FROM accounts');
    sqlite.execSync('DELETE FROM account_groups');
    sqlite.execSync('DELETE FROM categories');
    sqlite.execSync('DELETE FROM settings');
    sqlite.execSync('DELETE FROM monthly_wage_settings');

    const insertRows = (tableName: string, rows: Record<string, unknown>[] | undefined) => {
      if (!rows || rows.length === 0) return;
      rows.forEach((row) => {
        const keys = Object.keys(row);
        if (keys.length === 0) return;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((k) => row[k] as string | number | null);
        sqlite.runSync(
          `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
          values,
        );
      });
    };

    insertRows('account_groups', backup.tables.account_groups);
    insertRows('accounts', backup.tables.accounts);
    insertRows('categories', backup.tables.categories);
    insertRows('transactions', backup.tables.transactions);
    insertRows('recurring_rules', backup.tables.recurring_rules);
    insertRows('settings', backup.tables.settings);
    insertRows('monthly_wage_settings', backup.tables.monthly_wage_settings);

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
      error: e instanceof Error ? e.message : 'Unknown error during import',
    };
  }
}

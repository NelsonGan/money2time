import { openDatabaseAsync } from 'expo-sqlite';

import { I18n } from '~/lib/i18n';

import { androidAdapter } from './mmbakImport/androidAdapter';
import { iosAdapter } from './mmbakImport/iosAdapter';
import type { MMBackupAdapter, MMImportSummary, MMSourceDatabase } from './mmbakImport/types';
import { writeImportedData } from './mmbakImport/writer';

export type { MMImportSummary } from './mmbakImport/types';

const ADAPTERS: readonly MMBackupAdapter[] = [iosAdapter, androidAdapter];

function parseFileUri(uri: string) {
  const normalized = decodeURIComponent(uri.replace('file://', ''));
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1];
  const directory = parts.slice(0, -1).join('/');
  if (!fileName || !directory) {
    throw new Error(I18n.t('errors.invalid_file_path'));
  }
  return { fileName, directory };
}

async function listTableNames(db: MMSourceDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string | null }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  return rows.map((row) => (row.name ?? '').trim()).filter(Boolean);
}

function pickAdapter(tableNames: string[]): MMBackupAdapter | null {
  const tableNameSet = new Set(tableNames.map((name) => name.toUpperCase()));
  return ADAPTERS.find((adapter) => adapter.canHandle(tableNameSet)) ?? null;
}

export async function importMoneyManagerBackupFromUri(
  uri: string,
  currencySymbol: string,
): Promise<MMImportSummary> {
  const { fileName, directory } = parseFileUri(uri);
  const sourceDb = await openDatabaseAsync(fileName, undefined, directory);

  try {
    const tableNames = await listTableNames(sourceDb);
    const adapter = pickAdapter(tableNames);

    if (!adapter) {
      console.warn(
        `[mmbakImport] Unsupported backup schema. Available tables: ${tableNames.join(', ')}`,
      );
      throw new Error(I18n.t('errors.mm_unsupported_backup_schema'));
    }

    const data = await adapter.extract(sourceDb);
    return writeImportedData(data, currencySymbol);
  } finally {
    await sourceDb.closeAsync();
  }
}

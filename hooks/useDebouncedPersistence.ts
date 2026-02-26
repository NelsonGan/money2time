import { useCallback } from 'react';

import { getSQLite } from '~/lib/db/client';
import { nowIso } from '~/utils/id';

type TableName = 'categories' | 'accounts' | 'account_groups';

function executePersist(table: TableName, orderedIds: string[]): void {
  if (orderedIds.length === 0) return;

  const sqlite = getSQLite();
  const now = nowIso();
  const tableName = table === 'account_groups' ? 'account_groups' : table;

  const cases = orderedIds.map((id, index) => `WHEN '${id}' THEN ${index}`).join(' ');
  const idsList = orderedIds.map((id) => `'${id}'`).join(',');

  sqlite.execSync(
    `UPDATE ${tableName} SET sort_order = CASE id ${cases} END, updated_at = '${now}' WHERE id IN (${idsList})`,
  );
}

export function useDebouncedPersistence(_debounceMs: number = 0) {
  const persistOrder = useCallback((table: TableName, orderedIds: string[]) => {
    try {
      executePersist(table, orderedIds);
    } catch (error) {
      console.error(`[persistOrder] Failed to save order for ${table}:`, error);
    }
  }, []);

  return { persistOrder };
}

import { useCallback, useRef } from 'react';

type TableName = 'categories' | 'accounts' | 'account_groups';

interface PersistQueueItem {
  table: TableName;
  orderedIds: string[];
}

let globalPersistTimeoutId: ReturnType<typeof setTimeout> | null = null;
let globalPersistQueue: PersistQueueItem | null = null;
let globalIsPersisting = false;

async function executePersist(table: TableName, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  const { getSQLite } = await import('~/lib/db/client');
  const { nowIso } = await import('~/utils/id');

  const sqlite = getSQLite();
  const now = nowIso();
  const tableName = table === 'account_groups' ? 'account_groups' : table;

  const cases = orderedIds.map((id, index) => `WHEN '${id}' THEN ${index}`).join(' ');
  const idsList = orderedIds.map((id) => `'${id}'`).join(',');

  sqlite.execSync(
    `UPDATE ${tableName} SET sort_order = CASE id ${cases} END, updated_at = '${now}' WHERE id IN (${idsList})`,
  );
}

async function flushPersistQueue(): Promise<void> {
  if (globalIsPersisting || !globalPersistQueue) return;

  globalIsPersisting = true;
  const item = globalPersistQueue;
  globalPersistQueue = null;

  try {
    await executePersist(item.table, item.orderedIds);
  } catch (error) {
    console.error(`[persistOrder] Failed to save order for ${item.table}:`, error);
  } finally {
    globalIsPersisting = false;

    if (globalPersistQueue) globalPersistTimeoutId = setTimeout(() => void flushPersistQueue(), 100);
  }
}

export function useDebouncedPersistence(debounceMs: number = 500) {
  const debounceMsRef = useRef(debounceMs);
  debounceMsRef.current = debounceMs;

  const persistOrder = useCallback((table: TableName, orderedIds: string[]) => {
    globalPersistQueue = { table, orderedIds };

    if (globalPersistTimeoutId) {
      clearTimeout(globalPersistTimeoutId);
    }

    globalPersistTimeoutId = setTimeout(() => {
      void flushPersistQueue();
    }, debounceMsRef.current);
  }, []);

  return { persistOrder };
}

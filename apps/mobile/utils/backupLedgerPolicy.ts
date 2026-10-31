import {
  LEDGER_CHILD_SYNC_TABLES,
  LEDGER_ROOT_SYNC_TABLES,
} from '~/features/cloudSync/lib/ledgerRows';
import type { SyncTable } from '~/features/cloudSync/lib/syncTables';

type Tables = Record<string, Record<string, unknown>[] | undefined>;

export interface BackupSharedLedger {
  ledgerId: string;
  shareId: string;
}

interface CurrentShare extends BackupSharedLedger {
  role: 'owner' | 'member';
  name: string | null;
  active: boolean;
}

export interface RestoreLedgerChoice extends BackupSharedLedger {
  name: string;
  canRestore: boolean;
}

/** Resolve descendants from the snapshot itself, including nested receipt items. */
export function filterBackupLedgers<T extends Tables>(tables: T, excluded: readonly string[]): T {
  const excludedIds = new Set(excluded);
  const byId = new Map(
    Object.entries(tables).map(([table, rows]) => [
      table,
      new Map((rows ?? []).map((row) => [String(row.id), row])),
    ]),
  );
  const belongs = (table: string, row: Record<string, unknown>): boolean => {
    if (table === 'ledgers') return excludedIds.has(String(row.id));
    if (LEDGER_ROOT_SYNC_TABLES.has(table as SyncTable))
      return excludedIds.has(String(row.ledger_id ?? 'default'));
    const child = LEDGER_CHILD_SYNC_TABLES[table as SyncTable];
    if (!child) return false;
    const parent = byId.get(child[1])?.get(String(row[child[0]]));
    if (parent && belongs(child[1], parent)) return true;
    if (table === 'album_transactions') {
      const transaction = byId.get('transactions')?.get(String(row.transaction_id));
      return !!transaction && belongs('transactions', transaction);
    }
    return false;
  };
  return Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [
      table,
      rows?.filter((row) => !belongs(table, row)),
    ]),
  ) as T;
}

/** Historical ownership is descriptive only; current membership authorizes restoration. */
export function restoreLedgerChoices(
  backup: { tables: Tables; sharedLedgers?: readonly BackupSharedLedger[] },
  current: readonly CurrentShare[],
): RestoreLedgerChoice[] {
  const historical = new Map(
    (backup.sharedLedgers ?? []).map((ledger) => [ledger.ledgerId, ledger]),
  );
  const live = new Map(current.map((ledger) => [ledger.ledgerId, ledger]));
  return (backup.tables.ledgers ?? []).flatMap((row) => {
    const id = String(row.id);
    const before = historical.get(id);
    const now = live.get(id);
    if ((!before && !now) || row.deleted_at != null) return [];
    const shareId = before?.shareId ?? now!.shareId;
    return [
      {
        ledgerId: id,
        shareId,
        name: typeof row.name === 'string' ? row.name : (now?.name ?? ''),
        canRestore: now?.role === 'owner' && now.active && now.shareId === shareId,
      },
    ];
  });
}

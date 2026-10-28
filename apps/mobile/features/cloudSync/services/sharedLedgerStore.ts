// This phone's shared ledgers (table shared_ledgers, migration 075), as the
// Worker last reported them. Read synchronously by the sync engine to route
// rows, and by the ledger screens through `useSharedLedgers`.

import { getSQLite } from '~/lib/db/client';

export interface SharedLedger {
  /** The app's id of the ledger. */
  ledgerId: string;
  /** The Worker's id of the share: the sync channel and the image space. */
  shareId: string;
  role: 'owner' | 'member';
  name: string | null;
  ownerName: string | null;
  memberCount: number;
  /** False while the owner is not Pro: nobody syncs it, members cannot open it. */
  active: boolean;
}

interface Row {
  ledger_id: string;
  share_id: string;
  role: string;
  name: string | null;
  owner_name: string | null;
  member_count: number;
  active: number;
}

let cache: SharedLedger[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  cache = null;
  for (const listener of listeners) listener();
}

export function subscribeSharedLedgers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listSharedLedgers(): SharedLedger[] {
  if (cache) return cache;
  try {
    cache = getSQLite()
      .getAllSync<Row>('SELECT * FROM shared_ledgers ORDER BY updated_at')
      .map((row) => ({
        ledgerId: row.ledger_id,
        shareId: row.share_id,
        role: row.role === 'owner' ? 'owner' : 'member',
        name: row.name,
        ownerName: row.owner_name,
        memberCount: row.member_count,
        active: row.active === 1,
      }));
  } catch {
    // Before migration 075 has run.
    cache = [];
  }
  return cache;
}

export function sharedLedgerFor(ledgerId: string): SharedLedger | null {
  return listSharedLedgers().find((ledger) => ledger.ledgerId === ledgerId) ?? null;
}

export function saveSharedLedger(ledger: SharedLedger): void {
  const known = sharedLedgerFor(ledger.ledgerId);
  // The list is re-read every minute; only a change is written and announced.
  if (
    known &&
    (Object.keys(ledger) as (keyof SharedLedger)[]).every((k) => known[k] === ledger[k])
  ) {
    return;
  }
  getSQLite().runSync(
    `INSERT INTO shared_ledgers (ledger_id, share_id, role, name, owner_name, member_count, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ledger_id) DO UPDATE SET share_id = excluded.share_id, role = excluded.role,
       name = excluded.name, owner_name = excluded.owner_name,
       member_count = excluded.member_count, active = excluded.active`,
    [
      ledger.ledgerId,
      ledger.shareId,
      ledger.role,
      ledger.name,
      ledger.ownerName,
      ledger.memberCount,
      ledger.active ? 1 : 0,
      Date.now(),
    ],
  );
  notify();
}

export function removeSharedLedger(ledgerId: string): void {
  getSQLite().runSync('DELETE FROM shared_ledgers WHERE ledger_id = ?', [ledgerId]);
  notify();
}

// This phone's shared ledgers (table shared_ledgers, migration 075), as the
// Worker last reported them. Read synchronously by the sync engine to route
// rows, and by the ledger screens through `useSharedLedgers`.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSQLite } from '~/lib/db/client';
import { getActiveLedgerId } from '~/lib/db/ledgerScope';

export interface SharedLedger {
  /** The app's id of the ledger. */
  ledgerId: string;
  /** The Worker's id of the share: the sync channel and the image space. */
  shareId: string;
  role: 'owner' | 'member';
  name: string | null;
  ownerName: string | null;
  memberCount: number;
  /** False while nobody in it is Pro: nobody syncs it, members cannot open it. */
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

/**
 * Whether the open ledger is shared and active (anyone in it Pro). A free
 * member then adds entries in it whatever its account count.
 */
export function openLedgerSharedAndActive(): boolean {
  return sharedLedgerFor(getActiveLedgerId())?.active === true;
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

// ---------------------------------------------------------------------------
// Ledgers that left this phone because their sharing ended (the owner stopped
// sharing, removed the user, or deleted their account), for a one-time
// notice (LedgerProGuard). Leaving or signing out is the user's own doing and
// gives none.

let removedNotice: string[] = [];
const noticeListeners = new Set<() => void>();

export function subscribeRemovedLedgerNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

export function getRemovedLedgerNotice(): string[] {
  return removedNotice;
}

export function noteRemovedLedgers(names: string[]): void {
  if (!names.length) return;
  removedNotice = [...removedNotice, ...names];
  for (const listener of noticeListeners) listener();
}

/** The notice names one ledger at a time; Done moves on to the next. */
export function dismissRemovedLedgerNotice(): void {
  if (!removedNotice.length) return;
  removedNotice = removedNotice.slice(1);
  for (const listener of noticeListeners) listener();
}

// ---------------------------------------------------------------------------
// A joined ledger whose sharing ended while it was the open ledger. It is not
// deleted under the user (an editor may hold its accounts and categories):
// LedgerProGuard opens the default ledger once the app is back on its main
// screens, then deletes it. Kept in AsyncStorage so a restart finishes it.

const DEFERRED_KEY = 'm2t.sharedLedgers.deferredDeletes';
let deferred: string[] = [];
const deferredListeners = new Set<() => void>();

void AsyncStorage.getItem(DEFERRED_KEY)
  .then((raw) => {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      const ids = parsed.filter((id): id is string => typeof id === 'string');
      deferred = [...new Set([...deferred, ...ids])];
      for (const listener of deferredListeners) listener();
    }
  })
  .catch(() => undefined);

export function subscribeDeferredLedgerDeletes(listener: () => void): () => void {
  deferredListeners.add(listener);
  return () => deferredListeners.delete(listener);
}

export function getDeferredLedgerDeletes(): string[] {
  return deferred;
}

function writeDeferred(next: string[]): void {
  deferred = next;
  AsyncStorage.setItem(DEFERRED_KEY, JSON.stringify(next)).catch(() => undefined);
  for (const listener of deferredListeners) listener();
}

export function deferLedgerDelete(ledgerId: string): void {
  if (!deferred.includes(ledgerId)) writeDeferred([...deferred, ledgerId]);
}

export function clearDeferredLedgerDeletes(ledgerIds: string[]): void {
  writeDeferred(deferred.filter((id) => !ledgerIds.includes(id)));
}

// ---------------------------------------------------------------------------
// Stop sharing or leave, done on this phone while the Worker could not be
// told (signed out, session expired, offline). The ledger is let go here at
// once, and the Worker is told after the next sign-in, so the ledger never
// comes back from the cloud and members do not keep a ledger its owner gave up.

const PENDING_KEY = 'm2t.sharedLedgers.pendingActions';

export interface PendingLedgerAction {
  shareId: string;
  action: 'stop' | 'leave';
  /** The account it was done in; null when not known (finished by the next sign-in). */
  userId: string | null;
}

export async function listPendingLedgerActions(): Promise<PendingLedgerAction[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item): item is PendingLedgerAction =>
              !!item &&
              typeof item.shareId === 'string' &&
              (item.action === 'stop' || item.action === 'leave'),
          )
          .map((item) => ({
            ...item,
            userId: typeof item.userId === 'string' ? item.userId : null,
          }))
      : [];
  } catch {
    return [];
  }
}

async function writePending(actions: PendingLedgerAction[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(actions)).catch(() => undefined);
}

export async function addPendingLedgerAction(action: PendingLedgerAction): Promise<void> {
  const current = await listPendingLedgerActions();
  if (current.some((item) => item.shareId === action.shareId)) return;
  await writePending([...current, action]);
}

export async function removePendingLedgerAction(shareId: string): Promise<void> {
  const current = await listPendingLedgerActions();
  await writePending(current.filter((item) => item.shareId !== shareId));
}

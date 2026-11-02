// The signed-in Cloud Sync account, as last read or saved by cloudSyncSession.ts,
// for synchronous callers that must not pull in the keychain module (stamping
// an entry in a shared ledger, naming its author). Null until the session has
// been read this launch; see `shared_ledgers.user_id` for the durable copy.

import type { CloudUser } from './cloudSyncApi';

let current: CloudUser | null = null;

export function getCachedSessionUser(): CloudUser | null {
  return current;
}

export function setCachedSessionUser(user: CloudUser | null): void {
  current = user;
}

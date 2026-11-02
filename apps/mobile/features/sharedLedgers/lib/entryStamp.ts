// Stamping a new entry in a shared ledger with who added it and whose it is
// (README.md > Shared ledgers > Who added it). Kept apart from the people
// store (ledgerPeople.ts), which is UI-side: the repositories call this.

import { getCachedSessionUser } from '~/features/cloudSync/services/sessionUser';
import { sharedLedgerFor } from '~/features/cloudSync/services/sharedLedgerStore';

interface EntryAttribution {
  createdBy?: string | null;
  memberId?: string | null;
}

/**
 * The account a new entry in `ledgerId` is stamped with: this phone's account
 * when it is a member of that shared ledger, else null (the owner, or a ledger
 * that is not shared).
 */
export function selfMemberIdFor(ledgerId: string): string | null {
  const shared = sharedLedgerFor(ledgerId);
  if (!shared || shared.role !== 'member') return null;
  return shared.userId ?? getCachedSessionUser()?.id ?? null;
}

/**
 * `input` with who added it and whose it is filled in, keeping any value the
 * caller set (a recurring run passes its rule's person, the editor its pick).
 * `memberId` defaults to whoever added the entry.
 */
export function withEntryStamp<T extends EntryAttribution>(
  input: T,
  ledgerId: string,
): T & { createdBy: string | null; memberId: string | null } {
  const createdBy = input.createdBy !== undefined ? input.createdBy : selfMemberIdFor(ledgerId);
  const memberId = input.memberId !== undefined ? input.memberId : createdBy;
  return { ...input, createdBy, memberId };
}

/**
 * Who a debt is with. Today that is a name typed on a split bill, so the same
 * friend on two bills is one person when the trimmed, case-folded names match.
 * Later a person can be a real user: a member of a shared group, known by
 * their Cloud Sync account (`memberId`). Balances, Settle up and the pages
 * that list people all go through this one key, so linking a name to an
 * account changes who is grouped together without touching how debts are
 * rolled up.
 */

import type { TransactionSplit } from '~/types';

/** Grouping key for splits that were never given a person name. */
export const UNNAMED_PERSON_KEY = '__unnamed__';

/** Keys of real users start with this, so one can never collide with a name. */
const MEMBER_KEY_PREFIX = 'member:';

export interface DebtParty {
  /** What shares are grouped by: the member when there is one, else the name. */
  key: string;
  /** Trimmed display name, or null when the split was never named. */
  name: string | null;
  /** The Cloud Sync account this person is; null for a name typed on a bill. */
  memberId: string | null;
}

/** The key a person's shares are grouped under. */
export function debtPartyKey(
  personName: string | null | undefined,
  memberId?: string | null,
): string {
  if (memberId) return `${MEMBER_KEY_PREFIX}${memberId}`;
  const trimmed = personName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.toLowerCase() : UNNAMED_PERSON_KEY;
}

/** The person a split row is about. */
export function debtPartyOf(split: Pick<TransactionSplit, 'personName' | 'memberId'>): DebtParty {
  const trimmed = split.personName?.trim() ?? '';
  return {
    key: debtPartyKey(split.personName, split.memberId),
    name: trimmed.length > 0 ? trimmed : null,
    memberId: split.memberId ?? null,
  };
}

import type { Account } from '~/types';

/**
 * An account's position within its section of the stack, which is what picks
 * its plain colour: the same bucketing as AccountCardStack (live accounts by
 * group, archived loans on their own), in list order. An account not in the
 * list yet (one being created) lands at the end of its group.
 */
export function stackPaletteIndex(
  accountId: string | null,
  groupName: string | null,
  accounts: readonly Account[],
  archivedLoan = false,
): number {
  const key = groupName?.trim() || '';
  const section = accounts.filter((other) => {
    if (other.type === 'goal') return false;
    const otherArchived = other.type === 'loan' && other.loanArchivedAt != null;
    if (otherArchived !== archivedLoan) return false;
    return archivedLoan || (other.accountGroup?.trim() || '') === key;
  });
  const index = accountId ? section.findIndex((other) => other.id === accountId) : -1;
  return index >= 0 ? index : section.length;
}

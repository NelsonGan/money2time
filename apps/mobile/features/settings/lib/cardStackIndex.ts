import type { Account } from '~/types';
import { isAccountArchived } from '~/utils/accountArchive';

/**
 * An account's position within its section of the stack, which is what picks
 * its plain colour: the same bucketing as AccountCardStack (live accounts by
 * group, archived accounts on their own), in list order. An account not in the
 * list yet (one being created) lands at the end of its group.
 */
export function stackPaletteIndex(
  accountId: string | null,
  groupName: string | null,
  accounts: readonly Account[],
  archived = false,
): number {
  const key = groupName?.trim() || '';
  const section = accounts.filter((other) => {
    if (other.type === 'goal') return false;
    if (isAccountArchived(other) !== archived) return false;
    return archived || (other.accountGroup?.trim() || '') === key;
  });
  const index = accountId ? section.findIndex((other) => other.id === accountId) : -1;
  return index >= 0 ? index : section.length;
}

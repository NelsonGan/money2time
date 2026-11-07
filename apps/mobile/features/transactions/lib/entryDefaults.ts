import type { Account, Category, TransactionType } from '~/types';
import { isAccountArchived } from '~/utils/accountArchive';

/**
 * Shared fallbacks for every entry flow (quick add, voice, receipt scan, and
 * the + sheet's account chip), so they all agree on where a transaction lands
 * when nothing explicit is chosen. Keep these the single source of truth — a
 * flow with its own copy will drift and post to a different category/account
 * than the UI advertises.
 */

/** Fallback category for a type: "Other…" when present, else the user's first. */
export function findFallbackCategory(
  categories: Category[],
  type: TransactionType,
): Category | null {
  if (type !== 'expense' && type !== 'income') return null;
  const sameType = categories.filter((category) => category.type === type);
  if (sameType.length === 0) return null;
  const other = sameType.find((category) => /^other/i.test(category.name));
  return other ?? sameType[0] ?? null;
}

/**
 * The account an entry flow posts to: an explicit selection, then the
 * preferred/saved account when it still exists and is not archived, else the
 * first live account by sort order.
 */
export function pickDefaultAccountId(
  accounts: Account[],
  preferredId?: string | null,
  initialId?: string | null,
): string | null {
  if (initialId && accounts.some((account) => account.id === initialId)) {
    return initialId;
  }
  // An archived account is never a fallback: the user put it away, so a new
  // entry must not land somewhere they can no longer see. An explicit
  // `initialId` (opening add from that account) still wins above.
  const live = accounts.filter((account) => !isAccountArchived(account));
  if (preferredId && live.some((account) => account.id === preferredId)) {
    return preferredId;
  }
  if (live.length === 0) return null;
  return [...live].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  )[0].id;
}

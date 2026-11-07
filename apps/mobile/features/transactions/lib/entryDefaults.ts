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
 * first live everyday (debit or credit) account by sort order, else none.
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
  // Only an everyday account is a fallback. A goal or a loan is only ever
  // where an entry goes because the user picked it; once every debit and
  // credit account is archived, an entry has no account until one is picked.
  const everyday = live.filter((account) => account.type !== 'goal' && account.type !== 'loan');
  if (everyday.length === 0) return null;
  return [...everyday].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  )[0].id;
}

/**
 * Where a friend's payback lands by default: the Settle Up "paid to" account
 * while it is live, else the same fallback new entries use. Never an archived
 * account, so archiving the "paid to" account does not keep booking money
 * into an account the user can no longer see.
 */
export function pickPaybackAccountId(
  accounts: Account[],
  preferredId?: string | null,
): string | null {
  return pickDefaultAccountId(accounts, preferredId);
}

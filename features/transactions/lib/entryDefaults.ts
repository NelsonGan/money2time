import type { Account, Category, TransactionType } from '~/types';

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
 * The account an entry flow posts to: the preferred/saved account when it
 * still exists, else the first account by sort order.
 */
export function pickDefaultAccountId(
  accounts: Account[],
  preferredId?: string | null,
): string | null {
  if (preferredId && accounts.some((account) => account.id === preferredId)) {
    return preferredId;
  }
  if (accounts.length === 0) return null;
  return [...accounts].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  )[0].id;
}

/** Account used for quick-entry validation, currency, and submission. */
export function resolveQuickEntryAccountId({
  isSimpleMode,
  simpleWalletId,
  fallbackAccountId,
}: {
  isSimpleMode: boolean;
  simpleWalletId: string | null;
  fallbackAccountId: string | null;
}): string | null {
  // Imports preserve simple mode but replace its hidden wallet with imported
  // accounts. Use the same fallback as the detailed editor in that state.
  return isSimpleMode ? (simpleWalletId ?? fallbackAccountId) : fallbackAccountId;
}

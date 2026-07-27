import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSQLite } from '~/lib/db/client';

import { assetRelativePathFromRef, sweepOrphanUserAssets } from './userAssets';

// Bumped only if a future change needs the historical backfill to run again.
const BACKFILL_DONE_KEY = 'userAssetGc.backfillDone.v1';

/**
 * Collects the relative paths of every user-asset still referenced by a live
 * (non-soft-deleted) row, across all asset-bearing columns:
 *
 *   - `transactions.receipt_uri`          → `receipts/…`
 *   - `receipt_splits.receipt_image_uri`  → `receipts/…`
 *   - `albums.cover_photo_uri`            → `album-covers/…`
 *   - `accounts.logo_id`                  → `custom:account-logos/…`
 *   - `accounts.goal_emoji`               → `custom:category-icons/…`
 *   - `categories.icon`                   → `custom:category-icons/…`
 *   - `budget_templates.emoji`            → `custom:category-icons/…`
 *   - `monthly_budgets.template_emoji`    → `custom:category-icons/…`
 *   - `items.icon_id`                     → `custom:item-icons/…`
 *   - `settings.profile_avatar_uri`       → `avatars/…`
 *   - `settings.payment_qr_uri`           → `payment-qr/…`
 *
 * The four icon columns hold a tagged value (see constants/categoryIcons.ts):
 * a bundled id, an `emoji:` glyph, or a `custom:` upload. Only the last names a
 * file; the others normalize to paths that match nothing on disk, which is
 * harmless. A month's frozen `template_emoji` can point at the same file as its
 * template's `emoji`, so the sweep must stay reference-counted rather than
 * unlinking on delete.
 *
 * This set is the allow-list for {@link sweepOrphanUserAssets}; every real
 * reference must appear here or a live image could be deleted. Built-in logo /
 * icon ids (no `custom:` prefix) normalize to harmless non-matching paths.
 */
export function collectReferencedAssetPaths(): Set<string> {
  const db = getSQLite();
  const paths = new Set<string>();
  const add = (ref?: string | null) => {
    const rel = assetRelativePathFromRef(ref);
    if (rel) paths.add(rel);
  };
  const collect = (sql: string) => {
    for (const row of db.getAllSync<{ v: string | null }>(sql)) add(row.v);
  };

  collect(
    `SELECT receipt_uri AS v FROM transactions WHERE deleted_at IS NULL AND receipt_uri IS NOT NULL`,
  );
  collect(
    `SELECT receipt_image_uri AS v FROM receipt_splits WHERE deleted_at IS NULL AND receipt_image_uri IS NOT NULL`,
  );
  collect(
    `SELECT cover_photo_uri AS v FROM albums WHERE deleted_at IS NULL AND cover_photo_uri IS NOT NULL`,
  );
  collect(`SELECT logo_id AS v FROM accounts WHERE deleted_at IS NULL AND logo_id IS NOT NULL`);
  collect(
    `SELECT goal_emoji AS v FROM accounts WHERE deleted_at IS NULL AND goal_emoji IS NOT NULL`,
  );
  collect(`SELECT icon AS v FROM categories WHERE deleted_at IS NULL AND icon IS NOT NULL`);
  collect(`SELECT emoji AS v FROM budget_templates WHERE deleted_at IS NULL AND emoji IS NOT NULL`);
  collect(
    `SELECT template_emoji AS v FROM monthly_budgets WHERE deleted_at IS NULL AND template_emoji IS NOT NULL`,
  );
  collect(`SELECT icon_id AS v FROM items WHERE deleted_at IS NULL AND icon_id IS NOT NULL`);
  collect(
    `SELECT profile_avatar_uri AS v FROM settings WHERE deleted_at IS NULL AND profile_avatar_uri IS NOT NULL`,
  );
  collect(
    `SELECT payment_qr_uri AS v FROM settings WHERE deleted_at IS NULL AND payment_qr_uri IS NOT NULL`,
  );
  return paths;
}

/**
 * Reclaims orphaned user-asset files: deletes every on-disk image no live row
 * references. Safe to run on load and after any operation that can orphan
 * assets (transaction delete, data reset, import, restore). Swallows and logs
 * its own errors so it can be fired-and-forgotten off the critical path.
 * Returns the number of files removed.
 */
export function runUserAssetGc(): number {
  try {
    const removed = sweepOrphanUserAssets(collectReferencedAssetPaths());
    if (removed > 0) {
      console.warn(`[userAssetGc] reclaimed ${removed} orphaned user-asset file(s)`);
    }
    return removed;
  } catch (error) {
    console.warn('[userAssetGc] sweep failed', error);
    return 0;
  }
}

/**
 * One-time historical cleanup, run at startup. Reclaims orphans left behind by
 * app versions that didn't delete asset files (deleted transactions, resets,
 * imports, deleted albums, …). Going forward the per-event cleanup keeps things
 * tidy, so a routine every-launch sweep isn't needed — this no-ops on every
 * launch after the first successful run.
 *
 * The done-flag is only set after a successful sweep, so a launch that runs
 * before the DB is ready simply retries next time rather than marking the
 * backfill complete.
 */
export async function runUserAssetGcBackfillOnce(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(BACKFILL_DONE_KEY)) === 'true') return;
    const removed = sweepOrphanUserAssets(collectReferencedAssetPaths());
    if (removed > 0) {
      console.warn(`[userAssetGc] backfill reclaimed ${removed} orphaned user-asset file(s)`);
    }
    await AsyncStorage.setItem(BACKFILL_DONE_KEY, 'true');
  } catch (error) {
    // Leave the flag unset so the next launch retries the backfill.
    console.warn('[userAssetGc] backfill failed', error);
  }
}

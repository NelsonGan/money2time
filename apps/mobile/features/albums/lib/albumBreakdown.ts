/**
 * An album's spending by category, as its Breakdown and the Insights album
 * line show it (README: Key patterns > Albums). A shared album groups by its
 * own categories, the same for everyone in it (`albumCategories.ts`); an
 * album of the user's own, and one they no longer share, by the user's root
 * categories. Pure.
 */

import { I18n } from '~/lib/i18n';
import type { AlbumExpense, Category, TransactionWithRelations } from '~/types';

import {
  albumCategoryForCategory,
  albumCategoryIcon,
  albumCategoryId,
  type AlbumCategoryKey,
  albumCategoryLabel,
  type CategoryMap,
} from './albumCategories';

/** The row of an album's entries with no category. */
const UNCATEGORIZED_ROW = '__uncategorized__';

export interface AlbumCategoryRow {
  id: string;
  label: string;
  /** A category icon id, as `CategoryEmoji` draws it. */
  emoji: string;
  amount: number;
  count: number;
  /** The user's root category the row is (an album of their own), else null. */
  categoryRootId: string | null;
  transactions: TransactionWithRelations[];
}

/**
 * The group's category of each of the user's entries in a shared album: a
 * bill's own entry, and the entries its paid parts made.
 */
export function groupEntryCategories(
  bills: readonly AlbumExpense[],
  entries: readonly TransactionWithRelations[],
): Map<string, AlbumCategoryKey> {
  const byEntry = new Map<string, AlbumCategoryKey>();
  for (const bill of bills) byEntry.set(bill.id, bill.category);
  for (const entry of entries) {
    const category = byEntry.get(entry.id);
    if (!category || !entry.splits) continue;
    for (const split of entry.splits) {
      if (split.paidTransactionId) byEntry.set(split.paidTransactionId, category);
    }
  }
  return byEntry;
}

export interface AlbumBreakdownOptions {
  /** An entry's value on the page, or null to leave it out (one person's breakdown). */
  valueOf: (tx: TransactionWithRelations) => number | null;
  categories: readonly Category[];
  categoryById: ReadonlyMap<string, Category>;
  categoryMap?: CategoryMap;
  /** A shared album's categories by entry (`groupEntryCategories`); null for an album of the user's own. */
  groupCategories: ReadonlyMap<string, AlbumCategoryKey> | null;
}

/** The rows, biggest first. */
export function albumCategoryRows(
  entries: readonly TransactionWithRelations[],
  options: AlbumBreakdownOptions,
): AlbumCategoryRow[] {
  const { valueOf, categories, categoryById, categoryMap, groupCategories } = options;
  const rows = new Map<string, AlbumCategoryRow>();
  const add = (
    id: string,
    label: string,
    emoji: string,
    categoryRootId: string | null,
    tx: TransactionWithRelations,
    amount: number,
  ) => {
    const row = rows.get(id);
    if (row) {
      row.amount += amount;
      row.count += 1;
      row.transactions.push(tx);
      return;
    }
    rows.set(id, { id, label, emoji, amount, count: 1, categoryRootId, transactions: [tx] });
  };
  for (const tx of entries) {
    const amount = valueOf(tx);
    if (amount === null) continue;
    if (groupCategories) {
      const key =
        groupCategories.get(tx.id) ??
        albumCategoryForCategory(tx.categoryId, categories, categoryMap);
      add(albumCategoryId(key), albumCategoryLabel(key), albumCategoryIcon(key), null, tx, amount);
      continue;
    }
    const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
    if (!category) {
      // Counted in the album's line, so it has a row here too.
      add(UNCATEGORIZED_ROW, I18n.t('common.uncategorized'), '', null, tx, amount);
      continue;
    }
    const root = (category.parentId ? categoryById.get(category.parentId) : null) ?? category;
    add(root.id, root.name, root.icon, root.id, tx, amount);
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount);
}

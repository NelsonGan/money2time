/**
 * An album's spending by category, as its Breakdown and the Insights album
 * line show it (README: Key patterns > Albums). A shared album groups by its
 * own categories, the same for everyone in it (`albumCategories.ts`); an
 * album of the user's own, and one they no longer share, by the user's root
 * categories. Pure.
 */

import { I18n } from '~/lib/i18n';
import type { Category, TransactionWithRelations } from '~/types';

import {
  albumCategoryForCategory,
  albumCategoryIcon,
  albumCategoryId,
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

export interface AlbumBreakdownOptions {
  /** An entry's value on the page, or null to leave it out (one person's breakdown). */
  valueOf: (tx: TransactionWithRelations) => number | null;
  categories: readonly Category[];
  categoryById: ReadonlyMap<string, Category>;
  categoryMap?: CategoryMap;
  /**
   * A shared album, or one the user is no longer in: by its own categories
   * (each entry's `albumCategory`, else what its own category reads as).
   * Otherwise by the user's root categories.
   */
  byAlbumCategory: boolean;
}

/** The rows, biggest first. */
export function albumCategoryRows(
  entries: readonly TransactionWithRelations[],
  options: AlbumBreakdownOptions,
): AlbumCategoryRow[] {
  const { valueOf, categories, categoryById, categoryMap, byAlbumCategory } = options;
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
    if (byAlbumCategory) {
      const key =
        tx.albumCategory ?? albumCategoryForCategory(tx.categoryId, categories, categoryMap);
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

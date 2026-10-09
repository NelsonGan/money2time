import type { Category, CategoryType } from '~/types';
import { resolveCategoryIcon } from '~/utils/categoryIcons';

export interface InsightsCategoryPickerItem {
  id: string;
  name: string;
  icon: string;
}

export interface InsightsCategoryPickerData {
  parents: InsightsCategoryPickerItem[];
  childByParent: Map<string, InsightsCategoryPickerItem[]>;
}

/**
 * The parent/child shape `CategoryPickerSheet` takes, for one category type.
 *
 * Shared by every insights surface that offers a category exclusion picker —
 * the insights filter modal and the review filter sheet — so the two cannot
 * drift on icon inheritance (a child with no icon of its own falls back to its
 * parent's).
 */
export function buildInsightsCategoryPickerData(
  categories: Category[],
  categoryType: CategoryType,
): InsightsCategoryPickerData {
  const parentCategories = categories.filter(
    (category) => category.type === categoryType && category.parentId === null,
  );
  const parentIds = new Set(parentCategories.map((parent) => parent.id));
  const parentIconById = new Map<string, string>();
  parentCategories.forEach((category) => {
    parentIconById.set(category.id, category.icon);
  });
  const parents = parentCategories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: resolveCategoryIcon(category.icon),
  }));
  const childByParent = new Map<string, InsightsCategoryPickerItem[]>();

  categories.forEach((category) => {
    const parentId = category.parentId;
    if (category.type !== categoryType || !parentId || !parentIds.has(parentId)) return;
    const existing = childByParent.get(parentId);
    const child = {
      id: category.id,
      name: category.name,
      icon: resolveCategoryIcon(category.icon, parentIconById.get(parentId) ?? null),
    };
    if (existing) {
      existing.push(child);
    } else {
      childByParent.set(parentId, [child]);
    }
  });

  return { parents, childByParent };
}

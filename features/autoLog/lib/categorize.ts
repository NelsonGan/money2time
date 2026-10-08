import { findFallbackCategory } from '~/features/transactions/lib/entryDefaults';
import type { Category, PaymentAlertCategoryOrigin, PaymentAlertKind } from '~/types';

export interface CategoryInput {
  kind: PaymentAlertKind;
  scannedCategory: string | null;
  presetCategoryId: string | null;
  categories: readonly Category[];
  defaultExpenseCategoryId: string | null;
  defaultIncomeCategoryId: string | null;
}
export interface CategoryResolution {
  categoryId: string | null;
  origin: PaymentAlertCategoryOrigin | null;
}

/** Explicit category, scanner selection, type-specific default, then fallback. */
export function resolveAlertCategory(input: CategoryInput): CategoryResolution {
  const type = input.kind === 'income' ? 'income' : input.kind === 'spend' ? 'expense' : null;
  if (!type) return { categoryId: null, origin: null };
  const candidates = input.categories.filter(
    (category) => category.type === type && !category.deletedAt,
  );
  const valid = (id: string | null) =>
    id && candidates.some((category) => category.id === id) ? id : null;
  const preset = valid(input.presetCategoryId);
  if (preset) return { categoryId: preset, origin: 'preset' };
  const name = input.scannedCategory?.trim().toLowerCase();
  const scanned = name
    ? candidates.find((category) => category.name.trim().toLowerCase() === name)
    : null;
  if (scanned) return { categoryId: scanned.id, origin: 'scanner' };
  const defaultId = valid(
    type === 'income' ? input.defaultIncomeCategoryId : input.defaultExpenseCategoryId,
  );
  if (defaultId) return { categoryId: defaultId, origin: 'default' };
  const fallback = findFallbackCategory(candidates, type);
  return { categoryId: fallback?.id ?? null, origin: fallback ? 'fallback' : null };
}

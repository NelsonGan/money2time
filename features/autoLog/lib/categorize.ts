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

/** Explicit automation category, worker category, default, then same-type fallback. */
export function resolveAlertCategory(input: CategoryInput): CategoryResolution {
  if (input.kind !== 'spend' && input.kind !== 'income') return { categoryId: null, origin: null };
  const type = input.kind === 'income' ? 'income' : 'expense';
  const candidates = input.categories.filter(
    (category) => category.type === type && !category.deletedAt,
  );
  const valid = (id: string | null) =>
    id && candidates.some((category) => category.id === id) ? id : null;
  const preset = valid(input.presetCategoryId);
  if (preset) return { categoryId: preset, origin: 'preset' };
  const wanted = input.scannedCategory?.trim().toLowerCase();
  const matched = wanted
    ? candidates.find((category) => category.name.trim().toLowerCase() === wanted)
    : null;
  if (matched) return { categoryId: matched.id, origin: 'ai' };
  const defaultId = valid(
    type === 'income' ? input.defaultIncomeCategoryId : input.defaultExpenseCategoryId,
  );
  if (defaultId) return { categoryId: defaultId, origin: 'default' };
  const fallback = findFallbackCategory(candidates, type);
  return { categoryId: fallback?.id ?? null, origin: fallback ? 'fallback' : null };
}

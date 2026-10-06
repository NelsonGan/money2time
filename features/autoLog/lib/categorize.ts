import { findFallbackCategory } from '~/features/transactions/lib/entryDefaults';
import type { Category, PaymentAlertCategoryOrigin, PaymentAlertKind } from '~/types';

export interface CategoryLookups {
  keyword: (text: string, candidates: readonly Category[]) => string | null;
}

export interface CategoryInput {
  kind: PaymentAlertKind;
  counterparty: string | null;
  presetCategoryId: string | null;
  categories: readonly Category[];
  defaultExpenseCategoryId: string | null;
  autoCategorizeByMerchant: boolean;
}

export interface CategoryResolution {
  categoryId: string | null;
  origin: PaymentAlertCategoryOrigin | null;
}

/** Same preset, keyword, default and fallback order as Apple Pay. */
export function resolveAlertCategory(
  input: CategoryInput,
  lookups: CategoryLookups,
): CategoryResolution {
  if (input.kind !== 'spend') return { categoryId: null, origin: null };
  const candidates = input.categories.filter(
    (category) => category.type === 'expense' && !category.deletedAt,
  );
  const valid = (id: string | null) =>
    id && candidates.some((category) => category.id === id) ? id : null;
  const preset = valid(input.presetCategoryId);
  if (preset) return { categoryId: preset, origin: 'preset' };
  const keyword =
    input.autoCategorizeByMerchant && input.counterparty
      ? valid(lookups.keyword(input.counterparty, candidates))
      : null;
  if (keyword) return { categoryId: keyword, origin: 'keyword' };
  const defaultId = valid(input.defaultExpenseCategoryId);
  if (defaultId) return { categoryId: defaultId, origin: 'default' };
  const fallback = findFallbackCategory(candidates, 'expense');
  return { categoryId: fallback?.id ?? null, origin: fallback ? 'fallback' : null };
}

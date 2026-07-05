import { useCallback, useMemo, useState } from 'react';

import { parseAllocationAmount } from '~/features/budget/components/AllocationEditor';
import {
  computeAllocationRemaining,
  computeChildAllocationGap,
} from '~/features/budget/lib/budgetMath';
import type { Category } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';

/** Params for the full-page per-category allocation editor. */
export interface OpenCategoryAllocationParams {
  categoryId: string;
  initialAmounts: Record<string, string>;
  remainingExcludingThis: number;
  onDone: (amounts: Record<string, string>) => void;
}

/**
 * Shared draft state for the template and month-budget editors: the total,
 * per-category amount strings, and the derived validation — root allocations
 * must sum exactly to the total, and each parent's subcategory breakdown (when
 * any child is allocated) must sum exactly to the parent.
 */
export function useAllocationDraft({
  categories,
  initialTotal,
  initialAmounts,
  onOpenCategoryAllocation,
}: {
  categories: Category[];
  initialTotal: string;
  /** Lazy so the seed lines are only flattened once, on first render. */
  initialAmounts: () => Record<string, string>;
  onOpenCategoryAllocation: (params: OpenCategoryAllocationParams) => void;
}) {
  const rootExpenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && !category.parentId),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const category of categories) {
      if (category.type !== 'expense' || !category.parentId) continue;
      const list = map.get(category.parentId) ?? [];
      list.push(category);
      map.set(category.parentId, list);
    }
    return map;
  }, [categories]);

  const [total, setTotal] = useState(initialTotal);
  const [amounts, setAmounts] = useState<Record<string, string>>(initialAmounts);

  const parsedTotal = parseAllocationAmount(total);

  // Only root allocations count toward the total; child allocations are a
  // breakdown *within* their parent and are validated per group.
  const rootAllocations = useMemo(
    () =>
      rootExpenseCategories
        .map((category) => ({
          categoryId: category.id,
          amount: parseAllocationAmount(amounts[category.id] ?? ''),
        }))
        .filter((allocation) => allocation.amount > 0),
    [amounts, rootExpenseCategories],
  );

  const remaining = computeAllocationRemaining(parsedTotal, rootAllocations);

  const childGaps = useMemo(() => {
    const gaps = new Map<string, number>();
    for (const allocation of rootAllocations) {
      const children = childrenByParent.get(allocation.categoryId) ?? [];
      if (children.length === 0) continue;
      const gap = computeChildAllocationGap(
        allocation.amount,
        children.map((child) => ({ amount: parseAllocationAmount(amounts[child.id] ?? '') })),
      );
      if (gap !== 0) gaps.set(allocation.categoryId, gap);
    }
    return gaps;
  }, [amounts, childrenByParent, rootAllocations]);

  const allocationsValid =
    parsedTotal > 0 && rootAllocations.length > 0 && remaining === 0 && childGaps.size === 0;

  // Pushes the full-page per-category editor with this category's draft slice;
  // Save there merges the slice back into the shared draft here.
  const openCategoryAllocation = useCallback(
    (categoryId: string) => {
      const initial: Record<string, string> = {
        [categoryId]: amounts[categoryId] ?? '',
      };
      for (const child of childrenByParent.get(categoryId) ?? []) {
        initial[child.id] = amounts[child.id] ?? '';
      }
      onOpenCategoryAllocation({
        categoryId,
        initialAmounts: initial,
        remainingExcludingThis: normalizeMoneyAmount(
          remaining + parseAllocationAmount(amounts[categoryId] ?? ''),
        ),
        onDone: (next) => setAmounts((previous) => ({ ...previous, ...next })),
      });
    },
    [amounts, childrenByParent, onOpenCategoryAllocation, remaining],
  );

  /** Root allocations plus any child breakdowns (already validated to sum to their parents). */
  const buildAllocations = useCallback(() => {
    const allocations = [...rootAllocations];
    for (const rootAllocation of rootAllocations) {
      for (const child of childrenByParent.get(rootAllocation.categoryId) ?? []) {
        const amount = parseAllocationAmount(amounts[child.id] ?? '');
        if (amount > 0) allocations.push({ categoryId: child.id, amount });
      }
    }
    return allocations;
  }, [amounts, childrenByParent, rootAllocations]);

  return {
    total,
    setTotal,
    parsedTotal,
    amounts,
    rootExpenseCategories,
    rootAllocations,
    remaining,
    childGaps,
    allocationsValid,
    openCategoryAllocation,
    buildAllocations,
  };
}

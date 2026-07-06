import type { OpenCategoryAllocationParams } from '~/features/budget/hooks/useAllocationDraft';

// The per-category allocation editor hands its result back through an `onDone`
// callback and receives a draft slice — both non-serializable. Passing them as
// navigation params triggers React Navigation's non-serializable-state warning
// and churns the navigation state (causing re-renders/flashes), so the hand-off
// rides this module-level bridge instead and the route carries no params.
let pending: OpenCategoryAllocationParams | null = null;

/** Stash the hand-off right before navigating to the allocation editor. */
export function setPendingCategoryAllocation(params: OpenCategoryAllocationParams) {
  pending = params;
}

/** Reads and clears the pending hand-off (null after a cold state restore). */
export function consumePendingCategoryAllocation(): OpenCategoryAllocationParams | null {
  const params = pending;
  pending = null;
  return params;
}

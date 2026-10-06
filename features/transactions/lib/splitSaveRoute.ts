// Pure save-routing decision for the transaction editor's split rows.
// No React Native imports — covered by __tests__/features/splitSaveRoute.test.ts.

import type { SplitRowLike } from './splitMath';

/**
 * - `splits`: save through the split writer with the editor's rows.
 * - `clear`: save through the split writer with no rows, so the splits the
 *   transaction was opened with are deleted.
 * - `plain`: save the transaction alone; there are no splits to write or remove.
 */
export type SplitSaveRoute = 'splits' | 'clear' | 'plain';

export interface SplitSaveRouteInput {
  splitMode: boolean;
  type: string;
  isRecurring: boolean;
  rows: SplitRowLike[];
  /** The transaction already had split rows when the editor opened. */
  hadPersistedSplits: boolean;
}

export function resolveSplitSaveRoute({
  splitMode,
  type,
  isRecurring,
  rows,
  hadPersistedSplits,
}: SplitSaveRouteInput): SplitSaveRoute {
  if (splitMode && type === 'expense' && !isRecurring && rows.some((row) => !row.isSelf)) {
    return 'splits';
  }
  // Removing every friend (or leaving expense) folds split mode off and empties
  // the rows, but the persisted rows are still on the transaction. A plain
  // update never touches them, so the bill would come back on the next open.
  return hadPersistedSplits ? 'clear' : 'plain';
}

/**
 * How a filter reads the ids picked for it.
 *
 * `exclude` drops what was picked and keeps everything else, which is the
 * long-standing behaviour and still the default. `include` inverts it: only
 * what was picked survives ("show me just my Ryt Bank account"). In both modes
 * an empty pick means the filter is off, so flipping the mode before picking
 * anything never empties the screen.
 */
export type SelectionFilterMode = 'exclude' | 'include';

export const DEFAULT_SELECTION_FILTER_MODE: SelectionFilterMode = 'exclude';

export function isSelectionFilterMode(value: unknown): value is SelectionFilterMode {
  return value === 'exclude' || value === 'include';
}

/**
 * Whether a row passes one filter, given the ids it can be matched on (a
 * category and its parent, or every account a transfer touches).
 *
 * Excluding drops the row when **any** of its ids was picked; including keeps
 * it when any was. A row with no ids at all (an uncategorized expense) cannot
 * have been picked, so excluding keeps it and including drops it.
 */
export function passesSelectionFilter(
  mode: SelectionFilterMode,
  picked: ReadonlySet<string>,
  ids: readonly (string | null | undefined)[],
): boolean {
  if (picked.size === 0) return true;
  const matched = ids.some((id) => id != null && picked.has(id));
  return mode === 'include' ? matched : !matched;
}

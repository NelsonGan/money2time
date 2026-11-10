/** Locale catalogue plural convention. */
export function countKey(base: string, count: number): string {
  return count === 1 ? `${base}_one` : `${base}_other`;
}

/**
 * The home review banner shows while a review runs, or while it has a pending
 * item or auto-review result that its X has not cleared. X clears the ids it
 * counted, so a notification arriving later brings the banner back.
 */
export function isReviewBannerVisible(
  reviewing: number,
  pendingIds: readonly string[],
  aiIds: readonly string[],
  dismissed: ReadonlySet<string> | null,
): boolean {
  const cleared = (id: string) => dismissed?.has(id) ?? false;
  return reviewing > 0 || pendingIds.some((id) => !cleared(id)) || aiIds.some((id) => !cleared(id));
}

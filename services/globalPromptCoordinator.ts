/**
 * In-memory coordinator that tracks which transient, full-screen "nudge"
 * overlays are currently on screen (feature announcement, review pre-prompt,
 * tutorial prompt, cloud-backup prompt, …).
 *
 * Why this exists: presenting two React Native `Modal`s at the same time can
 * deadlock the iOS touch system and freeze the whole page. Existing overlays
 * simply *report* their visibility here; a new, lower-priority overlay can
 * consult `isAnyPromptVisible()` and yield rather than stacking on top. This is
 * intentionally reporting-only — it never blocks an existing overlay from
 * showing, so wiring it up cannot regress current behavior.
 */

export type GlobalPromptId =
  | 'featureAnnouncement'
  | 'reviewPrePrompt'
  | 'tutorialPrompt'
  | 'cloudBackupPrompt';

const visiblePrompts = new Set<GlobalPromptId>();

export function markPromptVisible(id: GlobalPromptId): void {
  visiblePrompts.add(id);
}

export function markPromptHidden(id: GlobalPromptId): void {
  visiblePrompts.delete(id);
}

/**
 * True if any tracked prompt other than `excludeId` is currently visible. Pass
 * the caller's own id so an overlay re-checking itself doesn't see itself.
 */
export function isAnyPromptVisible(excludeId?: GlobalPromptId): boolean {
  if (excludeId === undefined) return visiblePrompts.size > 0;
  for (const id of visiblePrompts) {
    if (id !== excludeId) return true;
  }
  return false;
}

/** Test-only: clear all tracked state between cases. */
export function resetGlobalPromptCoordinator(): void {
  visiblePrompts.clear();
}

/**
 * In-memory coordinator that tracks which transient, full-screen "nudge"
 * overlays are currently on screen (feature announcement, review pre-prompt,
 * cloud-backup prompt, …).
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
  | 'cloudBackupPrompt'
  | 'cloudSyncPrompt'
  | 'locationsOffer'
  | 'goalCelebration'
  | 'loanCelebration';

const visiblePrompts = new Set<GlobalPromptId>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function markPromptVisible(id: GlobalPromptId): void {
  if (visiblePrompts.has(id)) return;
  visiblePrompts.add(id);
  notify();
}

export function markPromptHidden(id: GlobalPromptId): void {
  if (!visiblePrompts.delete(id)) return;
  notify();
}

/**
 * Called whenever a prompt reports showing or hiding, so one that is waiting
 * its turn (the one-time Locations offer) can try again as soon as the screen
 * is free rather than give up.
 */
export function subscribePromptChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  listeners.clear();
}

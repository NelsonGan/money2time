import * as Haptics from 'expo-haptics';

export type HapticKind =
  | 'none'
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

const SELECTION_HAPTIC_DEDUPE_WINDOW_MS = 80;
let lastSelectionHapticAtMs = 0;

export async function triggerHaptic(kind: HapticKind) {
  if (kind === 'none') return;

  if (kind === 'selection') {
    const now = Date.now();
    if (now - lastSelectionHapticAtMs < SELECTION_HAPTIC_DEDUPE_WINDOW_MS) {
      return;
    }
    lastSelectionHapticAtMs = now;
  }

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics can fail on unsupported targets (simulator/web); ignore safely.
  }
}

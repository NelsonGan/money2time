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
const GLOBAL_HAPTIC_DEDUPE_WINDOW_MS = 140;
const NAVIGATION_HAPTIC_SUPPRESS_WINDOW_MS = 180;
let lastSelectionHapticAtMs = 0;
let lastHapticAtMs = 0;

export async function triggerHaptic(kind: HapticKind) {
  if (kind === 'none') return;

  const now = Date.now();
  if (now - lastHapticAtMs < GLOBAL_HAPTIC_DEDUPE_WINDOW_MS) {
    return;
  }
  if (kind === 'selection') {
    if (now - lastSelectionHapticAtMs < SELECTION_HAPTIC_DEDUPE_WINDOW_MS) {
      return;
    }
    lastSelectionHapticAtMs = now;
  }
  lastHapticAtMs = now;

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics can fail on unsupported targets (simulator/web); ignore safely.
  }
}

export async function triggerNavigationHaptic() {
  const now = Date.now();
  if (now - lastHapticAtMs < NAVIGATION_HAPTIC_SUPPRESS_WINDOW_MS) {
    return;
  }
  await triggerHaptic('selection');
}

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

export async function triggerHaptic(kind: HapticKind) {
  if (kind === 'none') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics can fail on unsupported targets (simulator/web); ignore safely.
  }
}

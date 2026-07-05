import type { AppStateStatus } from 'react-native';

/**
 * Decide whether an `AppState` transition should force any focused text input to
 * blur (via `Keyboard.dismiss()`).
 *
 * Background: on the React Native New Architecture (Fabric), leaving a
 * `TextInput` as first responder when the app is torn down to the background
 * lets the runtime scheduler queue a `blur` event that is delivered *after* iOS
 * has already deallocated the native view backing that input — a dangling
 * pointer that surfaces as `EXC_BAD_ACCESS: blur >` inside
 * `RuntimeScheduler_Modern::runEventLoopTick` (Sentry MONEY2TIME-6). Blurring
 * synchronously while the view hierarchy is still alive removes the queued
 * event, so there is nothing to deliver against a freed view.
 *
 * We act on `background` (a genuine background trip) rather than the earlier
 * `inactive` state so a transient interruption that never fully backgrounds the
 * app — pulling down Control/Notification Center, or the system biometric sheet
 * — does not needlessly dismiss the keyboard mid-entry.
 */
export function shouldDismissKeyboardForAppState(next: AppStateStatus): boolean {
  return next === 'background';
}

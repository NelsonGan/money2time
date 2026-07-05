import { useEffect } from 'react';
import { AppState, Keyboard } from 'react-native';

import { shouldDismissKeyboardForAppState } from '~/utils/appLifecycle';

/**
 * Renders nothing. Forces any focused `TextInput` to blur the moment the app is
 * sent to the background, so the New Architecture runtime scheduler never queues
 * a `blur` event that would later be delivered against a native view iOS has
 * already deallocated.
 *
 * Guards against `EXC_BAD_ACCESS: blur >` in
 * `RuntimeScheduler_Modern::runEventLoopTick` (Sentry MONEY2TIME-6). See
 * `shouldDismissKeyboardForAppState` for why we act on `background` only.
 */
export function KeyboardDismissOnBackground(): null {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (shouldDismissKeyboardForAppState(next)) {
        Keyboard.dismiss();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

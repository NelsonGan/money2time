import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { isAutoLogSupported } from '~/services/autoLog';
import { reportError } from '~/services/errorReporting';

import { promptForAutoLogLimit } from '../limitPaywall';

/**
 * How long the app must have been in front, with the gate open, before the
 * paywall is pushed. On a cold start the root screen counts as settled from the
 * first render and the navigator may still remount (its key follows the
 * locale), and a push in that window was lost: the request went out but no
 * paywall showed. On a foreground it keeps the push out of the resume animation.
 */
const PROMPT_DELAY_MS = 1500;

/**
 * Opens the paywall after the iOS Log Card Payment automation refused a payment
 * at the free limit (see `features/autoLog/lib/limitPrompt.ts`). It is an
 * app-level prompt like the announcements and the Cloud Backup prompt, so it
 * waits for the same gate: `allowed` is false behind the biometric lock, over a
 * modal route that is still presenting or dismissing, while another prompt
 * shows (stacking two native modals has frozen the app before) and until the
 * navigator is ready. It also waits for a confirmed Pro status, so the `false`
 * placeholder RevenueCat starts with can never show it to a Pro member. Renders
 * nothing.
 */
export function AutoLogLimitPrompt({ allowed }: { allowed: boolean }) {
  const { quickEntryPrefs } = useApp();
  const { isPro, isStatusKnown } = usePro();
  const ready = allowed && isStatusKnown && isAutoLogSupported();

  const latest = useRef({ isPro, usedAutoLogs: quickEntryPrefs.autoLogUsageCount });
  latest.current = { isPro, usedAutoLogs: quickEntryPrefs.autoLogUsageCount };
  const runningRef = useRef(false);

  useEffect(() => {
    if (!ready) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      void promptForAutoLogLimit(latest.current)
        .catch(reportError)
        .finally(() => {
          runningRef.current = false;
        });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (AppState.currentState === 'active') check();
      }, PROMPT_DELAY_MS);
    };
    // Once when the gate opens (launch, a closed modal), then on every
    // foreground: the automation runs while the app is in the background.
    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
      else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  return null;
}

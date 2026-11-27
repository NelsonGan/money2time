import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { reportError } from '~/services/errorReporting';
import { isAnyPromptVisible } from '~/services/globalPromptCoordinator';

import { promptPaywallIfDue } from '../paywallReprompt';

/**
 * How long the app must have been in front, with the gate open, before the
 * paywall is pushed. Longer than `AutoLogLimitPrompt`'s 1.5 s, so when both are
 * due the auto-log paywall goes first, closes this gate (the paywall is a
 * modal route) and restarts the clock.
 */
const PROMPT_DELAY_MS = 2500;

/**
 * Shows the paywall to a free member every three days (paywall source
 * `periodic`; see `features/settings/lib/paywallReprompt.ts`). An app-level
 * prompt like the announcements: `allowed` is false behind the biometric lock,
 * over a modal route, while another prompt shows and until the navigator is
 * ready, and when the timer fires it also yields to any prompt the global
 * prompt coordinator reports. It waits for a confirmed Pro status, so the
 * `false` placeholder RevenueCat starts with can never show it to a Pro member.
 * Renders nothing.
 */
export function PaywallRepromptHost({ allowed }: { allowed: boolean }) {
  const { settings } = useApp();
  const { isPro, isStatusKnown } = usePro();
  const onboardingCompleted = !!settings.onboardingCompleted;
  const ready = allowed && isStatusKnown && !isPro && onboardingCompleted;
  const latest = useRef({ isPro, isStatusKnown, onboardingCompleted });
  latest.current = { isPro, isStatusKnown, onboardingCompleted };
  const runningRef = useRef(false);

  useEffect(() => {
    if (!ready) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      void promptPaywallIfDue(latest.current)
        .catch(reportError)
        .finally(() => {
          runningRef.current = false;
        });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (AppState.currentState === 'active' && !isAnyPromptVisible()) check();
      }, PROMPT_DELAY_MS);
    };
    // Once when the gate opens (launch, a closed modal), then on every foreground.
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

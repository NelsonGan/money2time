import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestOpenPaywall } from '~/services/paywallNavigation';

import { decidePaywallReprompt, PAYWALL_REPROMPT_SOURCE } from './lib/paywallReprompt';

/** Epoch-ms any paywall last opened on this phone (device-local). */
const LAST_SHOWN_KEY = 'paywall-last-shown-at';

async function readLastShownAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Every paywall calls this when it opens: any paywall restarts the clock. */
export async function markPaywallShown(now = Date.now()): Promise<void> {
  await AsyncStorage.setItem(LAST_SHOWN_KEY, String(now)).catch(() => undefined);
}

/**
 * Opens the paywall when the last one was three or more days ago (see
 * `lib/paywallReprompt.ts`). `PaywallRepromptHost` calls it on launch and on
 * every foreground once app-level prompts are allowed.
 */
export async function promptPaywallIfDue(
  input: {
    isPro: boolean;
    hasRenewingSubscription: boolean;
    isStatusKnown: boolean;
    onboardingCompleted: boolean;
  },
  now = Date.now(),
): Promise<void> {
  const decision = decidePaywallReprompt({ ...input, lastShownAt: await readLastShownAt(), now });
  if (decision === 'start_clock') {
    await markPaywallShown(now);
    return;
  }
  if (decision !== 'prompt') return;
  // The paywall marks itself shown when it opens; nothing to record here.
  requestOpenPaywall(PAYWALL_REPROMPT_SOURCE);
}

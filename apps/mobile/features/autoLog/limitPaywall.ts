import AsyncStorage from '@react-native-async-storage/async-storage';

import { PRO_LIMITS } from '~/constants/proLimits';
import { I18n } from '~/lib/i18n';
import { clearAutoLogLimitBlocked, readAutoLogLimitBlocked } from '~/services/autoLog';
import { requestOpenPaywall } from '~/services/paywallNavigation';

import { decideAutoLogLimitPrompt } from './lib/limitPrompt';

/** Paywall source for payments the automation refused at the free limit. */
export const AUTO_LOG_LIMIT_PAYWALL_SOURCE = 'autolog';

/** Epoch-ms the paywall last opened for this reason (device-local). */
const LAST_PROMPT_KEY = 'autolog-limit-paywall-shown-at';

async function readLastPromptAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * What a refused payment was refused for. The intent only knows it had nothing
 * `remaining`, which is also the case for a free member over the free account
 * limit (a lapsed Pro member): that one gets the accounts paywall, not a claim
 * that their automatic logs are used up.
 */
export function autoLogLimitPaywall(usedAutoLogs: number): {
  source: string;
  message: string;
} {
  if (usedAutoLogs >= PRO_LIMITS.FREE_MAX_AUTO_LOGS) {
    return {
      source: AUTO_LOG_LIMIT_PAYWALL_SOURCE,
      message: I18n.t('pro.limit_autolog', { count: PRO_LIMITS.FREE_MAX_AUTO_LOGS }),
    };
  }
  return {
    source: 'accounts_transaction',
    message: I18n.t('pro.limit_accounts', { count: PRO_LIMITS.FREE_MAX_ACCOUNTS }),
  };
}

/**
 * Open the paywall if the Shortcut refused a payment since the last time, see
 * `lib/limitPrompt.ts`. `AutoLogLimitPrompt` calls it on every foreground once
 * the Pro status is confirmed and app-level prompts are allowed. The record is
 * only dropped once the paywall has actually been requested, so a foreground
 * that races the navigator's mount tries again on the next one.
 */
export async function promptForAutoLogLimit(
  input: { isPro: boolean; usedAutoLogs: number },
  now = Date.now(),
): Promise<void> {
  const blocked = await readAutoLogLimitBlocked();
  if (!blocked) return;
  const decision = decideAutoLogLimitPrompt({
    isPro: input.isPro,
    blocked,
    lastPromptAt: await readLastPromptAt(),
    now,
  });
  if (decision === 'clear') {
    await clearAutoLogLimitBlocked();
    return;
  }
  if (decision !== 'prompt') return;

  const { source, message } = autoLogLimitPaywall(input.usedAutoLogs);
  if (!requestOpenPaywall(source, message)) return;
  await AsyncStorage.setItem(LAST_PROMPT_KEY, String(now)).catch(() => undefined);
  await clearAutoLogLimitBlocked();
}

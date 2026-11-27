import AsyncStorage from '@react-native-async-storage/async-storage';

import { I18n } from '~/lib/i18n';
import {
  cancelTrialReminder,
  getPermissionStatus,
  PRO_MANAGEMENT_URL,
  scheduleTrialReminder,
} from '~/services/notifications';
import type { RevenueCatCustomerState } from '~/services/revenueCat';
import { formatWeekdayMonthDay } from '~/utils/formatters';

import {
  TRIAL_REMINDER_LEAD_DAYS,
  trialReminderDateForCustomer,
  withoutDoubledStop,
} from './lib/trialTimeline';

/**
 * Keeps the one reminder before a free trial's first charge in step with what
 * the store says (README › Trial-aware paywall › Trial timeline and reminder).
 * `ProProvider` calls it with every customer state it settles on, so a trial
 * that starts schedules it, and one the user cancels, converts or loses
 * cancels it, whichever phone or store screen made the change.
 */

/** The price the paywall showed for the trial's plan, kept for the reminder's copy. */
const TRIAL_PRICE_KEY = 'pro-trial-reminder-price';

interface StoredTrialPrice {
  productIdentifier: string;
  priceLabel: string;
}

/** Remember what the trial will cost, for the reminder that names it. */
export async function rememberTrialPrice(
  productIdentifier: string,
  priceLabel: string,
): Promise<void> {
  const value: StoredTrialPrice = { productIdentifier, priceLabel };
  await AsyncStorage.setItem(TRIAL_PRICE_KEY, JSON.stringify(value)).catch(() => undefined);
}

async function readTrialPrice(productIdentifier: string | null): Promise<string | null> {
  if (!productIdentifier) return null;
  try {
    const raw = await AsyncStorage.getItem(TRIAL_PRICE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredTrialPrice>;
    return value.productIdentifier === productIdentifier && typeof value.priceLabel === 'string'
      ? value.priceLabel
      : null;
  } catch {
    return null;
  }
}

/** What was last scheduled, so an unchanged state does not reschedule. */
let scheduledKey: string | null = null;

/**
 * Forget what was scheduled, for a caller that cancelled every notification
 * (a full data reset), so the next sync schedules the reminder again.
 */
export function forgetScheduledTrialReminder(): void {
  scheduledKey = null;
}

export async function syncTrialReminder(
  state: RevenueCatCustomerState | null,
  now = new Date(),
): Promise<void> {
  const remindAt = trialReminderDateForCustomer(state, now);
  if (!remindAt || !state?.expirationDate) {
    if (scheduledKey !== 'none') {
      await cancelTrialReminder();
      scheduledKey = 'none';
    }
    return;
  }
  if ((await getPermissionStatus()) !== 'granted') return;

  const price = await readTrialPrice(state.activeProductIdentifier);
  const date = formatWeekdayMonthDay(new Date(state.expirationDate));
  const key = `${remindAt.getTime()}|${state.expirationDate}|${price ?? ''}|${I18n.locale}`;
  if (key === scheduledKey) return;
  await scheduleTrialReminder(remindAt, {
    title: I18n.t('notifications.content.trial_ending_title', { count: TRIAL_REMINDER_LEAD_DAYS }),
    body: withoutDoubledStop(
      price
        ? I18n.t('notifications.content.trial_ending_body_price', { date, price })
        : I18n.t('notifications.content.trial_ending_body', { date }),
      date,
    ),
    url: PRO_MANAGEMENT_URL,
  });
  scheduledKey = key;
}

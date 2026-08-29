import { I18n } from '~/lib/i18n';
import {
  getLiveActivityPushToStartToken,
  getLiveActivityStatus,
  isLiveActivityAvailable,
} from '~/services/liveActivity';
import {
  registerLiveEarningsSchedule,
  unregisterLiveEarningsSchedule,
} from '~/services/liveEarningsPush';
import { scheduleLiveEarningsStart } from '~/services/notifications';
import type { LiveEarningsSchedule } from '~/types';
import { formatCurrency, formatTimeOfDay } from '~/utils/formatters';

import type { LiveEarningsAccent } from './liveEarningsAccent';
import {
  buildScheduleRegistration,
  scheduledSessionTotal,
  scheduleEndClock,
} from './liveEarningsSchedule';

/**
 * Decides, and applies, how the user's shift schedule actually starts the
 * clock: on its own, or by asking.
 *
 * There are two mechanisms and only one of them may be armed at a time, which
 * is the whole reason this lives in one function rather than in the two
 * services it drives:
 *
 *  - **Push-to-start** (iOS 17.2+). The device has handed the app a token for
 *    the activity *type*, the shift is registered against it, and the Worker
 *    raises the card at the right local minute with nothing tapped and the app
 *    not running. This is the real feature.
 *  - **A local notification**, for everything else: iOS below 17.2, or a token
 *    the OS has not minted. `Activity.request()` is foreground-only, so the
 *    reminder is the most an app can do by itself, and one tap starts the clock.
 *
 * Arming both would give someone a notification for a card that is already on
 * their Lock Screen, so whichever path wins cancels the other.
 *
 * Every call is best-effort: the registration swallows its own failures and
 * the worst case is a schedule that falls back to the reminder it replaced.
 */

export type LiveEarningsAutoStartMode =
  /** Nothing armed: no schedule, no wage, or Live Activities are unavailable. */
  | 'off'
  /** The Worker will raise the card by itself. */
  | 'push'
  /** A local notification will fire and the user taps to start. */
  | 'reminder';

export interface SyncLiveEarningsAutoStartArgs {
  schedule: LiveEarningsSchedule;
  /** The rate the shift will accrue at. Zero means no wage is set yet. */
  hourlyRate: number;
  currencySymbol: string;
  accent: LiveEarningsAccent;
  /** Identifies the account to the push Worker. */
  appUserId: string;
}

export async function syncLiveEarningsAutoStart({
  schedule,
  hourlyRate,
  currencySymbol,
  accent,
  appUserId,
}: SyncLiveEarningsAutoStartArgs): Promise<LiveEarningsAutoStartMode> {
  // Android, web, or an iOS build made before the Live Activity target existed.
  // A reminder to start something the device cannot show is worse than nothing.
  if (!isLiveActivityAvailable) {
    await scheduleLiveEarningsStart(schedule, { pushStartArmed: true });
    return 'off';
  }

  const status = await getLiveActivityStatus();
  // Live Activities switched off for Money2Time in iOS Settings disarms both
  // paths, not just the push: tapping a reminder could not start a card either.
  const wanted = schedule.enabled && schedule.days.length > 0 && hourlyRate > 0 && status.enabled;

  if (!wanted) {
    await scheduleLiveEarningsStart(schedule, { pushStartArmed: true });
    // Named by the push service from the token it remembers arming, not by the
    // one the OS is offering now: switching Live Activities off is one of the
    // reasons to be here and it takes that token with it. It is also how this
    // stays free for the many users who never turn auto-start on - with
    // nothing armed there is nothing to send.
    await unregisterLiveEarningsSchedule(appUserId);
    return 'off';
  }

  const token = await getLiveActivityPushToStartToken();
  if (!token) {
    // No token: iOS below 17.2, or one that has not been minted yet. Nothing
    // was ever registered from this device, so there is nothing to clear -
    // and clearing by account would disarm the user's *other* phone.
    await scheduleLiveEarningsStart(schedule, { pushStartArmed: false });
    return 'reminder';
  }

  const endClock = scheduleEndClock(schedule);
  await registerLiveEarningsSchedule(
    appUserId,
    buildScheduleRegistration({
      schedule,
      hourlyRate,
      currencySymbol,
      timeZone: deviceTimeZone(),
      pushToStartToken: token,
      accent,
      formatAmount: (value) => formatCurrency(value, currencySymbol),
      copy: {
        titleText: I18n.t('widgets.live.headline'),
        rateText: I18n.t('widgets.live.rate', {
          amount: formatCurrency(hourlyRate, currencySymbol),
        }),
        endsText: I18n.t('widgets.live.ends_at', {
          time: formatTimeOfDay(endClock.hour, endClock.minute),
        }),
        totalText: I18n.t('widgets.live.of_total', {
          total: formatCurrency(scheduledSessionTotal(schedule, hourlyRate), currencySymbol),
        }),
        refreshText: I18n.t('widgets.live.refresh'),
        // A start push must carry an alert. On iPhone the card appearing is
        // the notice; this is what a paired Apple Watch shows.
        alertTitle: I18n.t('notifications.content.live_earnings_started_title'),
        alertBody: I18n.t('notifications.content.live_earnings_started_body'),
      },
    }),
  );
  await scheduleLiveEarningsStart(schedule, { pushStartArmed: true });
  return 'push';
}

/**
 * The zone the shift's wall-clock time is read in.
 *
 * Registered rather than resolved server-side because only the device knows
 * it, and re-registered on every foreground so someone who travels takes their
 * schedule with them - until then it keeps firing on the zone they left, which
 * is the same thing every alarm clock does.
 */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

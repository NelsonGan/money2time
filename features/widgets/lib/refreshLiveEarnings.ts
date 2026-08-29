import { I18n } from '~/lib/i18n';
import {
  endLiveActivity,
  getCurrentLiveActivity,
  updateLiveActivity,
} from '~/services/liveActivity';
import { registerLiveEarningsPush, unregisterLiveEarningsPush } from '~/services/liveEarningsPush';
import { writeLiveEarningsWidget } from '~/services/liveEarningsWidget';
import { formatCurrency, formatTimeOfDay } from '~/utils/formatters';

import { earnedByNow, isSessionOver, type LiveEarningsSession } from './liveEarnings';
import type { LiveEarningsAccent } from './liveEarningsAccent';
import { buildLiveEarningsWidgetPayload } from './liveEarningsWidget';

/**
 * Rewrites the live-earnings widget's timeline for `session`, or clears it
 * when nothing is running.
 *
 * Called from every place the activity itself changes, so the two surfaces
 * never disagree. Rewriting on an unchanged session is not waste: the timeline
 * is bounded, so a long shift gets a fresh run of entries each time the app is
 * opened.
 */
export async function syncLiveEarningsWidget(
  session: LiveEarningsSession | null,
  currencySymbol: string,
  accent: LiveEarningsAccent,
): Promise<void> {
  const endsAtDate = session ? new Date(session.endsAt) : null;
  await writeLiveEarningsWidget(
    buildLiveEarningsWidgetPayload({
      session,
      accent,
      now: Date.now(),
      formatAmount: (value) => formatCurrency(value, currencySymbol),
      copy: {
        idleText: I18n.t('widgets.live.widget_idle'),
        rateText: session
          ? I18n.t('widgets.live.rate', {
              amount: formatCurrency(session.hourlyRate, currencySymbol),
            })
          : '',
        endsText: endsAtDate
          ? I18n.t('widgets.live.ends_at', {
              time: formatTimeOfDay(endsAtDate.getHours(), endsAtDate.getMinutes()),
            })
          : '',
      },
    }),
  );
}

export interface RefreshLiveEarningsArgs {
  currencySymbol: string;
  accent: LiveEarningsAccent;
  /** Identifies the account to the push Worker. */
  appUserId: string;
}

/**
 * Brings whatever Live Activity is running up to date, or ends it if its
 * session has run out, and re-syncs the widget and the push registration
 * either way.
 *
 * Reads the session straight from ActivityKit rather than taking it as an
 * argument: this runs from an app-level listener that has no screen state to
 * consult, and ActivityKit is the source of truth anyway since the activity
 * outlives any particular screen. That is also where the push token comes
 * from, and re-registering on every pass is how a token ActivityKit has
 * rotated mid-session gets picked up - the Worker upserts on it.
 *
 * Never throws - every call it makes swallows its own failures - so callers
 * can fire and forget from a lifecycle handler.
 */
export async function refreshLiveEarningsActivity({
  currencySymbol,
  accent,
  appUserId,
}: RefreshLiveEarningsArgs): Promise<void> {
  const current = await getCurrentLiveActivity();
  if (!current) {
    await syncLiveEarningsWidget(null, currencySymbol, accent);
    // Nothing on the Lock Screen to push to. Clears any row the Worker still
    // holds for this account, e.g. after the user swiped the card away.
    await unregisterLiveEarningsPush(appUserId);
    return;
  }

  const session: LiveEarningsSession = {
    startedAt: current.startedAt,
    endsAt: current.endsAt,
    hourlyRate: current.hourlyRate,
  };
  const now = Date.now();

  if (isSessionOver(session, now)) {
    await endLiveActivity();
    await unregisterLiveEarningsPush(appUserId, current.pushToken);
    // The widget keeps the session's final total rather than being cleared:
    // the shift is over, and what it came to is the answer worth leaving up.
    // It holds until the app next opens and finds nothing running, which is
    // when "Not tracking" becomes the truthful thing to say.
    await syncLiveEarningsWidget(session, currencySymbol, accent);
    return;
  }

  const earned = earnedByNow(session, now);
  await updateLiveActivity(formatCurrency(earned, currencySymbol), earned);
  await syncLiveEarningsWidget(session, currencySymbol, accent);
  // Upsert rather than register-once: this runs on launch and on every
  // foreground, so it doubles as the repair path for a registration that
  // failed while offline and for a rotated push token.
  if (current.pushToken) {
    await registerLiveEarningsPush({
      appUserId,
      pushToken: current.pushToken,
      session,
      currencySymbol,
    });
  }
}

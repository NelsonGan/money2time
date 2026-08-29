import { I18n } from '~/lib/i18n';
import {
  endLiveActivity,
  getCurrentLiveActivity,
  updateLiveActivity,
} from '~/services/liveActivity';
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
  const endsAt = session ? new Date(session.endsAt) : null;
  await writeLiveEarningsWidget(
    buildLiveEarningsWidgetPayload({
      session,
      accent,
      now: Date.now(),
      formatAmount: (value) => formatCurrency(value, currencySymbol),
      copy: {
        titleText: I18n.t('widgets.live.headline'),
        idleText: I18n.t('widgets.live.widget_idle'),
        rateText: session
          ? I18n.t('widgets.live.rate', {
              amount: formatCurrency(session.hourlyRate, currencySymbol),
            })
          : '',
        endsText: endsAt
          ? I18n.t('widgets.live.ends_at', {
              time: formatTimeOfDay(endsAt.getHours(), endsAt.getMinutes()),
            })
          : '',
      },
    }),
  );
}

/**
 * Brings whatever Live Activity is running up to date, or ends it if its
 * session has run out, and re-syncs the widget either way.
 *
 * Reads the session straight from ActivityKit rather than taking it as an
 * argument: this runs from an app-level listener that has no screen state to
 * consult, and ActivityKit is the source of truth anyway since the activity
 * outlives any particular screen.
 *
 * Never throws - every call it makes swallows its own failures - so callers
 * can fire and forget from a lifecycle handler.
 */
export async function refreshLiveEarningsActivity(
  currencySymbol: string,
  accent: LiveEarningsAccent,
): Promise<void> {
  const current = await getCurrentLiveActivity();
  if (!current) {
    await syncLiveEarningsWidget(null, currencySymbol, accent);
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
    // The widget is left showing the session's final total rather than being
    // cleared: the shift is over, and the last thing it earned is the answer
    // the user wants to see there.
    await syncLiveEarningsWidget(session, currencySymbol, accent);
    return;
  }

  const earned = earnedByNow(session, now);
  await updateLiveActivity(formatCurrency(earned, currencySymbol), earned);
  await syncLiveEarningsWidget(session, currencySymbol, accent);
}

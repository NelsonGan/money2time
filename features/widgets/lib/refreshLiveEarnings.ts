import {
  endLiveActivity,
  getCurrentLiveActivity,
  updateLiveActivity,
} from '~/services/liveActivity';
import { formatCurrency } from '~/utils/formatters';

import { earnedByNow, isSessionOver } from './liveEarnings';

/**
 * Brings whatever Live Activity is running up to date, or ends it if its
 * session has run out.
 *
 * Reads the session straight from ActivityKit rather than taking it as an
 * argument: this runs from an app-level listener that has no screen state to
 * consult, and ActivityKit is the source of truth anyway since the activity
 * outlives any particular screen.
 *
 * Never throws - every call it makes swallows its own failures - so callers
 * can fire and forget from a lifecycle handler.
 */
export async function refreshLiveEarningsActivity(currencySymbol: string): Promise<void> {
  const current = await getCurrentLiveActivity();
  if (!current) return;

  const session = {
    startedAt: current.startedAt,
    endsAt: current.endsAt,
    hourlyRate: current.hourlyRate,
  };
  const now = Date.now();

  if (isSessionOver(session, now)) {
    await endLiveActivity();
    return;
  }

  const earned = earnedByNow(session, now);
  await updateLiveActivity(formatCurrency(earned, currencySymbol), earned);
}

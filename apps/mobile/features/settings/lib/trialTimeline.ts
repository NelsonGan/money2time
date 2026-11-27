import type { RevenueCatCustomerState, RevenueCatFreeTrial } from '~/services/revenueCat';

/**
 * The free-trial timeline on the paywall and the reminder before the first
 * charge (README › Trial-aware paywall › Trial timeline and reminder).
 *
 * The reminder fires at 10:00 local time two calendar days before the trial
 * ends, so a one-week trial started on a Thursday evening reminds on the next
 * Tuesday morning and charges on Thursday evening. Pure: the paywall and the
 * notification scheduler share it, so what the paywall promises is what the
 * phone schedules.
 */
export const TRIAL_REMINDER_LEAD_DAYS = 2;
export const TRIAL_REMINDER_HOUR = 10;

/** When a trial of this length, started at `start`, ends (calendar arithmetic). */
export function trialEndDate(start: Date, trial: RevenueCatFreeTrial): Date {
  const end = new Date(start);
  const count = trial.durationCount;
  switch (trial.durationUnit) {
    case 'day':
      end.setDate(end.getDate() + count);
      break;
    case 'week':
      end.setDate(end.getDate() + count * 7);
      break;
    case 'month':
      end.setMonth(end.getMonth() + count);
      break;
    case 'year':
      end.setFullYear(end.getFullYear() + count);
      break;
  }
  return end;
}

/**
 * When to remind before a trial that ends at `endsAt`, or null when that moment
 * has passed or would not come before the end (a trial too short for a reminder).
 */
export function trialReminderDate(endsAt: Date, now: Date): Date | null {
  if (Number.isNaN(endsAt.getTime())) return null;
  const remindAt = new Date(endsAt);
  remindAt.setDate(remindAt.getDate() - TRIAL_REMINDER_LEAD_DAYS);
  remindAt.setHours(TRIAL_REMINDER_HOUR, 0, 0, 0);
  if (remindAt.getTime() <= now.getTime()) return null;
  if (remindAt.getTime() >= endsAt.getTime()) return null;
  return remindAt;
}

export interface TrialTimeline {
  endsAt: Date;
  /** Null when no reminder can be promised (notifications denied, trial too short). */
  remindAt: Date | null;
}

/** The timeline the paywall shows for a trial that would start `now`. */
export function buildTrialTimeline(
  trial: RevenueCatFreeTrial,
  now: Date,
  options: { canRemind: boolean },
): TrialTimeline {
  const endsAt = trialEndDate(now, trial);
  return { endsAt, remindAt: options.canRemind ? trialReminderDate(endsAt, now) : null };
}

/**
 * When to remind this customer, from what the store says: only a free trial
 * that is still set to renew, so a trial the user already cancelled (or one
 * that converted) gets no reminder.
 */
export function trialReminderDateForCustomer(
  state: Pick<
    RevenueCatCustomerState,
    'periodType' | 'hasRenewingSubscription' | 'expirationDate'
  > | null,
  now: Date,
): Date | null {
  if (!state || state.periodType !== 'trial' || !state.hasRenewingSubscription) return null;
  if (!state.expirationDate) return null;
  return trialReminderDate(new Date(state.expirationDate), now);
}

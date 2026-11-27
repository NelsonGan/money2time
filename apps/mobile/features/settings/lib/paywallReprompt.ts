/**
 * The paywall a free member sees again every few days (paywall source
 * `periodic`; README › Paywall sources). Any paywall the member saw, for any
 * reason, restarts the clock, so a member who just closed a limit paywall is
 * not shown another one.
 */
export const PAYWALL_REPROMPT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

export const PAYWALL_REPROMPT_SOURCE = 'periodic';

export type PaywallRepromptDecision =
  /** Pro, status unknown or onboarding unfinished: nothing to do. */
  | 'none'
  /**
   * No paywall on record (a member who updated from a version before this
   * one): start the clock now instead of showing one on the first launch.
   */
  | 'start_clock'
  /** Shown too recently. */
  | 'wait'
  | 'prompt';

export function decidePaywallReprompt(input: {
  isPro: boolean;
  isStatusKnown: boolean;
  onboardingCompleted: boolean;
  /** Epoch-ms any paywall last opened on this phone, or null if never recorded. */
  lastShownAt: number | null;
  now: number;
}): PaywallRepromptDecision {
  if (input.isPro || !input.isStatusKnown || !input.onboardingCompleted) return 'none';
  if (input.lastShownAt === null) return 'start_clock';
  // A clock set in the future (the phone's time moved back) counts as just shown.
  if (input.now < input.lastShownAt) return 'wait';
  return input.now - input.lastShownAt >= PAYWALL_REPROMPT_INTERVAL_MS ? 'prompt' : 'wait';
}

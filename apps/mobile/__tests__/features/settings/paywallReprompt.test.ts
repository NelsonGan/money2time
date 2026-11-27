import {
  decidePaywallReprompt,
  PAYWALL_REPROMPT_INTERVAL_MS,
} from '~/features/settings/lib/paywallReprompt';

const base = {
  isPro: false,
  isStatusKnown: true,
  onboardingCompleted: true,
  lastShownAt: 1_000_000,
  now: 1_000_000 + PAYWALL_REPROMPT_INTERVAL_MS,
};

describe('decidePaywallReprompt', () => {
  it('shows the paywall again three days after the last one', () => {
    expect(PAYWALL_REPROMPT_INTERVAL_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(decidePaywallReprompt(base)).toBe('prompt');
    expect(decidePaywallReprompt({ ...base, now: base.now - 1 })).toBe('wait');
  });

  it('never shows it to Pro, before Pro status is known or before onboarding ends', () => {
    expect(decidePaywallReprompt({ ...base, isPro: true })).toBe('none');
    expect(decidePaywallReprompt({ ...base, isStatusKnown: false })).toBe('none');
    expect(decidePaywallReprompt({ ...base, onboardingCompleted: false })).toBe('none');
  });

  it('starts the clock for a member with no paywall on record instead of showing one', () => {
    expect(decidePaywallReprompt({ ...base, lastShownAt: null })).toBe('start_clock');
  });

  it('waits when the phone clock went back before the last paywall', () => {
    expect(decidePaywallReprompt({ ...base, now: base.lastShownAt - 60_000 })).toBe('wait');
  });
});

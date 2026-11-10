import {
  ACCOUNT_CHECK_EVERY_MS,
  accountCheckDue,
  OWN_PURCHASE_CHECK_EVERY_MS,
  PAUSED_CHECK_MIN_GAP_MS,
  pausedCheckDue,
} from '~/features/cloudSync/lib/accountCheck';

// How often the app asks the Worker about the account's Pro (README: Cloud
// Sync > Pro on every signed-in phone).
describe('accountCheckDue', () => {
  const now = 1_800_000_000_000;

  it('is due with no answer yet', () => {
    expect(accountCheckDue(now, 0, false)).toBe(true);
    expect(accountCheckDue(now, 0, true)).toBe(true);
  });

  it('waits 30 minutes after an answer', () => {
    expect(ACCOUNT_CHECK_EVERY_MS).toBe(30 * 60_000);
    expect(accountCheckDue(now, now - 5 * 60_000, false)).toBe(false);
    expect(accountCheckDue(now, now - ACCOUNT_CHECK_EVERY_MS + 1, false)).toBe(false);
    expect(accountCheckDue(now, now - ACCOUNT_CHECK_EVERY_MS, false)).toBe(true);
  });

  it('waits a day for a linked phone with its own purchase', () => {
    expect(OWN_PURCHASE_CHECK_EVERY_MS).toBe(24 * 60 * 60_000);
    expect(accountCheckDue(now, now - 2 * 60 * 60_000, true)).toBe(false);
    expect(accountCheckDue(now, now - OWN_PURCHASE_CHECK_EVERY_MS, true)).toBe(true);
  });

  it('is due when the clock was set back past the last answer', () => {
    expect(accountCheckDue(now, now + 60_000, false)).toBe(true);
    expect(accountCheckDue(now, now + 60_000, true)).toBe(true);
  });
});

describe('pausedCheckDue', () => {
  const now = 1_800_000_000_000;

  it('asks again only a minute after the last answer', () => {
    expect(pausedCheckDue(now, 0)).toBe(true);
    expect(pausedCheckDue(now, now - 10_000)).toBe(false);
    expect(pausedCheckDue(now, now - PAUSED_CHECK_MIN_GAP_MS)).toBe(true);
  });

  it('asks when the clock was set back past the last answer', () => {
    expect(pausedCheckDue(now, now + 1)).toBe(true);
  });
});

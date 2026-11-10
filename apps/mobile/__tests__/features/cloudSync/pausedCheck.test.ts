import {
  credentialsWouldBeRefused,
  NOT_PRO_ANSWER_HOLDS_MS,
  shouldAskForCredentials,
} from '~/features/cloudSync/lib/pausedCheck';

// A paused phone checks the account status every few minutes; it asks for
// sync credentials only when that answer leaves a chance they are granted
// (README: Cloud Sync > When Pro ends).
describe('shouldAskForCredentials', () => {
  it('asks when the account is Pro', () => {
    expect(shouldAskForCredentials({ isPro: true }, true, false)).toBe(true);
    expect(shouldAskForCredentials({ isPro: true }, false, false)).toBe(true);
  });

  it('asks when there was no answer (offline, older Worker)', () => {
    expect(shouldAskForCredentials(null, true, false)).toBe(true);
  });

  it('does not ask a linked phone the account says is not Pro', () => {
    // Its status call sent its install id: the answer counts its own purchase.
    expect(shouldAskForCredentials({ isPro: false }, true, false)).toBe(false);
    expect(shouldAskForCredentials({ isPro: false }, true, true)).toBe(false);
  });

  it('asks for a phone not linked yet whose own purchase is active', () => {
    expect(shouldAskForCredentials({ isPro: false }, false, true)).toBe(true);
  });

  it('does not ask for a free phone not linked yet', () => {
    expect(shouldAskForCredentials({ isPro: false }, false, false)).toBe(false);
  });
});

// Checked before every credentials request, whichever path makes it.
describe('credentialsWouldBeRefused', () => {
  const now = 1_800_000_000_000;
  const notPro = { isPro: false, limited: false, at: now - 60_000 };

  it('holds a linked phone back on a recent "not Pro"', () => {
    expect(credentialsWouldBeRefused(notPro, now, true, false)).toBe(true);
    expect(credentialsWouldBeRefused({ ...notPro, limited: true }, now, true, false)).toBe(true);
  });

  it('lets a phone ask with no answer, a Pro answer or an old one', () => {
    expect(credentialsWouldBeRefused(null, now, true, false)).toBe(false);
    expect(credentialsWouldBeRefused({ ...notPro, isPro: true }, now, true, false)).toBe(false);
    const old = { ...notPro, at: now - NOT_PRO_ANSWER_HOLDS_MS };
    expect(credentialsWouldBeRefused(old, now, true, false)).toBe(false);
  });

  it('lets a phone not linked yet ask when it may hold a purchase', () => {
    expect(credentialsWouldBeRefused(notPro, now, false, true)).toBe(false);
    expect(credentialsWouldBeRefused(notPro, now, false, false)).toBe(true);
  });

  it('lets a phone ask when the clock was set back past the answer', () => {
    expect(credentialsWouldBeRefused({ ...notPro, at: now + 1 }, now, true, false)).toBe(false);
  });
});

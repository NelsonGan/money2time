import { shouldAskForCredentials } from '~/features/cloudSync/lib/pausedCheck';

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

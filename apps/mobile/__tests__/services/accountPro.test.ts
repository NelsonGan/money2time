import { accountProActive, OFFLINE_GRACE_MS } from '~/services/accountPro';

describe('accountProActive', () => {
  const now = Date.UTC(2026, 9, 28);

  it('counts a fresh Pro answer from the account', () => {
    expect(accountProActive({ userId: 'u1', isPro: true, checkedAt: now - 60_000 }, now)).toBe(
      true,
    );
  });

  it('never counts a free answer or none', () => {
    expect(accountProActive({ userId: 'u1', isPro: false, checkedAt: now }, now)).toBe(false);
    expect(accountProActive(null, now)).toBe(false);
  });

  it('keeps Pro offline for the grace period only', () => {
    const stale = { userId: 'u1', isPro: true, checkedAt: now - OFFLINE_GRACE_MS };
    expect(accountProActive({ ...stale, checkedAt: stale.checkedAt + 1 }, now)).toBe(true);
    expect(accountProActive(stale, now)).toBe(false);
  });

  it('does not trust an answer from the future (a clock moved back)', () => {
    expect(accountProActive({ userId: 'u1', isPro: true, checkedAt: now + 60_000 }, now)).toBe(
      false,
    );
  });
});

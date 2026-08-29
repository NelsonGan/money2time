import {
  earnedByNow as workerEarnedByNow,
  formatMoney,
} from '../../cloudflare/workers/live-earnings/src/earnings';
import { isLiveActivityPushToken } from '../../cloudflare/workers/live-earnings/src/token';
import { earnedByNow } from '~/features/widgets/lib/liveEarnings';
import { formatCurrency } from '~/utils/formatters';

/**
 * The Worker pushes the card's amount while the app is suspended, and the app
 * pushes it on every foreground. Both have to render the same number the same
 * way, or the figure changes shape depending on which one got there last.
 *
 * The Worker is a separate TypeScript project (the app's tsconfig excludes
 * `cloudflare/`), so the maths is a port rather than a shared module. This is
 * what stops the port drifting: it imports both sides and asserts they agree.
 */
describe('live-earnings push contract', () => {
  const symbols = ['$', 'RM', '€', '¥', ''];
  const amounts = [
    0, 0.004, 0.005, 0.01, 0.99, 1, 1.005, 9.999, 45, 100, 999.994, 999.995, 1000, 1234.56,
    12345.678, 1_000_000, 87_654_321.09,
  ];

  it('formats every amount exactly as the app does', () => {
    for (const symbol of symbols) {
      for (const amount of amounts) {
        expect(formatMoney(amount, symbol)).toBe(formatCurrency(amount, symbol));
      }
    }
  });

  it('defaults to the same symbol as the app', () => {
    expect(formatMoney(12.3)).toBe(formatCurrency(12.3));
  });

  it('accrues the same money as the app across the session', () => {
    const session = { startedAt: 1_700_000_000_000, endsAt: 1_700_014_400_000, hourlyRate: 45 };
    const points = [
      session.startedAt - 60_000, // before it began
      session.startedAt,
      session.startedAt + 1_000,
      session.startedAt + 60_000,
      session.startedAt + 3_600_000,
      session.endsAt - 1,
      session.endsAt,
      session.endsAt + 3_600_000, // after it ended
    ];
    for (const now of points) {
      expect(workerEarnedByNow(session, now)).toBe(earnedByNow(session, now));
    }
  });

  it('agrees with the app on degenerate sessions', () => {
    const cases = [
      { startedAt: 1_700_000_000_000, endsAt: 1_700_000_000_000, hourlyRate: 45 },
      { startedAt: 1_700_000_000_000, endsAt: 1_699_000_000_000, hourlyRate: 45 },
      { startedAt: 1_700_000_000_000, endsAt: 1_700_014_400_000, hourlyRate: 0 },
      { startedAt: 1_700_000_000_000, endsAt: 1_700_014_400_000, hourlyRate: -5 },
    ];
    for (const session of cases) {
      const now = 1_700_007_200_000;
      expect(workerEarnedByNow(session, now)).toBe(earnedByNow(session, now));
    }
  });
});

describe('live-earnings push token validation', () => {
  it('accepts a real iOS Live Activity token', () => {
    // 128 bytes. This is what an iPhone 17 Pro on iOS 26 actually hands over,
    // and the first cut of the Worker rejected it: the bound had been written
    // for a 64-hex-character APNs *device* token, which is a different thing.
    // The only symptom was a card that never ticked, because registration is
    // best-effort and swallows a rejection.
    expect(isLiveActivityPushToken('ab'.repeat(128))).toBe(true);
    expect('ab'.repeat(128)).toHaveLength(256);
  });

  it('still accepts a classic device-token length', () => {
    expect(isLiveActivityPushToken('a'.repeat(64))).toBe(true);
  });

  it('rejects anything that is not plain hex', () => {
    expect(isLiveActivityPushToken('')).toBe(false);
    expect(isLiveActivityPushToken('not-hex')).toBe(false);
    expect(isLiveActivityPushToken('abc')).toBe(false); // too short to be real
    expect(isLiveActivityPushToken(`${'a'.repeat(60)}../../evil`)).toBe(false);
    expect(isLiveActivityPushToken('a'.repeat(2048))).toBe(false);
  });
});

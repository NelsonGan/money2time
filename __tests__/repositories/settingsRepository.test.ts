// Controllable stand-in for the drizzle `db.select().from().where().get()`
// chain, so `get()` can be made to throw a transient error a fixed number of
// times before succeeding.
let getBehavior: () => unknown = () => ({ id: 'primary' });
jest.mock('~/lib/db/client', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => getBehavior(),
        }),
      }),
    }),
  }),
}));

import { settingsRepository } from '~/lib/repositories/settingsRepository';

function minimalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'primary',
    appUserId: 'user-1',
    locale: 'en',
    currencyCode: 'USD',
    currencySymbol: '$',
    displayMode: 'money',
    onboardingCompleted: true,
    userMode: 'power',
    weekStartsOn: 1,
    firstDayOfMonth: 1,
    lastAutoBackupAt: null,
    lastAutoBackupError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('SettingsRepository#get', () => {
  it('returns settings on the first attempt without sleeping', () => {
    getBehavior = () => minimalRow();
    const sleep = jest.fn();

    const settings = settingsRepository.get(sleep);

    expect(settings.appUserId).toBe('user-1');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a transient disk I/O error with a real gap, then succeeds', () => {
    let calls = 0;
    getBehavior = () => {
      calls += 1;
      if (calls < 3) throw new Error('disk I/O error');
      return minimalRow({ appUserId: 'user-2' });
    };
    const delays: number[] = [];

    const settings = settingsRepository.get((ms) => delays.push(ms));

    expect(settings.appUserId).toBe('user-2');
    expect(calls).toBe(3);
    // Regression: the first attempt must not spin through retries with no
    // gap between them (Sentry MONEY2TIME-2H, same root cause as the
    // DB-startup pragma/migration retries in MONEY2TIME-2G/1X/2S).
    expect(delays).toEqual([15, 45]);
  });

  it('throws the underlying error once retries are exhausted', () => {
    getBehavior = () => {
      throw new Error('disk I/O error');
    };

    expect(() => settingsRepository.get(() => {})).toThrow(/disk I\/O error/);
  });

  it('throws when the settings row is genuinely missing, without masking it as a retry loop bug', () => {
    getBehavior = () => undefined;

    expect(() => settingsRepository.get(() => {})).toThrow(/Settings row not found/);
  });
});

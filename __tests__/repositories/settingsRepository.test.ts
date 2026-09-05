jest.mock('~/lib/db/client', () => ({
  getDb: jest.fn(),
}));

import { getDb } from '~/lib/db/client';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { monthCycleOf } from '~/utils/financialMonth';

const mockedGetDb = getDb as jest.Mock;

const VALID_ROW = {
  id: 'primary',
  appUserId: 'user-1',
  locale: 'en',
  currencyCode: 'USD',
  currencySymbol: '$',
  displayMode: 'money',
  workdayDisplayEnabled: false,
  workingHoursPerDay: 8,
  hapticsEnabled: true,
  themeMode: 'system',
  themeColor: 'rosewood',
  iconStyle: 'clay',
  appIcon: 'classic',
  accountLogoCountry: null,
  subscriptionLogoCountry: null,
  profileName: null,
  profileAvatarUri: null,
  onboardingCompleted: true,
  userMode: 'power',
  weekStartsOn: 1,
  firstDayOfMonth: 1,
  firstDayOverridesJson: null,
  biometricLockEnabled: false,
  biometricLockDelaySeconds: 900,
  autoBackupEnabled: true,
  autoBackupTarget: 'local',
  lastAutoBackupAt: null,
  lastAutoBackupError: null,
  autoFxRefreshEnabled: true,
  lastRateFetchAt: null,
  lastRateFetchError: null,
  fxCurrenciesJson: null,
  firstAppOpen: null,
  paymentQrUri: null,
  defaultPaybackAccountId: null,
  reimbursementsCountAsExpense: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

/** A fake drizzle query builder whose terminal `.get()` runs `getImpl`. */
function makeFakeDb(getImpl: () => unknown) {
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    get: getImpl,
  };
  return builder;
}

describe('SettingsRepository#get', () => {
  afterEach(() => {
    mockedGetDb.mockReset();
  });

  it('retries past a transient disk I/O error and returns the settings row', () => {
    let attempts = 0;
    mockedGetDb.mockReturnValue(
      makeFakeDb(() => {
        attempts += 1;
        if (attempts < 3) throw new Error('disk I/O error');
        return VALID_ROW;
      }),
    );

    const settings = settingsRepository.get(() => {});

    expect(attempts).toBe(3);
    expect(settings.id).toBe('primary');
    expect(settings.currencyCode).toBe('USD');
  });

  it('carries the month-cycle overrides column through to the domain type', () => {
    mockedGetDb.mockReturnValue(
      makeFakeDb(() => ({
        ...VALID_ROW,
        firstDayOfMonth: 25,
        firstDayOverridesJson: '{"2026-03":15}',
      })),
    );

    const settings = settingsRepository.get(() => {});

    expect(monthCycleOf(settings)).toEqual({
      defaultDay: 25,
      overrides: { '2026-03': 15 },
    });
  });

  it('throws the underlying error once retries are exhausted', () => {
    mockedGetDb.mockReturnValue(
      makeFakeDb(() => {
        throw new Error('disk I/O error');
      }),
    );

    expect(() => settingsRepository.get(() => {})).toThrow(/disk I\/O error/);
  });

  it('pauses between retries instead of spinning through them instantly', () => {
    mockedGetDb.mockReturnValue(
      makeFakeDb(() => {
        throw new Error('disk I/O error');
      }),
    );
    const delays: number[] = [];

    expect(() => settingsRepository.get((ms) => delays.push(ms))).toThrow(/disk I\/O error/);

    expect(delays).toEqual([20, 60, 150, 400]);
  });
});

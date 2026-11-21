import {
  hasHourlyRate,
  latestWageEntry,
  sameWageConfig,
  wageConfigOf,
} from '~/features/settings/lib/wageMonths';
import type { MonthlyWageSettings } from '~/types';

function entry(overrides: Partial<MonthlyWageSettings>): MonthlyWageSettings {
  return {
    id: 'wage',
    month: '2026-01',
    wageType: 'monthly',
    wageAmount: 4000,
    hoursWorkedPerWeek: 40,
    workdaysPerWeek: 5,
    commuteMinutesPerWorkday: 0,
    baseHourlyRate: 23.09,
    trueHourlyRate: 23.09,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('wageMonths', () => {
  it('starts a new month from the latest one', () => {
    const history = [
      entry({ id: 'march', month: '2026-03' }),
      entry({ id: 'may', month: '2026-05' }),
      entry({ id: 'april', month: '2026-04' }),
    ];
    expect(latestWageEntry(history)?.id).toBe('may');
    expect(latestWageEntry([])).toBeUndefined();
  });

  it('reads the editable config, rounding a converted amount to cents', () => {
    expect(
      wageConfigOf(
        entry({ wageType: 'yearly', wageAmount: 9015.251158712264, commuteMinutesPerWorkday: 45 }),
      ),
    ).toEqual({
      wageType: 'yearly',
      wageAmount: 9015.25,
      hoursWorkedPerWeek: 40,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday: 45,
    });
  });

  it('needs pay and hours for an hourly value', () => {
    const config = wageConfigOf(entry({}));
    expect(hasHourlyRate(config)).toBe(true);
    expect(hasHourlyRate({ ...config, wageAmount: 0 })).toBe(false);
    expect(hasHourlyRate({ ...config, hoursWorkedPerWeek: 0 })).toBe(false);
  });

  it('tells an untouched config from an edited one', () => {
    const config = wageConfigOf(entry({ commuteMinutesPerWorkday: 30 }));
    expect(sameWageConfig(config, { ...config })).toBe(true);
    expect(sameWageConfig(config, { ...config, workdaysPerWeek: 4 })).toBe(false);
    expect(sameWageConfig(config, { ...config, wageType: 'yearly' })).toBe(false);
  });
});

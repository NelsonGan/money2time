import {
  addMonthsAtMonthStart,
  amountToHoursByRate,
  computeHourlyRates,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDateInput,
  formatHours,
  formatHoursCompact,
  formatMonthYearLabel,
  formatRelativeDate,
  getLocaleCurrencyCode,
  getLocaleCurrencySymbol,
  monthKeyFromDateIso,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  monthOffsetFromAnchorDate,
  normalizeMonthKey,
  normalizeMoneyAmount,
  parseMonthKey,
  startOfMonthDate,
  toRange,
} from '~/utils/formatters';

describe('computeHourlyRates', () => {
  it('returns zero rates when wageAmount is 0', () => {
    expect(
      computeHourlyRates({
        wageType: 'hourly',
        wageAmount: 0,
        hoursWorkedPerWeek: 40,
        workdaysPerWeek: 5,
        commuteMinutesPerWorkday: 0,
      }),
    ).toEqual({
      baseHourlyRate: 0,
      trueHourlyRate: 0,
      weeklyIncome: 0,
      trueHoursPerWeek: 0,
      commuteHoursPerWeek: 0,
    });
  });

  it('returns zero rates when hoursWorkedPerWeek is 0', () => {
    expect(
      computeHourlyRates({
        wageType: 'hourly',
        wageAmount: 100,
        hoursWorkedPerWeek: 0,
        workdaysPerWeek: 5,
        commuteMinutesPerWorkday: 0,
      }).baseHourlyRate,
    ).toBe(0);
  });

  it('computes hourly rate directly for hourly wage type', () => {
    const result = computeHourlyRates({
      wageType: 'hourly',
      wageAmount: 50,
      hoursWorkedPerWeek: 40,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday: 0,
    });
    expect(result.baseHourlyRate).toBe(50);
    expect(result.trueHourlyRate).toBe(50);
    expect(result.weeklyIncome).toBe(2000);
    expect(result.commuteHoursPerWeek).toBe(0);
  });

  it('divides monthly wage by 4.33 weeks', () => {
    const result = computeHourlyRates({
      wageType: 'monthly',
      wageAmount: 4330,
      hoursWorkedPerWeek: 40,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday: 0,
    });
    expect(result.baseHourlyRate).toBeCloseTo(25, 4);
  });

  it('divides yearly wage by 52 weeks', () => {
    const result = computeHourlyRates({
      wageType: 'yearly',
      wageAmount: 104_000,
      hoursWorkedPerWeek: 40,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday: 0,
    });
    expect(result.baseHourlyRate).toBe(50);
  });

  it('reduces trueHourlyRate when commute is included', () => {
    const result = computeHourlyRates({
      wageType: 'hourly',
      wageAmount: 50,
      hoursWorkedPerWeek: 40,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday: 60,
    });
    expect(result.commuteHoursPerWeek).toBe(5);
    expect(result.trueHoursPerWeek).toBe(45);
    expect(result.trueHourlyRate).toBeCloseTo(2000 / 45, 4);
  });
});

describe('day/month key helpers', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(dayKeyFromDateLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dayKeyFromDateLocal(new Date(2026, 10, 30))).toBe('2026-11-30');
  });

  it('returns simple day keys unchanged', () => {
    expect(dayKeyFromIsoLocal('2026-05-13')).toBe('2026-05-13');
  });

  it('parses ISO strings to local day key', () => {
    const key = dayKeyFromIsoLocal('2026-05-13T15:30:00.000Z');
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to slicing when ISO parsing fails', () => {
    expect(dayKeyFromIsoLocal('not-a-date')).toBe('not-a-date');
  });

  it('formats month keys', () => {
    expect(monthKeyFromDateLocal(new Date(2026, 4, 13))).toBe('2026-05');
    expect(monthKeyFromIsoLocal('2026-05-13')).toBe('2026-05');
    expect(monthKeyFromDateIso('2026-05-13T00:00:00Z')).toMatch(/^\d{4}-\d{2}$/);
  });

  it('normalizes month keys with single-digit months', () => {
    expect(normalizeMonthKey('2026-5')).toBe('2026-05');
    expect(normalizeMonthKey('  2026-12  ')).toBe('2026-12');
    expect(normalizeMonthKey('garbage')).toBe('garbage');
    expect(normalizeMonthKey('2026-13')).toBe('2026-13');
  });

  it('parses month keys to a local Date', () => {
    const parsed = parseMonthKey('2026-05');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(1);
  });

  it('rejects invalid month keys', () => {
    expect(parseMonthKey('not-a-month')).toBeNull();
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
  });
});

describe('month date arithmetic', () => {
  it('returns first day of the month', () => {
    const start = startOfMonthDate(new Date(2026, 4, 25));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(4);
  });

  it('adds months at month start', () => {
    const result = addMonthsAtMonthStart(new Date(2026, 4, 13), 2);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(1);
  });

  it('wraps months across year boundary', () => {
    const result = addMonthsAtMonthStart(new Date(2026, 11, 1), 2);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(1);
  });

  it('computes month offsets between anchor and target', () => {
    expect(monthOffsetFromAnchorDate(new Date(2026, 0, 1), new Date(2026, 11, 1))).toBe(11);
    expect(monthOffsetFromAnchorDate(new Date(2026, 5, 1), new Date(2025, 5, 1))).toBe(-12);
  });
});

describe('amount/hours conversion', () => {
  it('converts amount to hours using the true hourly rate', () => {
    expect(amountToHoursByRate(100, 20)).toBe(5);
  });

  it('returns 0 when rate is non-positive', () => {
    expect(amountToHoursByRate(100, 0)).toBe(0);
    expect(amountToHoursByRate(100, -1)).toBe(0);
  });
});

describe('formatCurrency', () => {
  it('formats absolute amounts with the given symbol', () => {
    expect(formatCurrency(12.5, '$')).toBe('$12.50');
    expect(formatCurrency(-12.5, '€')).toBe('€12.50');
  });

  it('defaults the symbol to $', () => {
    expect(formatCurrency(1)).toBe('$1.00');
  });

  it('groups thousands with commas', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
    expect(formatCurrency(1284.5, '$')).toBe('$1,284.50');
    expect(formatCurrency(-1234567.89, '€')).toBe('€1,234,567.89');
  });
});

describe('normalizeMoneyAmount', () => {
  it('rounds to two decimal places', () => {
    expect(normalizeMoneyAmount(12.345)).toBe(12.35);
    expect(normalizeMoneyAmount(12.344)).toBe(12.34);
  });

  it('zeroes out non-finite inputs', () => {
    expect(normalizeMoneyAmount(Number.NaN)).toBe(0);
    expect(normalizeMoneyAmount(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns 0 instead of -0', () => {
    expect(Object.is(normalizeMoneyAmount(-0.001), 0)).toBe(true);
  });
});

describe('formatCompactNumber', () => {
  it('returns 0 for zero or invalid values', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(Number.NaN)).toBe('0');
  });

  it('uses K/M/B/T suffixes for large numbers', () => {
    expect(formatCompactNumber(1_500)).toBe('1.5K');
    expect(formatCompactNumber(150_000)).toBe('150K');
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
    expect(formatCompactNumber(1_200_000_000)).toBe('1.2B');
    expect(formatCompactNumber(3_400_000_000_000)).toBe('3.4T');
  });

  it('keeps integer precision for plain hundreds', () => {
    expect(formatCompactNumber(150)).toBe('150');
  });

  it('keeps decimal precision for small numbers', () => {
    expect(formatCompactNumber(12.5)).toBe('12.5');
    expect(formatCompactNumber(3.21)).toBe('3.21');
  });
});

describe('formatCompactCurrency', () => {
  it('prefixes the compact number with the currency symbol', () => {
    expect(formatCompactCurrency(2_500, '$')).toBe('$2.5K');
    expect(formatCompactCurrency(0, '€')).toBe('€0');
  });
});

describe('formatHours', () => {
  it('returns 0m for tiny values', () => {
    expect(formatHours(0)).toBe('0m');
    expect(formatHours(0.005)).toBe('0m');
  });

  it('returns minutes-only when below an hour', () => {
    expect(formatHours(0.5)).toBe('30m');
  });

  it('returns hours-only when there are no extra minutes', () => {
    expect(formatHours(2)).toBe('2h');
  });

  it('combines hours and minutes', () => {
    expect(formatHours(1.5)).toBe('1h 30m');
  });

  it('treats negative values as positive', () => {
    expect(formatHours(-1.5)).toBe('1h 30m');
  });

  it('rolls into days and years, showing at most two units', () => {
    expect(formatHours(24)).toBe('1d');
    expect(formatHours(30)).toBe('1d 6h');
    expect(formatHours(24 * 365)).toBe('1y');
    expect(formatHours(24 * 365 + 24 * 5)).toBe('1y 5d');
  });

  it('abbreviates very large year counts as K', () => {
    expect(formatHours(24 * 365 * 1500)).toBe('1.5Ky');
  });
});

describe('formatHoursCompact', () => {
  it('matches formatHours (shared years/days/hours/minutes cascade)', () => {
    expect(formatHoursCompact(0)).toBe('0m');
    expect(formatHoursCompact(0.5)).toBe('30m');
    expect(formatHoursCompact(2.5)).toBe('2h 30m');
    expect(formatHoursCompact(30)).toBe('1d 6h');
    expect(formatHoursCompact(1500)).toBe('62d 12h');
  });
});

describe('formatAmount', () => {
  const moneySettings = { currencySymbol: '$', displayMode: 'money' as const };
  const timeSettings = { currencySymbol: '$', displayMode: 'time' as const };

  it('abbreviates money when compact is set', () => {
    expect(formatAmount(1234.56, moneySettings, { compact: true })).toBe('$1.2K');
    expect(formatAmount(250, moneySettings, { compact: true })).toBe('$250');
  });

  it('formats money with default sign', () => {
    expect(formatAmount(12.5, moneySettings)).toBe('$12.50');
    expect(formatAmount(-12.5, moneySettings)).toBe('-$12.50');
  });

  it('shows explicit + sign for positive amounts when requested', () => {
    expect(formatAmount(12.5, moneySettings, { showSign: true })).toBe('+$12.50');
  });

  it('drops the sign when neutralSign is set', () => {
    expect(formatAmount(-12.5, moneySettings, { showSign: true, neutralSign: true })).toBe(
      '$12.50',
    );
  });

  it('falls back to money formatting in time mode without a rate', () => {
    expect(formatAmount(50, timeSettings, { trueHourlyRate: 0 })).toBe('$50.00');
  });

  it('formats hours in time mode with a positive rate', () => {
    expect(formatAmount(50, timeSettings, { trueHourlyRate: 25 })).toBe('2h');
    expect(formatAmount(-25, timeSettings, { trueHourlyRate: 50 })).toBe('-30m');
  });
});

describe('formatRelativeDate', () => {
  it('returns Today for the current date', () => {
    const now = new Date().toISOString();
    expect(formatRelativeDate(now)).toBe('Today');
  });

  it('returns Yesterday for the previous day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDate(yesterday.toISOString())).toBe('Yesterday');
  });

  it('returns a weekday name for dates within the past week', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const result = formatRelativeDate(threeDaysAgo.toISOString(), 'en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a month+day for older dates', () => {
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 60);
    const result = formatRelativeDate(longAgo.toISOString(), 'en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDateInput and formatMonthYearLabel', () => {
  it('formats date input as day key', () => {
    expect(formatDateInput(new Date(2026, 4, 13))).toBe('2026-05-13');
  });

  it('produces a human-readable month-year label', () => {
    const label = formatMonthYearLabel(new Date(2026, 4, 1), 'en');
    expect(label.toLowerCase()).toContain('may');
    expect(label).toContain('2026');
  });
});

describe('toRange', () => {
  it('produces start-of-day and end-of-day ISO strings', () => {
    const range = toRange(new Date(2026, 4, 13, 10), new Date(2026, 4, 14, 10));
    const startDate = new Date(range.start);
    const endDate = new Date(range.end);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
  });
});

describe('locale currency detection', () => {
  it('returns the device locale currency code when supported', () => {
    expect(getLocaleCurrencyCode()).toBe('USD');
  });

  it('returns the matching currency symbol', () => {
    expect(getLocaleCurrencySymbol()).toBe('$');
  });
});

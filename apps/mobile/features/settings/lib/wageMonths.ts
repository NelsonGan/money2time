import type { MonthlyWageSettings, WageConfig } from '~/types';
import { computeHourlyRates, normalizeMoneyAmount, normalizeMonthKey } from '~/utils/formatters';

/** "March 2026" for `2026-03`, or the key itself when it is not a month. */
export function formatMonthLabel(monthKey: string, locale: string): string {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const [yearRaw, monthRaw] = normalizedMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return normalizedMonth;
  if (month < 1 || month > 12) return normalizedMonth;
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

/** The twelve months as `01`…`12` with the locale's month names. */
export function buildMonthOptions(locale: string): { value: string; label: string }[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: formatter.format(new Date(2024, index, 1)),
  }));
}

/**
 * The editable part of a saved month. The amount is rounded to cents: a wage
 * read in another currency than it is kept in arrives converted
 * (9015.251158712264) and would fill the field so.
 */
export function wageConfigOf(entry: MonthlyWageSettings): WageConfig {
  return {
    wageType: entry.wageType,
    wageAmount: normalizeMoneyAmount(entry.wageAmount),
    hoursWorkedPerWeek: entry.hoursWorkedPerWeek,
    workdaysPerWeek: entry.workdaysPerWeek,
    commuteMinutesPerWorkday: entry.commuteMinutesPerWorkday,
  };
}

/** Whether a config makes an hourly value, which saving it needs. */
export function hasHourlyRate(config: WageConfig): boolean {
  return computeHourlyRates(config).trueHourlyRate > 0;
}

export function sameWageConfig(a: WageConfig, b: WageConfig): boolean {
  return (
    a.wageType === b.wageType &&
    a.wageAmount === b.wageAmount &&
    a.hoursWorkedPerWeek === b.hoursWorkedPerWeek &&
    a.workdaysPerWeek === b.workdaysPerWeek &&
    a.commuteMinutesPerWorkday === b.commuteMinutesPerWorkday
  );
}

/** The newest month's entry, which a new month starts from. */
export function latestWageEntry(history: MonthlyWageSettings[]): MonthlyWageSettings | undefined {
  return history.reduce<MonthlyWageSettings | undefined>(
    (latest, item) => (!latest || item.month > latest.month ? item : latest),
    undefined,
  );
}

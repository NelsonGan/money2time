import {
  dayKeyFromDateLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
} from '~/utils/formatters';

/**
 * Configurable "first day of month" support.
 *
 * A financial month lets the user anchor their spending cycle to a day other
 * than the 1st (e.g. payday on the 25th). A financial month keyed `YYYY-MM`
 * runs `[YYYY-MM-D, nextMonth-D)` where `D` is the configured first day, and is
 * labelled by the calendar month it STARTS in — so with `D = 25`, the period
 * Oct 25 → Nov 24 is "October" (`2025-10`).
 *
 * Every helper here is written so that at `firstDay === 1` it returns exactly
 * what the plain calendar-month helpers in `utils/formatters` return (by
 * delegating to them). That makes threading the setting through the app with
 * its default of 1 a guaranteed no-op for existing users — the shifted logic
 * only activates when a user opts in.
 *
 * The day is capped at 1..28 so the cycle start exists in every month
 * (29/30/31 are absent in February and would clamp inconsistently).
 */

export const MIN_FIRST_DAY_OF_MONTH = 1;
export const MAX_FIRST_DAY_OF_MONTH = 28;

export function clampFirstDayOfMonth(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return MIN_FIRST_DAY_OF_MONTH;
  if (value < MIN_FIRST_DAY_OF_MONTH) return MIN_FIRST_DAY_OF_MONTH;
  if (value > MAX_FIRST_DAY_OF_MONTH) return MAX_FIRST_DAY_OF_MONTH;
  return value;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function monthKeyFromParts(year: number, month1: number): string {
  return `${year}-${pad2(month1)}`;
}

/**
 * Financial month key for a `YYYY-MM-DD` day's calendar parts. `month1` is
 * 1-based. When the day-of-month is before the cycle start the day belongs to
 * the previous month's cycle.
 */
function financialMonthKeyFromParts(
  year: number,
  month1: number,
  day: number,
  firstDay: number,
): string {
  let y = year;
  let m = month1;
  if (day < firstDay) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return monthKeyFromParts(y, m);
}

interface SimpleDayKeyParts {
  year: number;
  month1: number;
  day: number;
}

/**
 * Parse a literal `YYYY-MM-DD` key into its parts without constructing a
 * `Date` (avoids the UTC/local month-shift that bites timezones behind UTC).
 * Returns null for anything that isn't a simple day key.
 */
function parseSimpleDayKey(dateText: string): SimpleDayKeyParts | null {
  if (dateText.length !== 10) return null;
  if (dateText.charCodeAt(4) !== 45 || dateText.charCodeAt(7) !== 45) return null;
  for (let index = 0; index < dateText.length; index += 1) {
    if (index === 4 || index === 7) continue;
    const code = dateText.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  const year = Number(dateText.slice(0, 4));
  const month1 = Number(dateText.slice(5, 7));
  const day = Number(dateText.slice(8, 10));
  if (month1 < 1 || month1 > 12 || day < 1 || day > 31) return null;
  return { year, month1, day };
}

/** Financial month key (`YYYY-MM`) that a local `Date` falls in. */
export function financialMonthKeyForDate(date: Date, firstDay = 1): string {
  const d = clampFirstDayOfMonth(firstDay);
  if (d === 1) return monthKeyFromDateLocal(date);
  return financialMonthKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), d);
}

/** Financial month key (`YYYY-MM`) that an ISO date / day-key falls in. */
export function financialMonthKeyForIso(dateIso: string, firstDay = 1): string {
  const d = clampFirstDayOfMonth(firstDay);
  if (d === 1) return monthKeyFromIsoLocal(dateIso);
  const simple = parseSimpleDayKey(dateIso);
  if (simple) return financialMonthKeyFromParts(simple.year, simple.month1, simple.day, d);
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return monthKeyFromIsoLocal(dateIso);
  return financialMonthKeyForDate(parsed, d);
}

/** Local start `Date` of a financial month key (day `firstDay` of that month). */
export function financialMonthStartDate(monthKey: string, firstDay = 1): Date {
  const d = clampFirstDayOfMonth(firstDay);
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month1 = Number(monthRaw);
  return new Date(year, month1 - 1, d);
}

/** Inclusive `[start, endInclusive]` local date range of a financial month. */
export function financialMonthRange(
  monthKey: string,
  firstDay = 1,
): { start: Date; endInclusive: Date } {
  const start = financialMonthStartDate(monthKey, firstDay);
  const endInclusive = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1);
  return { start, endInclusive };
}

/** Start `Date` of the financial month `offset` cycles away from `date`'s cycle. */
export function addFinancialMonths(date: Date, offset: number, firstDay = 1): Date {
  const d = clampFirstDayOfMonth(firstDay);
  const key = financialMonthKeyForDate(date, d);
  const [yearRaw, monthRaw] = key.split('-');
  const year = Number(yearRaw);
  const month1 = Number(monthRaw);
  return new Date(year, month1 - 1 + offset, d);
}

/** Start `Date` of the financial month containing today. */
export function financialMonthAnchorForToday(firstDay = 1): Date {
  const d = clampFirstDayOfMonth(firstDay);
  const key = financialMonthKeyForDate(new Date(), d);
  return financialMonthStartDate(key, d);
}

/** Ordered `YYYY-MM-DD` day keys spanning a financial month (start → end inclusive). */
export function financialMonthDayKeys(monthKey: string, firstDay = 1): string[] {
  const { start, endInclusive } = financialMonthRange(monthKey, firstDay);
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor.getTime() <= endInclusive.getTime()) {
    keys.push(dayKeyFromDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Whole-financial-month delta between an anchor financial-month key and the
 * financial month a `YYYY-MM-DD` day key falls in. Positive when the day is in
 * a later cycle. Returns null for a malformed anchor/day key so callers can
 * fall back to a safe default (mirrors `monthOffsetForDayKey`).
 */
export function financialMonthOffsetForDayKey(
  anchorMonthKey: string,
  dayKey: string,
  firstDay = 1,
): number | null {
  const d = clampFirstDayOfMonth(firstDay);
  const [anchorYearRaw, anchorMonthRaw] = anchorMonthKey.split('-');
  const anchorYear = Number(anchorYearRaw);
  const anchorMonth = Number(anchorMonthRaw);
  const dayFinKey = financialMonthKeyForIso(dayKey, d);
  const [dayYearRaw, dayMonthRaw] = dayFinKey.split('-');
  const dayYear = Number(dayYearRaw);
  const dayMonth = Number(dayMonthRaw);
  if (
    !Number.isInteger(anchorYear) ||
    !Number.isInteger(anchorMonth) ||
    !Number.isInteger(dayYear) ||
    !Number.isInteger(dayMonth)
  ) {
    return null;
  }
  return (dayYear - anchorYear) * 12 + (dayMonth - anchorMonth);
}

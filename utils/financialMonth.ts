import type { MonthCycle, MonthCycleInput, UserSettings } from '~/types';
import {
  dayKeyFromDateLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
} from '~/utils/formatters';

/**
 * Configurable month cycle ("first day of month") support.
 *
 * A financial month lets the user anchor their spending cycle to a day other
 * than the 1st (e.g. payday on the 25th). A financial month keyed `YYYY-MM`
 * starts on its own configured day and runs until the day before the next
 * month's cycle starts, and is labelled by the calendar month it STARTS in —
 * so with day 25, the period Oct 25 to Nov 24 is "October" (`2025-10`).
 *
 * The start day is a `MonthCycle`, not a single number: a default day every
 * month follows, plus per-`YYYY-MM` overrides for the months whose cycle the
 * user pinned somewhere else (a payday that lands differently in December, a
 * bonus month, a landlord who moves rent day). Consumers accept a
 * `MonthCycleInput`, so a bare number still works and still means "this day,
 * every month".
 *
 * Every helper here is written so that at a plain `1` it returns exactly what
 * the calendar-month helpers in `utils/formatters` return (by delegating to
 * them). That makes threading the setting through the app with its default of
 * 1 a guaranteed no-op for existing users — the shifted logic only activates
 * when a user opts in.
 *
 * Two invariants make the per-month form safe. Every start day is capped at
 * 1..28 so the cycle start exists in every month (29/30/31 are absent in
 * February and would clamp inconsistently), and every cycle therefore starts
 * inside its own calendar month. So `start(M) < start(M + 1)` always holds,
 * which means the cycles tile the calendar with no gap and no overlap however
 * the user mixes the days — and which day a given date falls under is decided
 * entirely by that date's own calendar month.
 */

export const MIN_FIRST_DAY_OF_MONTH = 1;
export const MAX_FIRST_DAY_OF_MONTH = 28;

/** The plain calendar-month cycle: every month starts on the 1st. */
export const CALENDAR_MONTH_CYCLE: MonthCycle = { defaultDay: 1, overrides: {} };

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

/** The day every month starts on unless it carries an override. */
export function monthCycleDefaultDay(cycle: MonthCycleInput): number {
  return clampFirstDayOfMonth(typeof cycle === 'number' ? cycle : cycle?.defaultDay);
}

/** The months the user pinned to their own day, `YYYY-MM` -> day. */
export function monthCycleOverrides(cycle: MonthCycleInput): Readonly<Record<string, number>> {
  if (typeof cycle === 'number' || !cycle?.overrides) return EMPTY_OVERRIDES;
  return cycle.overrides;
}

const EMPTY_OVERRIDES: Readonly<Record<string, number>> = Object.freeze({});

/** How many months the user has pinned away from the default. */
export function monthCycleOverrideCount(cycle: MonthCycleInput): number {
  return Object.keys(monthCycleOverrides(cycle)).length;
}

/** The day a given financial month (`YYYY-MM`) starts on. */
export function firstDayForMonthKey(cycle: MonthCycleInput, monthKey: string): number {
  if (typeof cycle === 'number') return clampFirstDayOfMonth(cycle);
  const override = cycle?.overrides?.[monthKey];
  if (override !== undefined) return clampFirstDayOfMonth(override);
  return clampFirstDayOfMonth(cycle?.defaultDay);
}

/**
 * The day the financial month labelled `year`/`month1` starts on. Split from
 * `firstDayForMonthKey` so the hot paths (bucketing thousands of transactions)
 * skip building a key string when the cycle has no overrides at all.
 */
function firstDayForParts(cycle: MonthCycleInput, year: number, month1: number): number {
  if (typeof cycle === 'number') return clampFirstDayOfMonth(cycle);
  const overrides = cycle?.overrides;
  if (!overrides) return clampFirstDayOfMonth(cycle?.defaultDay);
  const override = overrides[monthKeyFromParts(year, month1)];
  if (override !== undefined) return clampFirstDayOfMonth(override);
  return clampFirstDayOfMonth(cycle?.defaultDay);
}

/**
 * True when the cycle is exactly the calendar month, in which case the helpers
 * hand straight off to `utils/formatters` and the behaviour is bit-identical to
 * the app before financial months existed.
 */
function isCalendarCycle(cycle: MonthCycleInput): boolean {
  if (typeof cycle === 'number') return clampFirstDayOfMonth(cycle) === 1;
  if (clampFirstDayOfMonth(cycle?.defaultDay) !== 1) return false;
  const overrides = cycle?.overrides;
  return !overrides || Object.keys(overrides).length === 0;
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

/** Parse a `YYYY-MM` key into 1-based parts, or null when malformed. */
function parseMonthKeyParts(monthKey: string): { year: number; month1: number } | null {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month1 = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month1)) return null;
  if (month1 < 1 || month1 > 12) return null;
  return { year, month1 };
}

/** The `YYYY-MM` key one calendar month after `monthKey`. */
export function nextMonthKey(monthKey: string): string {
  const parts = parseMonthKeyParts(monthKey);
  if (!parts) return monthKey;
  return parts.month1 === 12
    ? monthKeyFromParts(parts.year + 1, 1)
    : monthKeyFromParts(parts.year, parts.month1 + 1);
}

/** Financial month key (`YYYY-MM`) that a local `Date` falls in. */
export function financialMonthKeyForDate(date: Date, cycle: MonthCycleInput = 1): string {
  const year = date.getFullYear();
  const month1 = date.getMonth() + 1;
  const firstDay = firstDayForParts(cycle, year, month1);
  if (firstDay === 1) return monthKeyFromDateLocal(date);
  return financialMonthKeyFromParts(year, month1, date.getDate(), firstDay);
}

/** Financial month key (`YYYY-MM`) that an ISO date / day-key falls in. */
export function financialMonthKeyForIso(dateIso: string, cycle: MonthCycleInput = 1): string {
  if (isCalendarCycle(cycle)) return monthKeyFromIsoLocal(dateIso);
  const simple = parseSimpleDayKey(dateIso);
  if (simple) {
    const firstDay = firstDayForParts(cycle, simple.year, simple.month1);
    return financialMonthKeyFromParts(simple.year, simple.month1, simple.day, firstDay);
  }
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return monthKeyFromIsoLocal(dateIso);
  return financialMonthKeyForDate(parsed, cycle);
}

/** Local start `Date` of a financial month key (its own configured start day). */
export function financialMonthStartDate(monthKey: string, cycle: MonthCycleInput = 1): Date {
  const parts = parseMonthKeyParts(monthKey);
  const year = parts ? parts.year : Number(monthKey.split('-')[0]);
  const month1 = parts ? parts.month1 : Number(monthKey.split('-')[1]);
  return new Date(year, month1 - 1, firstDayForMonthKey(cycle, monthKey));
}

/**
 * Inclusive `[start, endInclusive]` local date range of a financial month. The
 * end is the day before the NEXT month's cycle starts, so a month the user
 * pinned to a different day simply lends or borrows days from its neighbour
 * rather than leaving a gap.
 */
export function financialMonthRange(
  monthKey: string,
  cycle: MonthCycleInput = 1,
): { start: Date; endInclusive: Date } {
  const start = financialMonthStartDate(monthKey, cycle);
  const nextStart = financialMonthStartDate(nextMonthKey(monthKey), cycle);
  const endInclusive = new Date(
    nextStart.getFullYear(),
    nextStart.getMonth(),
    nextStart.getDate() - 1,
  );
  return { start, endInclusive };
}

/** Start `Date` of the financial month `offset` cycles away from `date`'s cycle. */
export function addFinancialMonths(date: Date, offset: number, cycle: MonthCycleInput = 1): Date {
  const key = financialMonthKeyForDate(date, cycle);
  const parts = parseMonthKeyParts(key);
  if (!parts) return new Date(date.getFullYear(), date.getMonth() + offset, 1);
  // Normalize the month first (so an offset that crosses a year rolls over),
  // then apply THAT month's own start day.
  const targetMonth = new Date(parts.year, parts.month1 - 1 + offset, 1);
  return financialMonthStartDate(
    monthKeyFromParts(targetMonth.getFullYear(), targetMonth.getMonth() + 1),
    cycle,
  );
}

/** Start `Date` of the financial month containing today. */
export function financialMonthAnchorForToday(cycle: MonthCycleInput = 1): Date {
  const key = financialMonthKeyForDate(new Date(), cycle);
  return financialMonthStartDate(key, cycle);
}

/** Ordered `YYYY-MM-DD` day keys spanning a financial month (start → end inclusive). */
export function financialMonthDayKeys(monthKey: string, cycle: MonthCycleInput = 1): string[] {
  const { start, endInclusive } = financialMonthRange(monthKey, cycle);
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
  cycle: MonthCycleInput = 1,
): number | null {
  const anchor = parseMonthKeyParts(anchorMonthKey);
  const day = parseMonthKeyParts(financialMonthKeyForIso(dayKey, cycle));
  if (!anchor || !day) return null;
  return (day.year - anchor.year) * 12 + (day.month1 - anchor.month1);
}

/* -------------------------------------------------------------------------
 * Persistence + editing
 *
 * The default day lives in its own `settings.first_day_of_month` column (it
 * predates overrides and several consumers — the monthly-review notification
 * trigger, its copy — want the scalar). The overrides ride alongside it as a
 * JSON object in `settings.first_day_overrides_json`, built into a `MonthCycle`
 * by the settings mapper so nothing above the repository layer parses JSON.
 * ---------------------------------------------------------------------- */

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a well-formed `YYYY-MM` key. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

/**
 * Parse the stored overrides blob. Deliberately tolerant: a malformed blob (a
 * hand-edited backup, a future format) degrades to "no overrides" rather than
 * throwing on every settings read.
 */
export function parseMonthCycleOverrides(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isMonthKey(key)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value)) continue;
    if (value < MIN_FIRST_DAY_OF_MONTH || value > MAX_FIRST_DAY_OF_MONTH) continue;
    overrides[key] = value;
  }
  return overrides;
}

/** Serialize overrides for storage. Empty serializes to null, not `"{}"`. */
export function serializeMonthCycleOverrides(
  overrides: Readonly<Record<string, number>>,
): string | null {
  const keys = Object.keys(overrides).sort();
  if (keys.length === 0) return null;
  const ordered: Record<string, number> = {};
  for (const key of keys) ordered[key] = overrides[key];
  return JSON.stringify(ordered);
}

/** Build a `MonthCycle` from the two stored columns. */
export function buildMonthCycle(
  defaultDay: number | null | undefined,
  overridesJson: string | null | undefined,
): MonthCycle {
  return {
    defaultDay: clampFirstDayOfMonth(defaultDay),
    overrides: parseMonthCycleOverrides(overridesJson),
  };
}

/** What `monthCycleOf` needs off a settings object. */
type MonthCycleSettings = Pick<UserSettings, 'firstDayOfMonth' | 'firstDayOverridesJson'>;

const cycleBySettings = new WeakMap<
  MonthCycleSettings,
  { defaultDay: number; json: string | null; cycle: MonthCycle }
>();

/**
 * The month cycle a settings object describes: its default day plus its parsed
 * per-month exceptions. This, not the raw columns, is what every consumer that
 * buckets or ranges by month passes to the helpers above.
 *
 * The result is memoized against the settings object so repeated calls hand
 * back the SAME cycle. Dozens of `useMemo`s across Insights, Calendar, Budget
 * and the widgets key on it, and parsing to a fresh object per render would
 * invalidate all of them on every render. Keying on the object rather than a
 * single last-result slot means two settings objects alive at once (a screen
 * previewing a change, a test fixture) can't thrash each other's entry, and the
 * entry dies with the object it belongs to.
 */
export function monthCycleOf(settings: MonthCycleSettings): MonthCycle {
  const defaultDay = clampFirstDayOfMonth(settings.firstDayOfMonth);
  const json = settings.firstDayOverridesJson ?? null;
  const cached = cycleBySettings.get(settings);
  if (cached && cached.defaultDay === defaultDay && cached.json === json) return cached.cycle;
  const cycle = buildMonthCycle(defaultDay, json);
  cycleBySettings.set(settings, { defaultDay, json, cycle });
  return cycle;
}

/**
 * Set (or clear, with `null`) one month's start day.
 *
 * A day equal to the default clears the override instead of storing it, so
 * "customized" always means "differs from the default" — and a month the user
 * put back on the default follows a later change of default, which is what
 * putting it back means.
 */
export function withMonthCycleOverride(
  cycle: MonthCycleInput,
  monthKey: string,
  day: number | null,
): MonthCycle {
  const defaultDay = monthCycleDefaultDay(cycle);
  const overrides = { ...monthCycleOverrides(cycle) };
  if (day === null || clampFirstDayOfMonth(day) === defaultDay) {
    delete overrides[monthKey];
  } else {
    overrides[monthKey] = clampFirstDayOfMonth(day);
  }
  return { defaultDay, overrides };
}

/** Drop every override, leaving every month on the default day. */
export function withoutMonthCycleOverrides(cycle: MonthCycleInput): MonthCycle {
  return { defaultDay: monthCycleDefaultDay(cycle), overrides: {} };
}

/**
 * Re-point the default day, dropping any override that now matches it (see
 * `withMonthCycleOverride` for why a redundant override is not kept).
 */
export function withMonthCycleDefaultDay(cycle: MonthCycleInput, day: number): MonthCycle {
  const defaultDay = clampFirstDayOfMonth(day);
  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(monthCycleOverrides(cycle))) {
    if (value !== defaultDay) overrides[key] = value;
  }
  return { defaultDay, overrides };
}

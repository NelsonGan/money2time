import type { MonthCycleInput, WeekStartsOn } from '~/types';
import {
  addFinancialMonths,
  financialMonthKeyForDate,
  financialMonthRange,
  financialMonthStartDate,
} from '~/utils/financialMonth';
import { dayKeyFromDateLocal } from '~/utils/formatters';

/**
 * The three zoom levels a review can be read at. Each one enumerates only
 * *completed* periods: a week/month/year that is still running has partial
 * numbers, and a "12% lighter than last week" verdict drawn from three days of
 * data is noise rather than insight.
 */
export type ReviewZoom = 'week' | 'month' | 'year';

export const REVIEW_ZOOMS = ['week', 'month', 'year'] as const satisfies readonly ReviewZoom[];

export function isReviewZoom(value: unknown): value is ReviewZoom {
  return value === 'week' || value === 'month' || value === 'year';
}

export interface ReviewPeriod {
  zoom: ReviewZoom;
  /** Stable identity, e.g. `week:2026-07-27`, `month:2026-07`, `year:2026`. */
  key: string;
  /** Inclusive day keys (`YYYY-MM-DD`) bounding the period. */
  start: string;
  end: string;
}

/**
 * How far back the period rail goes. Bounded so a long-lived ledger does not
 * render hundreds of pills; the oldest logged transaction clamps it shorter.
 */
export const MAX_REVIEW_PERIODS: Record<ReviewZoom, number> = {
  week: 52,
  month: 36,
  year: 10,
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function weekPeriod(start: Date): ReviewPeriod {
  const startKey = dayKeyFromDateLocal(start);
  return {
    zoom: 'week',
    key: `week:${startKey}`,
    start: startKey,
    end: dayKeyFromDateLocal(addDays(start, 6)),
  };
}

function monthPeriod(monthKey: string, monthCycle: MonthCycleInput): ReviewPeriod {
  const { start, endInclusive } = financialMonthRange(monthKey, monthCycle);
  return {
    zoom: 'month',
    key: `month:${monthKey}`,
    start: dayKeyFromDateLocal(start),
    end: dayKeyFromDateLocal(endInclusive),
  };
}

function yearPeriod(year: number): ReviewPeriod {
  return {
    zoom: 'year',
    key: `year:${year}`,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

/**
 * Start of the week `date` falls in, honouring the user's `weekStartsOn`
 * (0 = Sunday .. 6 = Saturday, matching `Date.getDay()`).
 */
export function startOfWeekFor(date: Date, weekStartsOn: WeekStartsOn): Date {
  const day = startOfDay(date);
  const diff = (day.getDay() - weekStartsOn + 7) % 7;
  return addDays(day, -diff);
}

/**
 * The most recent period of `zoom` that has fully elapsed as of `today` — i.e.
 * the one immediately before the period currently running.
 */
export function lastCompletedPeriod({
  zoom,
  today,
  weekStartsOn,
  monthCycle,
}: {
  zoom: ReviewZoom;
  today: Date;
  weekStartsOn: WeekStartsOn;
  monthCycle: MonthCycleInput;
}): ReviewPeriod {
  if (zoom === 'week') {
    return weekPeriod(addDays(startOfWeekFor(today, weekStartsOn), -7));
  }
  if (zoom === 'month') {
    const currentKey = financialMonthKeyForDate(today, monthCycle);
    const previousStart = addFinancialMonths(
      financialMonthStartDate(currentKey, monthCycle),
      -1,
      monthCycle,
    );
    return monthPeriod(financialMonthKeyForDate(previousStart, monthCycle), monthCycle);
  }
  return yearPeriod(today.getFullYear() - 1);
}

/** The period `offset` steps before `period` (positive `offset` goes back in time). */
export function shiftPeriod(
  period: ReviewPeriod,
  offset: number,
  monthCycle: MonthCycleInput,
): ReviewPeriod {
  if (period.zoom === 'week') {
    return weekPeriod(addDays(parseDayKey(period.start), -7 * offset));
  }
  if (period.zoom === 'month') {
    const monthKey = period.key.slice('month:'.length);
    const shifted = addFinancialMonths(
      financialMonthStartDate(monthKey, monthCycle),
      -offset,
      monthCycle,
    );
    return monthPeriod(financialMonthKeyForDate(shifted, monthCycle), monthCycle);
  }
  return yearPeriod(Number(period.key.slice('year:'.length)) - offset);
}

/**
 * Every completed period of `zoom`, oldest first, from the earliest logged
 * transaction up to the last completed one, capped at `MAX_REVIEW_PERIODS`.
 *
 * `earliestTransactionDate` is a day key; when absent (an empty ledger) only
 * the single most recent completed period is offered, so the screen still has
 * a period to render its empty state against.
 */
export function listCompletedPeriods({
  zoom,
  today,
  weekStartsOn,
  monthCycle,
  earliestTransactionDate,
}: {
  zoom: ReviewZoom;
  today: Date;
  weekStartsOn: WeekStartsOn;
  monthCycle: MonthCycleInput;
  earliestTransactionDate?: string | null;
}): ReviewPeriod[] {
  const latest = lastCompletedPeriod({ zoom, today, weekStartsOn, monthCycle });
  if (!earliestTransactionDate) return [latest];

  const periods: ReviewPeriod[] = [];
  for (let offset = 0; offset < MAX_REVIEW_PERIODS[zoom]; offset += 1) {
    const period = offset === 0 ? latest : shiftPeriod(latest, offset, monthCycle);
    periods.push(period);
    // Once the window reaches back past the first thing the user ever logged,
    // every earlier period would be empty.
    if (period.start <= earliestTransactionDate) break;
  }

  return periods.reverse();
}

/** True when `dayKey` falls inside the period (both bounds inclusive). */
export function periodContains(period: ReviewPeriod, dayKey: string): boolean {
  return dayKey >= period.start && dayKey <= period.end;
}

/** The financial-month key a `month` period refers to (`null` for other zooms). */
export function monthKeyOfPeriod(period: ReviewPeriod): string | null {
  return period.zoom === 'month' ? period.key.slice('month:'.length) : null;
}

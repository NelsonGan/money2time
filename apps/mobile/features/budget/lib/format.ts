import type { ColorPalette } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import type { BudgetPeriod, MonthCycleInput, UserSettings, WeekStartsOn } from '~/types';
import {
  dateFromDayKeyLocal,
  formatAmount,
  formatMonthYearLabel,
  parseMonthKey,
} from '~/utils/formatters';

import { budgetPeriodRange } from './budgetPeriods';

/** Money formatting regardless of the global time display mode. */
export function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

/** "3 categories" / "1 category" — picks the right plural key. */
export function categoriesCountLabel(count: number): string {
  return I18n.t(count === 1 ? 'budget.categories_count_one' : 'budget.categories_count_other', {
    count,
  });
}

/** 'YYYY-MM' → localized month label, e.g. "June 2026". */
export function monthKeyLabel(monthKey: string, locale?: string): string {
  return formatMonthYearLabel(parseMonthKey(monthKey) ?? new Date(), locale);
}

const monthNameFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** 'YYYY-MM' → the month's name alone, e.g. "October". */
export function monthNameLabel(monthKey: string, locale?: string): string {
  const resolved = locale ?? I18n.locale ?? 'en';
  let formatter = monthNameFormatterCache.get(resolved);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(resolved, { month: 'long' });
    monthNameFormatterCache.set(resolved, formatter);
  }
  return formatter.format(parseMonthKey(monthKey) ?? new Date());
}

/** '46%', capped at '999%+' so a wildly blown budget can't stretch layouts. */
export function usagePercentLabel(ratio: number): string {
  const percent = Math.round(ratio * 100);
  return percent > 999 ? '999%+' : `${percent}%`;
}

/** Traffic-light health: green while healthy, amber from 80%, red when over. */
export function usageColor(ratio: number, themeColors: ColorPalette): string {
  if (ratio > 1) return themeColors.error;
  if (ratio >= 0.8) return themeColors.accent;
  return themeColors.success;
}

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** "Oct 26" / "26 Oct" (with the year when asked), as the locale writes a short day. */
export function budgetShortDayLabel(dayKey: string, locale?: string, withYear = false): string {
  const resolved = locale ?? I18n.locale ?? 'en';
  const cacheKey = `${resolved}|${withYear ? 'y' : ''}`;
  let formatter = dayFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(resolved, {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' as const } : {}),
    });
    dayFormatterCache.set(cacheKey, formatter);
  }
  return formatter.format(dateFromDayKeyLocal(dayKey));
}

/**
 * A budget period's title: "Oct 26 – Nov 1" for a week, "October 2026" for a
 * month, "2026" for a year. A week outside this year, or spanning two years,
 * names its years ("Dec 29, 2025 – Jan 4, 2026").
 */
export function budgetPeriodLabel(
  period: BudgetPeriod,
  key: string,
  locale: string | undefined,
  monthCycle: MonthCycleInput,
  now: Date = new Date(),
): string {
  if (period === 'month') return monthKeyLabel(key, locale);
  if (period === 'year') return key;
  const range = budgetPeriodRange(period, key, monthCycle);
  const thisYear = String(now.getFullYear());
  const withYear = range.start.slice(0, 4) !== thisYear || range.end.slice(0, 4) !== thisYear;
  return I18n.t('budget.week_range', {
    start: budgetShortDayLabel(range.start, locale, withYear),
    end: budgetShortDayLabel(range.end, locale, withYear),
  });
}

/** "Weekly" / "Monthly" / "Yearly". */
export function budgetPeriodName(period: BudgetPeriod): string {
  return I18n.t(`budget.period_${period}`);
}

const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** "A new budget starts every Monday." — when the next budget of `period` begins. */
export function budgetPeriodStartHint(
  period: BudgetPeriod,
  weekStartsOn: WeekStartsOn,
  locale?: string,
): string {
  if (period !== 'week') return I18n.t(`budget.repeats_hint_${period}`);
  const resolved = locale ?? I18n.locale ?? 'en';
  let formatter = weekdayFormatterCache.get(resolved);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(resolved, { weekday: 'long' });
    weekdayFormatterCache.set(resolved, formatter);
  }
  // 1 Jan 2023 was a Sunday, so day 1 + n falls on weekday n. A recent date
  // at noon: an old one can sit under a historical UTC offset that tips it
  // into the day before.
  const day = formatter.format(new Date(2023, 0, 1 + weekStartsOn, 12));
  return I18n.t('budget.repeats_hint_week', { day });
}

/**
 * The ends of a run of periods for copy such as "Aug 31 to Oct 25": for weeks
 * the first week's first day and the last week's last day (two ranges back to
 * back read badly), otherwise each end's own label.
 */
export function budgetSpanLabels(
  period: BudgetPeriod,
  firstKey: string,
  lastKey: string,
  locale: string | undefined,
  monthCycle: MonthCycleInput,
): { first: string; last: string } {
  if (period !== 'week' || firstKey === lastKey) {
    return {
      first: budgetPeriodLabel(period, firstKey, locale, monthCycle),
      last: budgetPeriodLabel(period, lastKey, locale, monthCycle),
    };
  }
  return {
    first: budgetShortDayLabel(firstKey, locale),
    last: budgetShortDayLabel(budgetPeriodRange(period, lastKey, monthCycle).end, locale),
  };
}

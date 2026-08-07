import { I18n } from '~/lib/i18n';
import type { UserSettings } from '~/types';
import { formatAmount, formatMonthYearLabel, parseMonthKey } from '~/utils/formatters';

import type { ReviewBar, ReviewPace } from './reviewMath';
import type { ReviewPeriod, ReviewZoom } from './reviewPeriods';

function resolveLocale(locale?: string) {
  return locale ?? I18n.locale ?? I18n.defaultLocale ?? 'en';
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, created);
  return created;
}

/** Money formatting regardless of the global time display mode. */
export function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

/** "27 Jul" — the short form used on the period pills and standout rows. */
export function shortDayLabel(dayKey: string, locale?: string): string {
  return formatter(resolveLocale(locale), { day: 'numeric', month: 'short' }).format(
    parseDayKey(dayKey),
  );
}

/** "Sat 1 Aug" — a day with its weekday, for the standouts card. */
export function weekdayDayLabel(dayKey: string, locale?: string): string {
  return formatter(resolveLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(parseDayKey(dayKey));
}

/** The label on a period pill: "27 Jul" / "Jul" / "2026". */
export function periodPillLabel(period: ReviewPeriod, locale?: string): string {
  if (period.zoom === 'week') return shortDayLabel(period.start, locale);
  if (period.zoom === 'month') {
    return formatter(resolveLocale(locale), { month: 'short' }).format(parseDayKey(period.start));
  }
  return period.key.slice('year:'.length);
}

/** The header label for the selected period: a range, a month, or a year. */
export function periodTitle(period: ReviewPeriod, locale?: string): string {
  if (period.zoom === 'week') {
    return I18n.t('review.week_range', {
      start: shortDayLabel(period.start, locale),
      end: shortDayLabel(period.end, locale),
    });
  }
  if (period.zoom === 'month') {
    return formatMonthYearLabel(
      parseMonthKey(period.key.slice('month:'.length)) ?? new Date(),
      locale,
    );
  }
  return period.key.slice('year:'.length);
}

/** A trend bar's tick label: weekday initial, week number, or month initial. */
export function barLabel(bar: ReviewBar, zoom: ReviewZoom, locale?: string): string {
  const resolved = resolveLocale(locale);
  if (zoom === 'week') {
    // A single letter keeps seven ticks legible on a narrow phone; some locales
    // have no one-letter form, in which case `narrow` returns their shortest.
    return formatter(resolved, { weekday: 'narrow' }).format(parseDayKey(bar.start));
  }
  if (zoom === 'month') {
    return I18n.t('review.week_tick', { index: bar.key.slice(1) });
  }
  return formatter(resolved, { month: 'narrow' }).format(parseDayKey(bar.start));
}

/** "-12%" / "+4%", or null when there is nothing to compare against. */
export function deltaLabel(changeRatio: number): string {
  const percent = Math.round(changeRatio * 100);
  if (percent === 0) return I18n.t('review.delta_flat');
  const capped = Math.min(Math.abs(percent), 999);
  return percent > 0 ? `+${capped}%` : `-${capped}%`;
}

/** "46%", capped so a wildly blown budget cannot stretch the layout. */
export function pacePercentLabel(ratio: number): string {
  const percent = Math.round(ratio * 100);
  return percent > 999 ? '999%+' : `${percent}%`;
}

/** "$320 left" / "$85 over" — the badge beside the pace percentage. */
export function paceBadgeLabel(pace: ReviewPace, settings: UserSettings): string {
  const difference = money(Math.abs(pace.target - pace.spent), settings);
  return I18n.t(pace.state === 'over' ? 'review.pace_over' : 'review.pace_left', {
    amount: difference,
  });
}

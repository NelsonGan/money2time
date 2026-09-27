const dayLabelFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayLabelWithYearFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayHeaderLabelCache = new Map<string, { dateLabel: string; weekdayLabel: string }>();

function getDayLabelFormatter(locale: string) {
  const cached = dayLabelFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  });
  dayLabelFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getDayLabelWithYearFormatter(locale: string) {
  const cached = dayLabelWithYearFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  dayLabelWithYearFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getWeekdayFormatter(locale: string) {
  const cached = weekdayFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  weekdayFormatterByLocale.set(locale, formatter);
  return formatter;
}

/** Same day label and weekday badge used by the home transaction list. */
export function formatDayHeaderParts(
  dayKey: string,
  locale: string,
): { dateLabel: string; weekdayLabel: string } {
  const currentYear = new Date().getFullYear();
  const cacheKey = `${locale}|${currentYear}|${dayKey}`;
  const cached = dayHeaderLabelCache.get(cacheKey);
  if (cached) return cached;

  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { dateLabel: dayKey, weekdayLabel: '' };
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return { dateLabel: dayKey, weekdayLabel: '' };

  const dateLabel =
    year !== currentYear
      ? getDayLabelWithYearFormatter(locale).format(date)
      : getDayLabelFormatter(locale).format(date);
  const weekdayLabel = getWeekdayFormatter(locale).format(date);
  const next = { dateLabel, weekdayLabel };
  dayHeaderLabelCache.set(cacheKey, next);

  return next;
}

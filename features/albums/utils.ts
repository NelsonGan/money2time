import { I18n } from '~/lib/i18n';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

const rangeFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const rangeFormatterWithYearByLocale = new Map<string, Intl.DateTimeFormat>();

function dayLabel(dayKey: string, withYear: boolean, locale: string): string {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
  if (Number.isNaN(date.getTime())) return dayKey;
  const cache = withYear ? rangeFormatterWithYearByLocale : rangeFormatterByLocale;
  let formatter = cache.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : null),
    });
    cache.set(locale, formatter);
  }
  return formatter.format(date);
}

/** Human-friendly "Mar 3 – Mar 9" range from two transaction date strings. */
export function formatAlbumDateRange(
  startDate: string | null,
  endDate: string | null,
  options: { locale?: string; alwaysShowYear?: boolean } = {},
): string | null {
  if (!startDate || !endDate) return null;
  const { locale = I18n.locale ?? 'en', alwaysShowYear = false } = options;
  const startKey = dayKeyFromIsoLocal(startDate);
  const endKey = dayKeyFromIsoLocal(endDate);
  const currentYear = String(new Date().getFullYear());
  const spansOtherYear = !startKey.startsWith(currentYear) || !endKey.startsWith(currentYear);
  const withYear = alwaysShowYear || spansOtherYear;
  const startLabel = dayLabel(startKey, withYear, locale);
  if (startKey === endKey) return startLabel;
  const endLabel = dayLabel(endKey, withYear, locale);
  return `${startLabel} – ${endLabel}`;
}

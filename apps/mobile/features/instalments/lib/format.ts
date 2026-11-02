import { I18n } from '~/lib/i18n';

/**
 * "2 Nov", or "2 Nov 2027" when the date is not in the current year: the
 * short form the plan screens use, where the year is noise for anything close.
 */
export function formatPlanDay(dateIso: string, now: Date = new Date()): string {
  const date = new Date(dateIso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(I18n.locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

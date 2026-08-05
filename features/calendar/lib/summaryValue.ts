import type { UserSettings } from '~/types';
import { formatAmount } from '~/utils/formatters';

type SummaryFormatSettings = Pick<UserSettings, 'currencySymbol' | 'displayMode'>;

/**
 * How many characters the income/expense summary card can show before its
 * shrink-to-fit (`IN_OUT_VALUE_TEXT_PROPS` in `~/components/navigation/InOutHeader`)
 * bottoms out. The card gives the amount roughly half the screen width minus
 * the clay icon, which is ~100dp on a 360dp Android phone, or ~14 characters of
 * 16px mono at the 0.7 minimum scale.
 */
export const SUMMARY_VALUE_MAX_CHARS = 14;

/**
 * Format a month total for the income/expense summary cards.
 *
 * Amounts that fit stay exact and simply shrink; past the budget the smallest
 * scale still runs out of room, so fall back to the abbreviated form (RM12.3M)
 * rather than clip the number.
 */
export function formatSummaryAmount(value: number, settings: SummaryFormatSettings): string {
  const full = formatAmount(value, settings, { showSign: false });
  if (full.length <= SUMMARY_VALUE_MAX_CHARS) return full;
  return formatAmount(value, settings, { showSign: false, compact: true });
}

import type { ColorPalette } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import type { UserSettings } from '~/types';
import { formatAmount, formatMonthYearLabel, parseMonthKey } from '~/utils/formatters';

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

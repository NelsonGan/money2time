import type { ColorPalette } from '~/constants/designSystem';
import type { UserSettings } from '~/types';
import { formatAmount } from '~/utils/formatters';

/** Money formatting regardless of the global time display mode. */
export function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

/** Traffic-light health: green while healthy, amber from 80%, red when over. */
export function usageColor(ratio: number, themeColors: ColorPalette): string {
  if (ratio > 1) return themeColors.error;
  if (ratio >= 0.8) return themeColors.accent;
  return themeColors.success;
}

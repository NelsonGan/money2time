import { withColorAlpha } from '~/utils/color';

/**
 * The fill and edge on an entry a recurring rule made, in the lists
 * (`TransactionItem`). Lavender is the
 * same in every theme colour and differs from the green payback and the amber
 * "friends owe" tints; the lists drop it while selecting, where a primary
 * close to lavender (Indigo, Ocean) would look selected.
 */
export function recurringTintColors(
  lavender: string,
  theme: 'light' | 'dark',
): { fill: string; edge: string } {
  return theme === 'dark'
    ? { fill: withColorAlpha(lavender, 0.16), edge: withColorAlpha(lavender, 0.36) }
    : { fill: withColorAlpha(lavender, 0.13), edge: withColorAlpha(lavender, 0.4) };
}

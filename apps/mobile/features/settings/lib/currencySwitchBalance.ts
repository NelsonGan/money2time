import type { RateTable } from '~/types';
import { convert } from '~/utils/currency';

/**
 * The balance field shows the converted balance rounded to cents, so a typed
 * value within half a cent of the conversion is that preview, not an edit.
 */
const PREVIEW_ROUNDING = 0.005 + 1e-9;

/**
 * When an account's currency and its balance are edited in the same save, the
 * history is re-denominated first and the typed balance is then recorded on
 * top of it. Returns that change in the new currency, or null when the user
 * only switched the currency.
 *
 * `balanceEdited` matters because a chain of switches (MYR -> USD -> THB)
 * rounds the preview at every step, which can land it a few cents (or, into a
 * currency like IDR, a lot more) away from a direct conversion.
 */
export function balanceChangeWithCurrencySwitch(input: {
  balanceEdited: boolean;
  typedBalance: number;
  currentBalance: number;
  fromCurrency: string;
  toCurrency: string;
  rateTable: RateTable;
}): number | null {
  if (!input.balanceEdited || !Number.isFinite(input.typedBalance)) return null;
  const converted = convert(
    input.currentBalance,
    input.fromCurrency,
    input.toCurrency,
    input.rateTable,
  ).value;
  const delta = input.typedBalance - converted;
  return Math.abs(delta) <= PREVIEW_ROUNDING ? null : delta;
}

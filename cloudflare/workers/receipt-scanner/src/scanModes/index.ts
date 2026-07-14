// Router for the receipt scan modes. Each mode is a distinct path with its own
// file — ./quick.ts and ./itemized.ts — holding its prompt, token budget, and
// response parsing. This file only preps the inputs both paths need (the user's
// expense category list + the app's reporting currency) and dispatches to one.
// A single scan runs exactly one path; they never mix.

import { buildItemizedPrompt, ITEMIZED_MAX_TOKENS } from './itemized';
import { buildQuickPrompt, QUICK_MAX_TOKENS } from './quick';

export type { ScannedReceiptDetail, ScannedReceiptItem } from './itemized';
export { normalizeReceiptDetail } from './itemized';

// Fallback category list when the app sends none (mirrors the app's 8 defaults).
const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Housing',
  'Bills',
  'Healthcare',
  'Shopping',
  'Other',
];

/** A valid 3-letter ISO-ish currency code, uppercased; falls back to USD. */
function normalizeCurrencyCode(currency: string): string {
  return typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
    ? currency.trim().toUpperCase()
    : 'USD';
}

export type ScanMode = 'quick' | 'itemized';

/** Select and build the prompt for `mode` from the shared category/currency inputs. */
export function buildReceiptPrompt(
  categories: string[],
  currency: string,
  mode: ScanMode = 'quick',
): string {
  const list =
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_EXPENSE_CATEGORIES;
  // De-dupe, trim, and keep it a clean comma list for the model.
  const allowed = Array.from(new Set(list.map((c) => String(c).trim()).filter(Boolean)));
  const allowedLine = allowed.join(', ');
  const currencyCode = normalizeCurrencyCode(currency);

  return mode === 'itemized'
    ? buildItemizedPrompt(allowedLine, currencyCode)
    : buildQuickPrompt(allowedLine, currencyCode);
}

/** The output-token budget for `mode` (each path owns its own). */
export function maxTokensForMode(mode: ScanMode): number {
  return mode === 'itemized' ? ITEMIZED_MAX_TOKENS : QUICK_MAX_TOKENS;
}

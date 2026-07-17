// Router for the receipt scan modes. Each mode is a distinct path with its own
// file — ./quick.ts, ./itemized.ts, and ./screenshot.ts — holding its prompt,
// token budget, and response parsing. This file only preps the inputs the paths
// share (the user's expense category list, the app's reporting currency, and —
// screenshot mode only — the user's account names) and dispatches to one.
// A single scan runs exactly one path; they never mix.

import { buildItemizedPrompt, ITEMIZED_MAX_TOKENS } from './itemized';
import { buildQuickPrompt, QUICK_MAX_TOKENS } from './quick';
import { buildScreenshotPrompt, SCREENSHOT_MAX_TOKENS } from './screenshot';

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

export type ScanMode = 'quick' | 'itemized' | 'screenshot';

/** De-dupe, trim, and keep a clean comma list for the model. */
function toAllowedLine(list: string[]): string {
  return Array.from(new Set(list.map((c) => String(c).trim()).filter(Boolean))).join(', ');
}

/**
 * Select and build the prompt for `mode` from the shared category/currency
 * inputs. `accounts` (the user's account names) feeds screenshot mode's
 * account detection; the other modes ignore it.
 */
export function buildReceiptPrompt(
  categories: string[],
  currency: string,
  mode: ScanMode = 'quick',
  accounts: string[] = [],
): string {
  const list =
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_EXPENSE_CATEGORIES;
  const allowedLine = toAllowedLine(list);
  const currencyCode = normalizeCurrencyCode(currency);

  if (mode === 'itemized') return buildItemizedPrompt(allowedLine, currencyCode);
  if (mode === 'screenshot') {
    const accountsLine = toAllowedLine(Array.isArray(accounts) ? accounts : []);
    return buildScreenshotPrompt(allowedLine, currencyCode, accountsLine);
  }
  return buildQuickPrompt(allowedLine, currencyCode);
}

/** The output-token budget for `mode` (each path owns its own). */
export function maxTokensForMode(mode: ScanMode): number {
  if (mode === 'itemized') return ITEMIZED_MAX_TOKENS;
  if (mode === 'screenshot') return SCREENSHOT_MAX_TOKENS;
  return QUICK_MAX_TOKENS;
}

// Router for the scan modes (./quick, ./itemized, ./screenshot). Preps the
// shared inputs (categories, currency, and — screenshot only — account names)
// and dispatches to exactly one mode.

import { buildItemizedPrompt, ITEMIZED_MAX_TOKENS } from './itemized';
import type { ReceiptPrompt } from './prompt';
import { buildQuickPrompt, QUICK_MAX_TOKENS } from './quick';
import { buildScreenshotPrompt, SCREENSHOT_MAX_TOKENS } from './screenshot';

export type { ScannedReceiptDetail, ScannedReceiptItem } from './itemized';
export { normalizeReceiptDetail } from './itemized';
export type { ReceiptPrompt } from './prompt';

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

// Build the prompt for `mode`, as a cacheable static `system` block plus the
// per-request `user` values (see ./prompt.ts). `accounts` feeds screenshot
// detection; other modes ignore it.
export function buildReceiptPrompt(
  categories: string[],
  currency: string,
  mode: ScanMode = 'quick',
  accounts: string[] = [],
): ReceiptPrompt {
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

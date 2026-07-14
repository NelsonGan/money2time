// Router for the receipt-parsing prompts. Each scan mode is a distinct path
// with its own self-contained prompt (./prompts/quick.ts, ./prompts/itemized.ts).
// This file only prepares the inputs both paths need — the user's expense
// category list and the app's reporting currency — and dispatches to one of
// them. A single scan sends exactly one prompt; the paths never mix.

import { buildItemizedPrompt } from './prompts/itemized';
import { buildQuickPrompt } from './prompts/quick';

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

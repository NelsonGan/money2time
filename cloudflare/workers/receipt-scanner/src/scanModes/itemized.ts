// Itemized scan mode — the quick envelope PLUS a "receiptDetail" line-item list
// (single-receipt images only) for the app's Split-by-Item flow. Holds its
// prompt, token budget, receiptDetail shape, and that shape's normalization.

import type { ReceiptPrompt } from './prompt';

// Bigger budget: the full line-item list needs far more room than a total.
export const ITEMIZED_MAX_TOKENS = 5000;

export type Confidence = 'high' | 'low';

export interface ScannedReceiptItem {
  name: string;
  quantity: number;
  lineTotal: number;
  confidence: Confidence;
}

export interface ScannedReceiptDetail {
  merchant: string | null;
  /** Raw model date here; index.ts clamps it (30 days back / 2 days ahead, else today) before responding. */
  date: string | null;
  currency: string | null;
  items: ScannedReceiptItem[];
  itemsConfidence: Confidence;
}

// Static half of the prompt — see ./prompt.ts for why the user-specific values
// live in the user turn instead of being interpolated in here.
const ITEMIZED_SYSTEM_PROMPT = `You are a receipt-parsing engine for a personal finance app, given an image of one or more receipts. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

1. Emit exactly ONE transaction per receipt (the "transactions" array).
2. When the image holds exactly ONE receipt, ALSO emit a "receiptDetail" object listing its line items. Omit "receiptDetail" entirely for multi-receipt images or when there is no readable receipt.

## Finding the total (for the transaction amount)
The final total is what the customer actually paid, AFTER tax, tip and discounts — usually the largest money figure near the bottom, labelled TOTAL, GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore SUBTOTAL, tax/VAT/GST lines, AMOUNT TENDERED / CASH / CARD / CHANGE, and loyalty balances.

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"<REPORTING_CURRENCY>","date":"YYYY-MM-DD","category":"Other","note":"string"}],"receiptDetail":{"merchant":"string","date":"YYYY-MM-DD","currency":"USD","items":[{"name":"string","quantity":1,"lineTotal":0.00,"confidence":"high"}],"itemsConfidence":"high"}}

- transactions[].amount/currency follow the total rules above; "currency" is ALWAYS the "Reporting currency" code given in the user message, copied verbatim in place of <REPORTING_CURRENCY>.
- receiptDetail.currency: the ISO code detected from the receipt's own symbols/labels (e.g. "MYR", "JPY"); null when unsure — never guess.
- items: one entry per purchased line, top to bottom. ALWAYS include "quantity": the printed count of units on that line (a whole number when the receipt shows "2", "3x", "2 @", etc.; default 1; a weight like 0.45 is allowed). "lineTotal" is that line's total pre-tax cost for ALL its units (fold in any per-item discount), number only, 2 decimals. Do NOT include subtotal, tax, service charge, tips, receipt-level discounts, rounding, change, loyalty points, or payment lines as items — the app adds tax/service itself.
- "confidence" / "itemsConfidence": "high" | "low" ("low" when hard to read). If the item section is unreadable, return "items":[] with "itemsConfidence":"low". Never invent items.
- date fields: "YYYY-MM-DD"; infer the recent plausible year from a day/month; null if absent.
- transactions[].category: the single best fit from the "Allowed categories" list in the user message — the value must match EXACTLY, case included. If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

If the image has no readable receipt, return {"transactions":[]} with no "receiptDetail".`;

export function buildItemizedPrompt(allowedLine: string, currencyCode: string): ReceiptPrompt {
  return {
    system: ITEMIZED_SYSTEM_PROMPT,
    user: `Reporting currency: ${currencyCode}
Allowed categories: ${allowedLine}`,
  };
}

function coerceConfidence(value: unknown): Confidence {
  return value === 'low' ? 'low' : 'high';
}

function normalizeReceiptItem(input: unknown): ScannedReceiptItem | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  const lineTotal = Number(row.lineTotal);
  if (!Number.isFinite(lineTotal) || lineTotal < 0) return null;
  const quantity = Number(row.quantity);
  return {
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    lineTotal: Math.round(lineTotal * 100) / 100,
    confidence: coerceConfidence(row.confidence),
  };
}

// Normalize the model's `receiptDetail`, dropping malformed items; null when
// absent (multi-receipt images never send one).
export function normalizeReceiptDetail(parsed: unknown): ScannedReceiptDetail | null {
  const raw = (parsed as { receiptDetail?: unknown })?.receiptDetail;
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items = itemsRaw
    .map(normalizeReceiptItem)
    .filter((item): item is ScannedReceiptItem => item !== null);

  const date =
    typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  const currency =
    typeof row.currency === 'string' && /^[A-Za-z]{3}$/.test(row.currency.trim())
      ? row.currency.trim().toUpperCase()
      : null;

  return {
    merchant: typeof row.merchant === 'string' && row.merchant.trim() ? row.merchant.trim() : null,
    date,
    currency,
    items,
    itemsConfidence: coerceConfidence(row.itemsConfidence),
  };
}

// Itemized scan mode — the quick envelope PLUS a "receiptDetail" line-item list
// (single-receipt images only) for the app's Split-by-Item flow. Its prompt is
// `receipt-scan-itemized` in ../prompts.ts (hosted in PostHog); this file holds
// its token budget, receiptDetail shape, and that shape's normalization.

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

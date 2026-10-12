// Quick scan mode — the default total-only parse: one transaction per receipt,
// no line items. Its prompt is `receipt-scan-quick` in ../prompts.ts (hosted in
// PostHog); this file holds its token budget.

// Headroom over a single total, since an image may hold several receipts.
export const QUICK_MAX_TOKENS = 1200;

// Screenshot scan mode — parses a payment screenshot (bank/wallet app, card
// notification, transfer receipt, photographed receipt) into ONE transaction,
// and matches the on-screen payment source to one of the user's accounts so the
// app can post to the right one. Its prompts are `receipt-scan-screenshot` and
// `receipt-scan-screenshot-accounts` in ../prompts.ts (hosted in PostHog); this
// file holds its token budget.

// One transaction per screenshot; the extra `account` string is tiny, so the
// quick-mode headroom carries over.
export const SCREENSHOT_MAX_TOKENS = 1200;

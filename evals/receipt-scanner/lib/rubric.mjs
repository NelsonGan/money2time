// The grading rubric. Each mode scores what a user of that flow actually
// depends on, weighted by how much a mistake costs them: a wrong amount or a
// payment posted to the wrong account corrupts their books, while a slightly
// off merchant name is a two-second edit. Weights sum to 100 per mode.
//
// Bump RUBRIC_VERSION whenever criteria, weights or anchors change: it is part
// of the judge cache key, so old judgements are never reused under new rules.

export const RUBRIC_VERSION = 1;

export const SCALE = `Score every criterion on this 0-4 scale:
4 = Fully correct. The user would accept it as is.
3 = Minor imperfection with no practical cost (e.g. merchant spelled slightly differently, a defensible second-best category).
2 = Noticeable problem the user has to fix by hand, but the core data is usable.
1 = Major error: wrong data the user may not notice (wrong total, wrong date, wrong account), or most of the content missing.
0 = Completely wrong, missing, invented, or harmful.`;

export const RUBRICS = {
  quick: [
    {
      key: 'amount',
      weight: 40,
      title: 'Amount',
      guide:
        'Each transaction amount equals the final total actually paid (after tax, service, tip, discounts and cash rounding). Picking the subtotal, the cash tendered, the change, a line item, or misreading the number format (1.234,56 / Rp 125.000 / yen) is a 0 or 1. Off by a rounding cent is a 2.',
    },
    {
      key: 'segmentation',
      weight: 15,
      title: 'Receipt count',
      guide:
        'Exactly one transaction per receipt in the image; an empty list when there is no receipt. Splitting one receipt into several rows, merging two receipts, or inventing a transaction from a non-receipt (menu, cup) scores 0.',
    },
    {
      key: 'date',
      weight: 10,
      title: 'Date',
      guide:
        "The date read off the receipt (YYYY-MM-DD), or null when none is printed. Judge the model's RAW date: the Worker then clamps dates older than 30 days to today by design, which is not the model's fault. Swapping day and month against the receipt's locale is a 1. Inventing a date when none is printed is a 1.",
    },
    {
      key: 'category',
      weight: 15,
      title: 'Category',
      guide:
        'Exactly one of the allowed category names, spelled exactly (case and script included). The answer key lists acceptable categories best first: best = 4, another acceptable one = 3, a defensible but not listed one = 2, a poor fit = 1, a name not in the allowed list = 0 (the app cannot use it).',
    },
    {
      key: 'merchant',
      weight: 10,
      title: 'Merchant (note)',
      guide:
        'note is the merchant name as a user would recognise it. Abbreviation or casing differences are fine (4 or 3); a generic or wrong name (e.g. the address, the cashier, "Receipt") is 1; empty is 0.',
    },
    {
      key: 'format',
      weight: 10,
      title: 'Output contract',
      guide:
        'Minified single-line JSON only, schema keys present, type "expense", currency equal to the user\'s currency code (never the receipt\'s own currency, never converted). Code fences or prose around valid JSON is a 3 (the Worker tolerates it, but it wastes tokens). Wrong currency code or unparseable output is 0.',
    },
  ],
  itemized: [
    {
      key: 'amount',
      weight: 15,
      title: 'Total amount',
      guide:
        'transactions[].amount equals the final total actually paid, same rules as quick mode.',
    },
    {
      key: 'segmentation',
      weight: 10,
      title: 'Receipt count & detail presence',
      guide:
        'One transaction per receipt. receiptDetail is present for exactly one receipt and OMITTED for multi-receipt images and non-receipts. Wrong presence of receiptDetail is at most a 1.',
    },
    {
      key: 'completeness',
      weight: 20,
      title: 'Item completeness',
      guide:
        'Every purchased line appears once, in receipt order; nothing missing, nothing duplicated. Lose a point for each missing line on short receipts; on long receipts score by proportion missing.',
    },
    {
      key: 'accuracy',
      weight: 20,
      title: 'Item accuracy',
      guide:
        "Each item's lineTotal is the pre-tax total for ALL its units, with any per-item discount folded in; quantity is the printed count (or weight); names are faithful to the receipt (abbreviations or sensible expansions are fine, invented dishes are not). A wrong lineTotal on any item is at most a 2.",
    },
    {
      key: 'exclusions',
      weight: 10,
      title: 'Non-items excluded',
      guide:
        'No subtotal, tax/SST/GST/VAT, service charge, tip, receipt-level discount, rounding, payment, change or modifier-only lines appear as items, and quantity sub-lines are not split into separate items. Each such false item costs a point.',
    },
    {
      key: 'metadata',
      weight: 10,
      title: 'Detail metadata',
      guide:
        'merchant, date and the detected receiptDetail.currency (ISO code from the receipt\'s own symbols; null when genuinely ambiguous, never a guess). Confidence flags should be "low" where text is genuinely hard to read and "high" otherwise.',
    },
    {
      key: 'category',
      weight: 5,
      title: 'Category',
      guide: 'Same as quick mode: exact allowed name, best acceptable = 4.',
    },
    {
      key: 'format',
      weight: 10,
      title: 'Output contract',
      guide:
        'Same as quick mode, plus the receiptDetail shape (items[].name/quantity/lineTotal/confidence, itemsConfidence).',
    },
  ],
  screenshot: [
    {
      key: 'amount',
      weight: 30,
      title: 'Amount',
      guide:
        "The amount actually transacted: the headline payment amount on a payment screen, the order total on an order, the final total on a paper receipt. Balances, promo figures, original foreign amounts (when a billed amount in the user's currency is shown) and subtotals are wrong (0 or 1). Always positive.",
    },
    {
      key: 'account',
      weight: 25,
      title: 'Account matching',
      guide:
        'account is EXACTLY one of the user\'s account names when the screen shows a source that clearly matches one of them, otherwise "". Posting to a DIFFERENT real account than the correct one is the costliest error: 0. Naming an account when the answer is "" (ambiguous or no source shown) is a 1. Leaving it "" when a clear match existed is a 2.',
    },
    {
      key: 'segmentation',
      weight: 15,
      title: 'Transaction count',
      guide:
        'One transaction for the payment the screen is about; one per row only for a clear list of payments. Turning noise (promo notifications, chat messages, balances) into a transaction scores 0 or 1.',
    },
    {
      key: 'merchant',
      weight: 10,
      title: 'Merchant / payee (note)',
      guide: "The merchant, payee or payer shown. For a transfer, the recipient's name.",
    },
    {
      key: 'category',
      weight: 10,
      title: 'Category',
      guide: 'Same as quick mode: exact allowed name, best acceptable = 4.',
    },
    {
      key: 'date',
      weight: 5,
      title: 'Date',
      guide: 'Date shown on screen, or null if none. Judge the RAW date as in quick mode.',
    },
    {
      key: 'format',
      weight: 5,
      title: 'Output contract',
      guide:
        'Minified JSON only, schema keys including account, type ALWAYS "expense", currency the user\'s code.',
    },
  ],
};

/** Weighted 0-100 score from 0-4 criterion scores. */
export function weightedScore(mode, scores) {
  return RUBRICS[mode].reduce((sum, c) => sum + (c.weight * (scores[c.key] ?? 0)) / 4, 0);
}

/** JSON schema the judge's answer must satisfy (claude -p --json-schema). */
export function judgeSchema(mode) {
  const criteria = Object.fromEntries(
    RUBRICS[mode].map((c) => [
      c.key,
      {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 4 },
          reason: { type: 'string' },
        },
        required: ['score', 'reason'],
        additionalProperties: false,
      },
    ]),
  );
  return {
    type: 'object',
    properties: {
      criteria: {
        type: 'object',
        properties: criteria,
        required: Object.keys(criteria),
        additionalProperties: false,
      },
      critical_errors: { type: 'array', items: { type: 'string' } },
      user_would_accept: { type: 'boolean' },
      summary: { type: 'string' },
    },
    required: ['criteria', 'critical_errors', 'user_would_accept', 'summary'],
    additionalProperties: false,
  };
}

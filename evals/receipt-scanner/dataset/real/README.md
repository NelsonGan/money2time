# Real receipt photos (private, gitignored)

Everything in this folder except this README is gitignored, so real receipts
never get committed. Each case is an image plus a JSON file sharing its name:

```
dataset/real/
  lunch-0927.jpg
  lunch-0927.json
```

The JSON is a case without `image` (the builder downscales the photo like the
app does). `expect` is optional: leave it out and the Opus judge grades the
answer from the image alone (no strict metrics for that case).

```json
{
  "id": "real-lunch-0927",
  "mode": "quick",
  "notes": "Crumpled kopitiam receipt, total RM 18.40 at the bottom.",
  "tags": ["MYR", "crumpled"],
  "input": { "currency": "MYR", "categories": ["Food", "Groceries", "Transport", "Other"] },
  "expect": {
    "transactions": [
      { "amount": 18.4, "date": "2026-09-27", "category": ["Food"], "note": ["Kedai Kopi Ah Seng"] }
    ]
  }
}
```

For `screenshot` mode add `input.accounts` and an `account` on each expected
transaction (`""` when none should match). For `itemized` mode add
`expect.receiptDetail` with `merchant`, `date`, `currency` (acceptable codes,
`null` allowed), `itemsSubtotal` and `items: [{ name, aliases, quantity, lineTotal }]`.

Dates are checked after the Worker's 30-day clamp, measured from the case's own
`referenceDate` ("today" for that receipt). It defaults to the first expected
transaction's date, so a recent receipt keeps its printed date; set it explicitly
(e.g. `"referenceDate": "2026-10-05"`) to test the clamp on an old receipt.

# PRD: Split by Item — Scan a Receipt, Split It Item-by-Item

## Problem

Split Bill today distributes a flat amount per person: the user reads the
receipt themselves, does the mental math ("you had the pasta and half the
wine…"), and types one number per friend. Real group bills are itemized —
each person consumed specific lines, some items are shared, and tax /
service charge / discounts apply to the whole receipt. The app already has
receipt scanning (OCR via the Cloudflare Worker), but it extracts only the
final total; the line items on the receipt are read by the model and thrown
away.

This feature closes the loop: scan a receipt, review the extracted line
items, assign items to people (whole or shared in portions), let the app
prorate tax/service/discounts, and save — landing in the existing Settle Up
flow with exact per-person debts.

## Goals

- Scan → itemized split in under a minute for a typical restaurant receipt.
- Support the messy realities: shared items ("2-of-3 beers were Bob's"),
  quantity lines, per-item vs receipt-level discounts, service charge, OCR
  mistakes, items that don't sum to the printed total.
- Per-person totals always sum **exactly** to the receipt total (integer
  cents, no drift), and friends never over-owe from rounding.
- Everything downstream works unchanged: the result is a normal expense
  transaction with ordinary `transaction_splits` rows, so Settle Up
  (by-person / by-transaction, mark paid, payback transfers, share receipt)
  needs no rework.
- Manual itemized entry works without a scan — offline, free tier, or when
  OCR fails.

## Non-goals

- **Reusing `transaction_splits` for the itemized data.** The item /
  assignment detail lives in new tables; `transaction_splits` rows are only
  the computed per-person _result_ (the "bridge").
- **Multi-payer.** MVP assumes the user paid the bill and friends owe the
  user, matching the existing split model. "A friend paid, I owe my share"
  is explicitly out of scope (Phase 4 candidate).
- **New monetization gate.** Itemized scanning is metered by the existing
  server-side scan quota (free 5/year, Pro 500/month). Manual itemized
  entry consumes no quota.
- Per-item FX, receipts spanning multiple transactions, recurring or
  non-expense transactions.

## Experience

### Entry points (three, all converging on one screen)

| Entry                     | How                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Post-scan banner**   | The existing "ready to review" banner gains a secondary **"Split items"** chip, shown only when the scan returned ≥2 line items. The primary tap keeps today's quick-review path unchanged.        |
| **B. Transaction editor** | A "Split by item" row inside the Split Bill page opens the itemized editor seeded with the transaction's amount and attached receipt image — offering a re-scan in itemized mode, or manual entry. |
| **C. Settle Up**          | A CTA on the Settle Up screen starts a scan with `intent: 'split'` carried on the scan job, so the ready banner deep-opens the itemized editor directly.                                           |

The camera stays dumb — no mode toggle on it. The Worker parses items
either way (see API section), so "quick vs split" is purely a routing
decision made when the user can already see the result.

### The `ReceiptSplit` screen

A new pushed root-stack route (like `SplitBill`), internally a three-step
pager with a step indicator. The editor publishes a live draft through a
session context (`ReceiptSplitSession`, modeled on `SplitBillSession`) so
navigation semantics (Done / Cancel / swipe-back) match the existing split
page.

#### Step 1 — Items (review + tax)

- Editable list of parsed items: **name + line total only** — no printed
  total, subtotal, or per-field reconciliation. Tap the amount to edit
  (MiniNumpad), rename inline, delete, "+ Add item".
- A quantity > 1 row offers **"split into singles"** (3× Beer → three 1×
  rows) for when individual units have different sharers _and_ different
  prices. Fractional quantities (0.45 kg) never explode — portions handle
  those.
- **Tax & service card**: a percentage stepper (−/value/+) with an **Apply**
  button, exactly like Split Bill's adjustment control. The percentage
  applies on top of the item subtotal and prorates per person by their item
  spend; the items themselves keep their scanned prices so the receipt still
  reads cleanly. Tax is optional (defaults to 0%).
- The hero shows the live grand total (items + tax). Next is enabled once
  there's at least one priced item.
- Low-confidence scans (`itemsConfidence: 'low'` or flagged items) open
  with a warning banner and tinted rows.

#### Step 2 — People & assign

- **How many people?** A count stepper at the top (min 2, incl. "Me").
  Unnamed people are auto-labeled **"Person A", "Person B", …** — a custom
  name per person is optional (a name field on the selected chip, with
  `recentSplitPersonNames` autocomplete).
- Chip row (wraps to multiple lines): "Me" first, then the friends.
  **Select a chip, then tap the items that person had.** Tapping an item
  already assigned to others _adds_ the selected person as a sharer; a
  shared item splits evenly among its people (stacked initials).
- Every item must have a host: unassigned items are flagged, with a
  one-tap **"Assign rest to me"**. Next is blocked while any item is
  unassigned — explicit, never silently defaulted.

#### Step 3 — Summary & save

- Per-person cards: item lines (name, amount) and the person total. Item
  amounts already include any applied tax, so the grand total is just their
  sum.
- Collapsed expense metadata block: account, category, date, note/merchant
  — pre-filled from the scan draft exactly like the quick path. Payback
  accounts are not chosen here (they default to the settings default and
  stay editable in Settle Up).
- **Save** creates the parent expense (full receipt total, paid by the
  user), the itemized rows in the new tables, and the bridge
  `transaction_splits` rows (friends = computed totals, Me = `isSelf`),
  then lands on the Settle Up transaction detail — the immediate payoff of
  who owes what, with the share button.

### After save

Transactions with an itemized receipt split show an **"Itemized receipt"**
row on the Settle Up transaction screen and in the editor, reopening the
itemized editor. Saving a reopen recomputes and rewrites the bridge rows by
person-name match: unpaid rows get new amounts, removed people's unpaid
rows soft-delete, new people get new rows. **Paid rows are frozen** — if a
recompute would change a settled person's total, Save is blocked with a
sheet explaining which people must be marked unpaid first. The shared
receipt card gains real item lines from the new tables (Phase 3).

## Worker API

**A `mode` flag on the existing `/scan` endpoint** — `'quick' | 'itemized'`,
default `'quick'` — so auth, quota metering, rate limiting, and capacity
handling are shared, and old clients get today's behavior byte-for-byte.
The response gains an optional `receiptDetail`, present when exactly one
expense was detected:

```ts
interface ScannedReceiptDetail {
  merchant: string | null;
  date: string | null; // YYYY-MM-DD as printed
  currency: string | null; // detected ISO code, null if unsure
  items: Array<{
    name: string;
    quantity: number; // default 1; fractional allowed
    unitPrice: number | null; // null when only a line total is printed
    lineTotal: number; // after per-item discount, as printed
    confidence: 'high' | 'low'; // low ⇒ pre-flagged in Step 1
  }>;
  subtotal: number | null;
  tax: number; // absolute
  serviceCharge: number; // absolute
  discount: number; // receipt-level, positive
  roundingAdjustment: number; // signed (cash rounding lines)
  total: number; // printed grand total (authoritative)
  itemsConfidence: 'high' | 'low';
}
```

Prompt rules: per-item discounts folded into `lineTotal`; receipt-level
discounts and percentage lines emitted as absolute amounts; never invent
items — an unreadable receipt returns `items: []` with the total set, and
the client falls back to manual item entry (not an error, quota still one
unit). A `schemaVersion` field covers version skew: a missing
`receiptDetail` simply means the banner never offers "Split items".

Client plumbing: `services/receiptScan.native.ts` passes `mode`;
`receiptScan.shared.ts` gains a `resolveScannedReceiptDetail` normalizer
(currency/date handling mirroring `resolveScannedToDraft`); the ScanJob in
`ReceiptScanContext` carries `receiptDetail` so the banner can route.

## Data model

Three new tables (migration `045_receipt_splits.ts`, following the
multi-table `041_budgets.ts` pattern: TEXT id PK, `created_at` /
`updated_at`, `deleted_at` soft delete, partial indexes
`WHERE deleted_at IS NULL`), plus the usual schema.ts entries, mappers,
domain types, a `receiptSplitsRepository`, and `resetSchemaToBaseline()`
entries.

**`receipt_splits`** — header; one live row per transaction (unique partial
index on `transaction_id`):

```
id, transaction_id, currency, merchant, receipt_date,
items_subtotal, tax_amount, service_amount, discount_amount,
adjustment_amount, total_amount, source ('scan' | 'manual'),
receipt_image_uri, created_at, updated_at, deleted_at
```

**`receipt_split_items`**:

```
id, receipt_split_id, name, quantity, unit_price (nullable),
line_total, is_adjustment, sort_order, created_at, updated_at, deleted_at
```

**`receipt_split_item_shares`** — item × person with a portion weight:

```
id, receipt_split_id (denormalized for one-query load), item_id,
person_name, is_self, weight (integer), created_at, updated_at, deleted_at
```

Deliberate simplifications:

- **No participants table.** The participant set is
  `distinct person_name` over shares, using the same trimmed/case-folded
  identity settle-up grouping already uses. Payback account stays on the
  bridge split row where it already lives.
- **No new column on `transaction_splits`.** A transaction has at most one
  live receipt-split header, so "is this itemized?" is answered by looking
  up the header by `transaction_id` — zero migration risk to the hot
  settle-up table, and the aggregators are untouched.
- All amounts are stored in the **receipt currency**, which is the parent
  transaction's currency — matching the existing convention that split
  amounts are in the parent's currency, so Settle Up's frozen-`fxRate`
  reporting conversion works as-is.
- Deleting the parent transaction cascade-soft-deletes header, items, and
  shares (alongside splits, as today). Backup export/import round-trips the
  three new tables.

## Split math

A pure module, `features/transactions/lib/receiptSplitMath.ts` — no RN
imports, Jest-tested, integer cents throughout, largest-remainder rounding
everywhere (generalizing `scaleToTarget` from `splitMath.ts`):

1. **Item → person.** Each item's `lineTotal` splits across its sharers
   proportional to integer weights (equal share = weight 1). Remainder
   cents prefer the `isSelf` sharer — friends never over-owe by rounding.
2. **Proration pool** = `tax + service − discount + adjustment` (signed;
   may be negative), allocated across people proportional to their item
   subtotals. People with zero item subtotal get zero; the degenerate
   all-zero case sends the pool to Me.
3. **Invariant** (asserted in tests): Σ person totals ≡ receipt total in
   cents, always.
4. **Unassigned items** are returned by the function, never defaulted; the
   UI blocks with the one-tap "Assign rest to me" escape.
5. **Exactly one Me row**, written as the `isSelf` bridge split and
   excluded from debts by the existing `!isSelf` filters.

## Edge cases & rules

- **OCR wrong / merged / missed items** — Step 1 is a mandatory review stop
  when confidence is low or the numbers don't reconcile; every field
  editable.
- **Items don't sum to printed total** — the printed total is
  default-authoritative (it's what the user paid); "Add adjustment line" or
  "Trust items" resolves the delta before assignment.
- **Quantity lines** — keep one row and use portion weights by default;
  "split into singles" only when unit-level prices matter. Fractional
  quantities never explode.
- **Discounts** — per-item folded into the line total (it's what the sharer
  consumed); receipt-level prorated across everyone.
- **Service charge % vs absolute** — stored value is always absolute; a %
  helper is an input affordance in manual entry only.
- **Detected currency ≠ app currency** — transaction currency = receipt
  currency, with the standard frozen `reportingCurrency` /
  `reportingAmount` / `fxRate` snapshot at save. No per-item FX.
- **Person assigned but owes nothing** — no bridge split row is written
  (Settle Up filters `amount > 0` anyway); their share rows remain in the
  itemized record for the shared receipt card.
- **Editing after partial settle-up** — paid rows frozen; a recompute that
  changes a paid person's total blocks Save with a "mark unpaid first"
  sheet. Changes touching only unpaid people are free.
- **Deleting the parent transaction** — cascades to header/items/shares.
- **Free tier** — the itemized scan is metered exactly like a quick scan
  (same server-side counter); manual itemized entry is free, offline, and
  unmetered. The receipt-attachment cap is unchanged.
- **Offline / scan failed** — entry points B and C fall back to manual item
  entry; a failed scan job's banner gains "Enter items manually".
- **Duplicate person names** — shares and bridge rows are written with the
  settle-up trimmed/case-folded name key so rollups merge correctly.
- **Version skew** — old Worker + new app: no `receiptDetail`, no "Split
  items" chip. New Worker + old app: the extra field is ignored.

## Rollout phases

**Phase 1 — Foundation + manual itemized split (no Worker change).**
Migration 045 + schema/mappers/types/repository/baseline;
`receiptSplitMath.ts` with tests; `ReceiptSplitSession`; the
`ReceiptSplit` screen (all three steps) with manual item entry; entry
points B and C (manual); bridge-row writes via the existing
`createTransactionWithSplits` / `updateTransactionSplits`; delete cascade;
backup round-trip. _Ships: itemize any bill by hand — already a major
upgrade over flat splits, works offline and on the free tier._

**Phase 2 — OCR integration.** Worker itemized mode + prompt +
`ScannedReceiptDetail`; client plumbing; the banner "Split items" chip
(entry A); split-intent scan from Settle Up; unparseable → manual
fallback; re-scan of a stored receipt image from the editor. _Ships: the
headline feature._

**Phase 3 — Share & polish.** Real item lines on the shared receipt card
and per-person share cards in Settle Up; the "Itemized receipt" reopen row;
the paid-conflict sheet; feature announcement + tutorial coach-mark.
_Ships: the social payoff._

**Phase 4 (later).** Portion presets, per-item crops from the receipt
image, multi-payer ("a friend paid").

## Analytics, i18n, testing

- **Analytics**: `RECEIPT_SPLIT_STARTED` (source: banner/editor/settleup;
  entryMode: scan/manual), `RECEIPT_SPLIT_ITEMS_EDITED` (edit count,
  reconcile action), `RECEIPT_SPLIT_SAVED` (item/person/shared-item counts,
  hasTax/hasService/hasDiscount, currencyMismatch),
  `RECEIPT_SPLIT_ABANDONED` (step), `RECEIPT_SPLIT_REOPENED`; extend
  `RECEIPT_SCAN_COMPLETED` with `mode` and `itemCount`.
- **i18n**: roughly 40 new keys (step titles, reconcile actions, portions
  sheet, blocked-save sheet, fallback notices) across all 23 locales —
  parity test enforced.
- **Testing**: `receiptSplitMath` invariants (property-style
  sums-to-total, largest-remainder determinism, negative pool, weights,
  degenerate zero-subtotal); repository round-trip; `receiptScan.shared`
  resolver normalization; Worker schema validation. No RN render tests,
  per repo convention.

## Success criteria

- A user can go from camera shutter to saved itemized split — including
  fixing one OCR mistake and sharing one item — in under a minute.
- Per-person totals sum exactly to the receipt total in every case the
  math module's property tests can generate.
- Settle Up screens, mark-paid, payback transfers, and the plain-text
  receipt share work on itemized splits with **zero changes** to the
  aggregators or `transaction_splits` schema.
- Manual itemized entry works with no network and no scan quota consumed.
- The existing quick-scan path and flat Split Bill flows are byte-for-byte
  unaffected.

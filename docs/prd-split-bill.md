# PRD: Split Bill — Before & After Entering the Amount

## Problem

The transaction editor's Split Bill flow assumes the total is known first: the
Split button is disabled until the amount is > 0, and the split page only
_distributes_ that fixed total across people. Real receipts often flow the
other way — the user knows what each person ordered (pre-tax line items), and
the printed grand total at the bottom of the receipt includes tax and service
charges (SST / GST / service charge). Users want to itemize per person first
and let the app compute the transaction total.

## Goals

- Let users open Split Bill on a new expense **before** entering an amount and
  build the bill bottom-up: names + per-person amounts.
- Make it trivial to account for taxes/service printed on the receipt by
  applying a **percentage** on top of the entered amounts.
- Preserve a hard invariant afterwards: **editing the transaction amount never
  silently changes what friends owe** — deltas go to the user's own share.
- Leave the existing split-after-amount experience unchanged.

## Non-goals

- Per-item line entry (dish-level itemization) — shares stay one amount per
  person.
- Persisting tax/adjustment metadata — adjustments are baked into the row
  amounts; the data model (`transaction_splits`) is unchanged.
- Recurring or non-expense transactions (splits remain expense-only).

## Experience

### Mode selection

The split page has two modes, decided **per open** of the Split Bill screen:

| Editor amount when Split opens | Mode                                          |
| ------------------------------ | --------------------------------------------- |
| > 0                            | **Distribute** (existing behavior, unchanged) |
| empty / 0                      | **Itemized** (new)                            |

The Split Bill button in the numpad toolbar is now enabled for any expense
(previously it required amount > 0).

### Distribute mode (existing — unchanged)

The editor amount is the fixed total. Rows must sum to it before Done/Save.
"Split evenly" redistributes across unpaid rows; in manual mode the "Me" row
absorbs the remainder. Paid rows are frozen.

### Itemized mode (new)

- There is no fixed total. The header shows a live **Subtotal** (sum of unpaid
  rows) instead of the total and the "X of Y left" indicator.
- The **Me row's amount is editable** (its name stays fixed). Friends are
  entered free-form: name + amount. **No auto-rebalancing between rows** —
  what the user types is what each person pays.
- "Split evenly" is hidden (there is nothing to divide).
- A **Tax & service** card offers a single one-shot adjustment — no text
  input:
  - A **percentage stepper**: defaults to **+10%**, adjusted in ±1 steps via
    − / + buttons (clamped to 1–100), and an **Apply** button that adds that
    percentage proportionally on top of all unpaid rows.
  - Rounding is largest-remainder in integer cents so the result sums exactly;
    leftover cents go to the Me row. Applying twice stacks intentionally
    (e.g. +10% service charge then +6% GST). The stepper resets to 10 each
    time the page opens.
- **Done** requires the subtotal to be > 0 and sets the editor amount to the
  sum of unpaid rows; the split switches to manual (evenly off). Cancel (back
  or swipe) restores everything from before the page opened.

### After exiting the split page

The editor amount is a normal editable field. Any change flows **only to the
Me row** (existing manual-mode reconcile); friends keep their entered amounts.
Reducing the amount below the friends' sum blocks Save with the existing
"over by / unaccounted" error until resolved.

Reopening Split Bill later (amount now > 0) lands in Distribute mode over the
same rows, which are already consistent, so nothing shifts.

## Edge cases & rules

- **Paid rows are always frozen.** Mark-paid rows keep their amount; the
  percentage applies to unpaid rows only.
- **All rows at 0**: the adjustment is hidden behind an "Enter amounts first"
  hint and Done is disabled.
- **Only the Me row on Done**: split mode folds back off — the expense is just
  Me's amount (existing behavior).
- **Invalid in-flight text** (`1.2.3`, empty) counts as 0; blur normalizes to
  two decimals.
- **Edit flow corner**: editing an existing split expense, clearing the amount
  field, then opening Split lands in Itemized mode over the persisted rows.
  This is accepted behavior — the user is re-itemizing; Done recomputes the
  amount.
- Amounts use the app-wide 2-decimal cents math, matching the rest of the
  split feature.

## Success criteria

- A user can create a split expense end-to-end without ever typing the total:
  itemize → adjust for tax → Done → Save.
- The percentage adjustment always sums exactly to the cents-rounded target,
  regardless of rounding.
- Friends' amounts never change as a side effect of editing the transaction
  amount after itemizing.
- Existing distribute-mode flows, settle-up aggregation, and persistence are
  byte-for-byte unaffected.

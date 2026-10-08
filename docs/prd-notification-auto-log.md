# Notification review

Bank and wallet notifications become local drafts. The app never sends notification text to AI or creates a transaction until the user chooses its type.

## Capture and review

- Android keeps system notification access, the master switch and selected source apps. iOS Log Notification uses the Account supplied by the Shortcut, without an extra in-app opt-in.
- On launch, foreground or live capture, read the native queue and durably persist each notification before acknowledging it. Exact capture IDs prevent queue replay.
- Extract currency-labelled numbers locally, respecting regional separators, fractional amounts, and three-decimal currencies. Use the selected account's currency for ambiguous symbols. Do not infer direction, merchant, completion or relevance.
- Keep all monetary candidates, including balances or offers. One candidate pre-fills the amount; multiple candidates require the user to choose. No candidate requires manual entry. Never use unlabelled OTPs, card numbers or references as money.
- Show a floating review action at the top with the unfinished count. Dismissing it keeps the queue, and opening the app again restores it.
- The full review page shows the original text, source and captured time. Each item has Income, Expense and Ignore. The amount and edit button sit at the top right of compact cards. Cards use the detected currency and configured account without extra controls. Edit opens the full transaction editor; saving creates one transaction and completes the original notification through the same duplicate guard. To review has a spaced red count only when items are pending; Recent has no count. The original rounded toggle highlights the active tab. The centered Notifications settings header has no History action; the icon-only History action is beside the Notifications section title on both platforms’ Automation page. Categories use an explicit same-type preset, then the Apple Pay keyword mapping, then the Quick Entry default or fallback. Keyword matching suggests only categories; direction always comes from the user.
- Income All and Expense All process the displayed pending snapshot with each item's selected amount and account. Invalid items remain unfinished. Ignore All works without an amount or account.
- Back, hardware Back and swipe-back warn that leaving will ignore the unfinished snapshot. Cancel stays on the page. Confirm durably ignores those items before navigating; new arrivals remain pending.

## Persistence and limits

Confirmed reviews are manual actions: no inference, scanner credits or automatic-log usage. The existing free account-count restriction still applies to saving, while Ignore remains available. Apple Pay auto-log retains its allowance. Commit the transaction and capture link together before marking history complete. A failed history write can be repaired from that link without creating another transaction; a failed transaction remains pending.

Retain all unfinished items plus only the 10 newest completed history entries. Unfinished items do not expire. This avoids silently losing drafts when more than 10 notifications arrive. Old expense/income history remains historical; it is never reopened or relogged. Data resets, including main-currency reset, successful backup restores and Money Manager imports clear/invalidate local drafts and native queues to prevent stale saves. Failed backup restores preserve drafts. No schema migration or native contract change is needed.

Notification text, candidates and amounts are local data, excluded from analytics and Sentry payloads. Existing drain telemetry records queued/pending counts; successful user decisions emit existing autolog telemetry with `decision: confirm`. Feature first-use and transaction milestones follow actual successful saves.

## Receipt compatibility and release

Receipt photo, itemized and screenshot scanning retain AI, models, prompts, transport and quotas. The app no longer exports a notification scanner client; the Worker rejects retired notification requests before entitlement, quota or AI calls. Cloudflare CI deploys Worker changes on merge. Older app versions cannot process notifications against the retired endpoint until updated; coordinate the app rollout and Worker retirement. No manual production deployment is part of this change.

Verification is recorded in [notification-history-verification.md](notification-history-verification.md).

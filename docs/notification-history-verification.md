# Notification history verification

Reviewed on 2026-10-08 alongside the notification transfer prompt change in PR 570.

## Behavior

- Configured iOS Log Notification shortcuts supply text directly. The separate
  notification-text scanning toggle and its legacy stored preference no longer
  block scans. Android retains system notification access, the master switch and
  selected-app/account checks.
- Both platforms link to Notification History. It stores the 10 newest scanned
  notifications locally, showing the notification, source, capture time and
  expense/income/no-transaction result. A scan error is shown separately as
  **Scan failed** rather than implying that no transaction was detected.
- Retries replace the same capture entry. Setup samples are excluded. Concurrent
  writes are serialized; history storage errors do not block transaction logging.
- Full data resets, transaction-only resets and main-currency changes clear the
  current user's history. A reset invalidates pending scans and history writes
  immediately, so late responses cannot recreate erased transactions/history.
  An app-user identity change also cancels the old notification batch.
  New processed capture rows retain deduplication metadata without raw title/body
  copies. Existing capture records still use their established retention policy;
  historical notifications are not backfilled into this list.
- The result describes detection, not confirmation that a transaction was saved.
  Source changes, duplicate detection and logging allowance can still prevent a
  detected transaction from being saved. Scan failures retain the native capture
  for retry. Notification content is never added to analytics.

## Automated checks

- `npm run check`: type checking, lint and repository formatting passed.
- Full Jest regression suite: **181 suites / 2,559 tests passed**, including
  existing receipt scans and iOS shortcut parsing/account selection.
- New history coverage verifies the 10-entry limit, no-transaction results,
  retry replacement/order, concurrent writes, user isolation, clearing, malformed
  storage recovery and subscriptions. Pipeline regressions verify expense,
  income, discard and failure recording, setup exclusion, legacy opt-in removal,
  and transaction persistence when history storage fails.
- A further review reproduced and fixed late scan persistence after resets and
  user-identity changes. Seven additional regressions cover cancellation during
  native queue reads/inference/history persistence, stale-generation writes,
  pending-write notifications after reset and restored-user identity changes.
  Currency-change reset wiring was reviewed in the app context; the destructive
  currency-change UI was not exercised.
- The six required analytics suites passed: **113 tests**. Tracking documentation
  describes the removed gate and the existing GA4 screen view for the new screen.
  No additional Mixpanel events or per-scan content telemetry were introduced.
- The Android tutorial image and annotation were refreshed to match the removed
  switch. Locale keys remain in parity; new history labels use English fallback
  in locales without translations.

## Manual UI verification

Tested on the visible `m2t_pixel` Android API 36 emulator using the local Metro
development build. Opened Automation, Notifications and History through the UI;
verified empty history, the history button, light/dark layouts, chronological
ordering, persistent history after reload and live result replacement.

Twelve fictional notifications were inserted through the production history
storage API; reading it returned exactly the newest 10. Updating a stored capture
changed its visible result without increasing the count. These are seeded UI
fixtures, not claims of end-to-end scanner calls or new financial transactions.
Screenshots contain only synthetic notification text and generic account names.
A further Android runtime check cleared the 10 synthetic entries, submitted a
late result with the old reset generation and verified history stayed empty.
New-generation writes restored all 10 entries successfully. No ledger reset or
financial transaction changes were performed. The emulator is left open on the
populated history screen.

Final screenshots are in `docs/pr-evidence/notification-history/`:
`android-settings.png`, `android-empty.png`, `android-light.png` and
`android-dark.png`. No before screenshots are claimed.

iOS visual and tablet testing were not completed: this Xcode installation does
not provide a usable visible Simulator window. Physical-phone notification
delivery was not tested. The unchanged prompt's live normal/backup evaluations
remain documented separately in
[notification-transfer-prompt-verification.md](notification-transfer-prompt-verification.md).
No production Worker deployment was performed.

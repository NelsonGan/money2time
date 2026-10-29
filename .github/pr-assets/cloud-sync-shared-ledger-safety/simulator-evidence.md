# Simulator evidence (local stack: wrangler dev + tursodb 0.8.3; simulator = alice, Node phone = bob)

## Per-member prefs (after fix)

- Bob's Household row in the share DB carried prefs_json {defaultPaybackAccountId: bob-acc}; after alice joined, her local prefs_json = null.
- Alice set her own defaultPaybackAccountId; after her sync the share DB's ledgers row has no prefs_json at all.

## Sign-out with unsent shared-ledger entries — first run FAILED (bug in fix)

- Household DB server (8092) stopped; alice added "Unsent dinner (alice)" (outbox 1).
- Cloud Sync member view showed "Offline" (shared failure surfaced — fix 6 works for free member).
- Sign-out confirmation showed the new "Ledgers shared with you leave this phone" note.
- But Sign out went through with no "Sign out anyway" prompt; the entry was deleted locally and never reached the cloud.
- Cause: the failed sync had already flushed the outbox into the replica (push failed), so outbox count was 0. The check must also look at the replica's unpushed changes.
- Measured on device after the app's own failed sync: outbox 0, Household replica stats cdcOperations 5 (unpushed). So "unsent" must include the replica.
- FIX: sharedLedgerSync.hasUnsent = outbox entries for the ledger OR engine.hasUnpushedChanges() (replica cdcOperations > 0); sign-out always runs the final shared sync first.

## Sign-out / Leave with unsent shared entries (after second fix)

- Same setup (8092 down, "Unsent dinner (alice)" made, app's own sync failed, Offline shown).
- Sign out -> "Some entries in ledgers shared with you haven't been sent yet..." with Sign out anyway / Cancel. Cancel kept the session.
- Leave -> refused with unsent_changes: "Your latest entries in this ledger haven't been sent yet. Leave once you're online...". Still a member, entry kept.
- Server back: Offline cleared by itself; Bob's share DB now lists "Unsent dinner (alice)" + Groceries 1-3.

## Reset Data as a member (after fix)

- Confirmation shows "Shared ledgers are not changed...". After Reset: local ledgers = default + Household; Household still 4 entries; share DB still 4 live entries (no tombstones). Work/Side hustle/Main data gone as expected.

## Restore an older backup (after fix)

- Backup taken (Household: Groceries 1 = 42, no milk). Bob then set Groceries 1 = 99 and added "Bob: milk after the backup"; alice synced.
- applyBackupJson(old backup) -> success; Household locally still 99 + milk; no Household rows queued for upload (outbox: exchange_rates/settings/default ledger only).

## Shared failure + failed incoming row (after fix)

- Bob wrote a category with name = null (NOT NULL here). Alice: outcome.error "Could not apply a pulled categories row" (cause NOT NULL constraint failed: categories.name); no revision recorded; apply_pending = 1; Cloud Sync member view "Sync failed", still after reload.
- Bob fixed the row -> alice applied "Snacks", apply_pending = 0, "Sync failed" cleared by itself.
- Transient failure (temporary trigger rejecting one row): first sync failed, row not recorded; trigger dropped; next sync with no new pull applied the row (rev recorded).

# BEFORE pass: same scenarios with origin/main app code (git checkout origin/main -- apps/mobile)

- Prefs: Bob set prefs_json {applePay: bob-visa}; after alice's sync her local Household prefs_json = Bob's (his Apple Pay account on her phone).
- Transient failed row: first sync reported failed=false, rev recorded although the row was not written; after the trigger was removed, another sync did NOT apply it ("Bob: eggs" missing on alice's phone for good).
- Shared server down + alice entry: sharedLedgerSync.retry = true (failing) yet the member Cloud Sync view showed no Offline/Sync failed line.
- Leave while offline with "Alice: taxi" unsent: left at once, entry deleted locally, never reached the share DB.
- Restore (main): backup taken with Groceries 2 = 18.5; Bob then set it to 55 and added "Bob: rice after the backup"; alice synced, restored the backup -> Bob's share DB: Groceries 2 back to 18.5, "rice" deleted for everyone.
- Reset (main), member: confirmation had no shared-ledger note; after Reset Bob's share DB had 0 transactions, 0 accounts, no ledger row — the household's book erased for everyone.

# AFTER pass, owner side (alice Pro, branch code)

- First upload of 1,000 local transactions (link to an empty cloud copy): cloud copy had all 1000 transactions right after linking; outbox 0, sync_row_meta 1000.
- Stop sharing a paused ledger: alice shared "Trip"; Bob joined and added "Bob: taxi from airport"; Pro removed for both; alice's list refresh marked Trip inactive (alice did not have the entry). Stop sharing -> Worker log: POST /credentials 200 (the owner's final read-only grant; refused otherwise while paused), then DELETE. Alice's Trip now has "Bob: hotel deposit" and "Bob: taxi from airport".
- (A first attempt with the ledger still active locally synced through the cached token, which main does too — not the paused path.)

## Delete vs stale edit (personal channel)

- First attempt (flush before pull, as committed): alice's other phone tombstoned bulk-1; the simulator then edited its stale copy -> cloud bulk-1 live again with the edited note (delete lost). deletedElsewhere never fired: the replica had not pulled the tombstone. This is also main's behaviour (no rule at all).
- FIX: pull() before the flush. Repeated with bulk-4: other phone tombstoned it, simulator edited its stale copy -> cloud bulk-4 still deleted (rev unchanged), simulator's row took the delete (deleted_at set), outbox 0.
- (App crashed once during a reload: SIGABRT in React's debug-only jsinspector ConsoleTaskOrchestrator::finishTask — dev inspector, not app code.)

## Ledger deleted on another phone while an editor is open — fix REVERTED

- Trip open, Add Transaction > Full entry open; alice's other phone soft-deleted Trip; a sync applied it.
- The open ledger became Main at once (editor still open). LedgerProGuard had canSwitch=false — it did not switch: refreshAll() -> initializeDatabase() -> openStoredLedger() silently falls back to the default ledger when the stored one is deleted. So the deferral never ran, and it skipped the filter reset main's explicit switchLedger does. Reverted to main's behaviour; the reported risk (a draft saving into Main) remains — fixing it needs a save-time check with its own UX.
- Wages (main): USD ledger, US$40 dinner, RM40/h wage -> "1h". Branch: same data -> "4h 4m" (rate ~RM4.08/USD).
- Stop sharing a paused ledger (main): Trip2 shared, Bob added "Bob: museum tickets", Pro removed, alice's list marked it inactive; Stop sharing -> alice's Trip2 has no entries; Bob's entry is gone with the deleted cloud DB.

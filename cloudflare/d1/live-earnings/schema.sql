-- D1 schema for the live-earnings Worker.
--
-- One row per running Live Activity. The row exists only for the life of a
-- session (at most the 8 hours iOS allows one to run), and the cron that pushes
-- updates is also what prunes it: there is no separate cleanup job, because a
-- session that has ended is exactly a session the pusher has just finished with.
--
-- Keyed by the ActivityKit push token, not by the user: the token IS the
-- address being pushed to, one device can only run one of these activities at a
-- time, and the same person on two devices is two independent cards. A user
-- column is still carried so a sign-out can drop everything for an account.
--
-- Deliberately NOT stored: the precomputed tick table the widget uses. Money
-- accrues linearly, so (started_at, ends_at, hourly_rate) is the whole session
-- and the amount at any instant is arithmetic - keeping ~145 rows of
-- precomputed labels per session in D1 would be storing a cache of a
-- multiplication. The currency symbol rides along so the Worker can format the
-- figure exactly as the app would (see src/earnings.ts).
--
-- CI re-applies this file on every production deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent - additive
-- changes only, guarded by IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS live_activity_sessions (
  -- Hex ActivityKit push token, as handed over by the app.
  push_token TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL,
  -- 'sandbox' for development/TestFlight-from-Xcode builds, 'production' for
  -- App Store and TestFlight. A token minted in one is rejected by the other,
  -- which is why the app states it rather than the Worker guessing.
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  hourly_rate REAL NOT NULL,
  currency_symbol TEXT NOT NULL,
  -- The last amount actually pushed. The cron compares against it and skips the
  -- push when the figure has not moved, which is what keeps a long session from
  -- spending 480 pushes to say the same thing: at the app's coarse cadence the
  -- amount only changes every few minutes late in a shift.
  last_pushed_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The cron's only query: everything still running, cheapest first.
CREATE INDEX IF NOT EXISTS idx_live_activity_sessions_ends_at
  ON live_activity_sessions (ends_at);

-- Lets a sign-out or an account reset drop every card for a user.
CREATE INDEX IF NOT EXISTS idx_live_activity_sessions_app_user_id
  ON live_activity_sessions (app_user_id);

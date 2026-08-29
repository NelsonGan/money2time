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

-- One row per device that has asked for its shift to start on its own.
--
-- Separate from the session table above, and keyed by a different token, because
-- they are different addresses for different things: a session is addressed by
-- its *activity's* update token and exists only while a card is up, while a
-- schedule is addressed by the device's **push-to-start** token (iOS 17.2+),
-- which belongs to the activity *type* and outlives every card raised from it.
--
-- Everything the card renders is stored as text the app already rendered. The
-- Worker has no i18n catalog and no idea what currency the user reports in, and
-- a scheduled shift is fixed in advance - the same start time, the same
-- duration, the same rate - so there is nothing to format at push time. The app
-- re-registers on every foreground, which is what keeps these strings honest
-- after a change of wage, currency, language or theme.
CREATE TABLE IF NOT EXISTS live_activity_schedules (
  push_to_start_token TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  -- IANA zone, so 09:00 stays 09:00 across a daylight-saving change and a
  -- schedule keeps firing at the right local time while the app never runs.
  time_zone TEXT NOT NULL,
  -- JSON array of weekday numbers, 0 = Sunday. An empty array is legal: it is
  -- what deselecting the last day produces, and it simply never comes due.
  days TEXT NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  hourly_rate REAL NOT NULL,
  currency_symbol TEXT NOT NULL,
  title_text TEXT NOT NULL,
  rate_text TEXT NOT NULL,
  ends_text TEXT NOT NULL,
  total_text TEXT NOT NULL,
  refresh_text TEXT NOT NULL,
  -- The formatted zero the card opens at, e.g. "RM0.00".
  zero_text TEXT NOT NULL,
  -- A start push must carry an alert (Apple requires one so a card cannot
  -- appear entirely unannounced); it is what a paired Apple Watch shows.
  alert_title TEXT NOT NULL,
  alert_body TEXT NOT NULL,
  accent_light INTEGER NOT NULL,
  accent_dark INTEGER NOT NULL,
  -- The next occurrence, precomputed. Zero means "never": the cron's only
  -- query is a range scan on this column, so a schedule with no days selected
  -- costs nothing to keep. Recomputed on every register and after every pass.
  next_start_at INTEGER NOT NULL DEFAULT 0,
  -- Diagnostic only. Nothing reads it to decide anything; it records the last
  -- card this schedule actually raised.
  last_started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The cron's only query: what is due now.
CREATE INDEX IF NOT EXISTS idx_live_activity_schedules_next_start_at
  ON live_activity_schedules (next_start_at);

-- Lets a sign-out or an account reset drop every schedule for a user.
CREATE INDEX IF NOT EXISTS idx_live_activity_schedules_app_user_id
  ON live_activity_schedules (app_user_id);

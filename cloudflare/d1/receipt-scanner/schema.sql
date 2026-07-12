-- D1 schema for the receipt-scanner Worker.
--
-- Two concerns, both time-bounded:
--   1. scan_usage        — per-user scan counter for the current metering window
--   2. entitlement_cache — short-lived RevenueCat Pro/free cache
--
-- The metering cadence is configurable per tier (FREE_INTERVAL / PRO_INTERVAL =
-- day | week | month | year; see src/interval.ts), so scan_usage is NOT tied to
-- any single interval. A window is identified by two typed columns rather than
-- an encoded string: `interval_unit` (the cadence) and `window_start` (epoch-ms
-- at the window's UTC start). The Worker looks a row up by an exact
-- (app_user_id, interval_unit, window_start) match, served straight from the
-- primary-key index. Switching a tier's interval opens fresh rows under the new
-- `interval_unit`; rows from different cadences never collide because the unit
-- is part of the key (a monthly and a daily window can share a `window_start`).
--
-- D1 (SQLite) has no native TTL, so every row carries an `expires_at`
-- (epoch-ms). For scan_usage that is the epoch-ms at which the window resets and
-- the row can be pruned — the live counter is selected by (interval_unit,
-- window_start), not by `expires_at`. entitlement_cache is keyed by the stable
-- App User ID, so its `expires_at` is checked on read to expire the cache.
--
-- CI re-applies this file on every production Worker deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent — additive changes
-- only, guarded by IF NOT EXISTS. For a future destructive change (drop/rename),
-- switch to `wrangler d1 migrations`.
--
-- Apply manually (from cloudflare/workers/receipt-scanner, where wrangler.toml lives) with:
--   wrangler d1 execute money2time-d1-receipt-scanner --remote --file=../../d1/receipt-scanner/schema.sql
-- (drop --remote for the local dev DB).

-- One row per user per metering window, identified by two typed columns — no
-- opaque composite string — so lookups and the upsert hit real, indexed columns.
CREATE TABLE IF NOT EXISTS scan_usage (
  app_user_id   TEXT    NOT NULL,           -- the app's App User ID (m2t_…)
  interval_unit TEXT    NOT NULL            -- the tier's cadence for this window
                CHECK (interval_unit IN ('day', 'week', 'month', 'year')),
  window_start  INTEGER NOT NULL,           -- epoch-ms at 00:00 UTC of the window start
  count         INTEGER NOT NULL DEFAULT 0, -- scans consumed in this window
  expires_at    INTEGER NOT NULL,           -- epoch-ms the window ends; prune after
  PRIMARY KEY (app_user_id, interval_unit, window_start)
);

-- Supports the cleanup sweep: DELETE FROM scan_usage WHERE expires_at <= <now>.
CREATE INDEX IF NOT EXISTS idx_scan_usage_expires ON scan_usage (expires_at);

CREATE TABLE IF NOT EXISTS entitlement_cache (
  app_user_id TEXT PRIMARY KEY,
  is_pro      INTEGER NOT NULL, -- 0 = free, 1 = pro
  -- epoch-ms; rows are only trusted while expires_at > now
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_cache_expires ON entitlement_cache (expires_at);

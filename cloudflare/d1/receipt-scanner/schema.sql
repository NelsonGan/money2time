-- D1 schema for the receipt-scanner Worker.
--
-- Two concerns, both time-bounded:
--   1. scan_usage        — per-user scan counter for the current metering window
--   2. entitlement_cache — short-lived RevenueCat Pro/free cache
--
-- The metering cadence is configurable per tier (FREE_INTERVAL / PRO_INTERVAL =
-- day | week | month | year; see src/interval.ts), so scan_usage is NOT tied to
-- any single interval. Each row is scoped to (app_user_id, period), where
-- `period` is a unit-prefixed window key the Worker computes for the tier's
-- interval — e.g. `day:2026-07-12`, `week:2026-07-07`, `month:2026-07`,
-- `year:2026`. Opening a new window, or switching a tier's interval, simply
-- writes a fresh row; keys from different intervals never collide because the
-- unit prefix is part of the key.
--
-- D1 (SQLite) has no native TTL, so every row carries an `expires_at`
-- (epoch-ms). For scan_usage that is the epoch-ms at which the window resets and
-- the row can be pruned — the live counter is selected by the `period` key, not
-- by `expires_at`. entitlement_cache is keyed by the stable App User ID, so its
-- `expires_at` is checked on read to expire the cache.
--
-- CI re-applies this file on every production Worker deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent — additive changes
-- only, guarded by IF NOT EXISTS. For a future destructive change (drop/rename),
-- switch to `wrangler d1 migrations`.
--
-- Apply manually (from cloudflare/workers/receipt-scanner, where wrangler.toml lives) with:
--   wrangler d1 execute money2time-d1-receipt-scanner --remote --file=../../d1/receipt-scanner/schema.sql
-- (drop --remote for the local dev DB).

-- One row per user per metering window. The (app_user_id, period) pair is the
-- natural key — no opaque composite string — so lookups and the upsert target
-- real columns.
CREATE TABLE IF NOT EXISTS scan_usage (
  app_user_id TEXT    NOT NULL,           -- the app's App User ID (m2t_…)
  period      TEXT    NOT NULL,           -- unit-prefixed window key, e.g. 'month:2026-07', 'day:2026-07-12'
  count       INTEGER NOT NULL DEFAULT 0, -- scans consumed in this window
  expires_at  INTEGER NOT NULL,           -- epoch-ms the window ends; prune after
  PRIMARY KEY (app_user_id, period)
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

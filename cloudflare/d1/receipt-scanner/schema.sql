-- D1 schema for the receipt-scanner Worker.
--
-- Two concerns, both time-bounded:
--   1. scan_usage        — per-user monthly scan counter
--   2. entitlement_cache — short-lived RevenueCat Pro/free cache
--
-- D1 (SQLite) has no native TTL, so every row carries an `expires_at`
-- (epoch-ms). A scan_usage row is scoped to (app_user_id, period), so a new
-- month opens a fresh row automatically and `expires_at` only drives pruning.
-- entitlement_cache is keyed by the stable App User ID, so its `expires_at` is
-- checked on read to expire the cache.
--
-- CI re-applies this file on every production Worker deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent — additive changes
-- only, guarded by IF NOT EXISTS. For a future destructive change (drop/rename),
-- switch to `wrangler d1 migrations`.
--
-- Apply manually (from cloudflare/workers/receipt-scanner, where wrangler.toml lives) with:
--   wrangler d1 execute money2time-d1-receipt-scanner --remote --file=../../d1/receipt-scanner/schema.sql
-- (drop --remote for the local dev DB).

-- One row per user per month. The (app_user_id, period) pair is the natural key
-- — no opaque composite string — so lookups and the upsert target real columns.
CREATE TABLE IF NOT EXISTS scan_usage (
  app_user_id TEXT    NOT NULL,           -- the app's App User ID (m2t_…)
  period      TEXT    NOT NULL,           -- billing window, 'YYYY-MM'
  count       INTEGER NOT NULL DEFAULT 0, -- scans consumed in this period
  expires_at  INTEGER NOT NULL,           -- epoch-ms the period ends; prune after
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

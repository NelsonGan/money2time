-- D1 schema for the receipt-scanner Worker.
--
-- Two concerns, both time-bounded:
--   1. scan_usage        — per-user rate-limit counter (Pro: daily, free: monthly)
--   2. entitlement_cache — short-lived RevenueCat Pro/free cache
--
-- D1 (SQLite) has no native TTL, so every row carries an `expires_at`
-- (epoch-ms). scan_usage keys are time-scoped (they embed the day/month), so a
-- new window opens a fresh row automatically and `expires_at` is only used for
-- pruning. entitlement_cache is keyed by the stable App User ID, so its
-- `expires_at` is checked on read to expire the cache.
--
-- Apply with:
--   wrangler d1 execute money2time-workers-receipt-scanner --remote --file=./schema.sql
-- (drop --remote for the local dev DB).

CREATE TABLE IF NOT EXISTS scan_usage (
  -- 'day:YYYY-MM-DD:{appUserId}' (Pro) or 'month:YYYY-MM:{appUserId}' (free)
  bucket_key TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  -- epoch-ms at which this window resets; the row is safe to prune after it
  expires_at INTEGER NOT NULL
);

-- Supports a cleanup sweep: DELETE FROM scan_usage WHERE expires_at <= <now>.
CREATE INDEX IF NOT EXISTS idx_scan_usage_expires ON scan_usage (expires_at);

CREATE TABLE IF NOT EXISTS entitlement_cache (
  app_user_id TEXT PRIMARY KEY,
  is_pro      INTEGER NOT NULL, -- 0 = free, 1 = pro
  -- epoch-ms; rows are only trusted while expires_at > now
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_cache_expires ON entitlement_cache (expires_at);

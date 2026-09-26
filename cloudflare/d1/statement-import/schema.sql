-- Re-applied by CI before production deployment; keep changes append-only.
CREATE TABLE IF NOT EXISTS statement_usage (
  app_user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_user_id, month)
);

CREATE TABLE IF NOT EXISTS entitlement_cache (
  app_user_id TEXT PRIMARY KEY,
  is_pro INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_cache_expires
  ON entitlement_cache (expires_at);

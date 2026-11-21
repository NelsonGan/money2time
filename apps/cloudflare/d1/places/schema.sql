-- D1 schema for the places Worker (apps/cloudflare/workers/places).
--
-- Only each user's daily count of place searches that reached Apple: a cached
-- answer is not counted. No query, place or coordinate is stored.
--
-- CI re-applies this file on every production deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent - additive
-- changes only, guarded by IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS search_usage (
  app_user_id TEXT NOT NULL,
  -- Epoch-ms at the start of the UTC day.
  day_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  -- End of that day; the daily cron deletes rows past it.
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (app_user_id, day_start)
);

CREATE INDEX IF NOT EXISTS search_usage_expires_at ON search_usage (expires_at);

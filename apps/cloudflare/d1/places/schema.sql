-- D1 schema for the places Worker (apps/cloudflare/workers/places).
--
-- Only daily counts of place searches that reached Apple (a cached answer is
-- not counted): one per user, and one per address, whose IP is stored only as
-- a hash salted with the day. No query, place or coordinate is stored.
--
-- CI re-applies this file on every production deploy (see
-- .github/workflows/cloudflare.yml), so it MUST stay idempotent - additive
-- changes only, guarded by IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS search_usage (
  -- The app's user id ("m2t_…"), or "ip:" and the hashed address.
  subject TEXT NOT NULL,
  -- Epoch-ms at the start of the UTC day.
  day_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  -- End of that day; the daily cron deletes rows past it.
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (subject, day_start)
);

CREATE INDEX IF NOT EXISTS search_usage_expires_at ON search_usage (expires_at);

-- D1 schema for the cloud-sync Worker (database money2time-cloud-sync-auth).
-- Idempotent: re-running it changes nothing.
--
--   npx wrangler d1 execute money2time-cloud-sync-auth --remote --file ../../d1/cloud-sync/schema.sql
--
-- The first five tables are Better Auth's (1.7), in its column naming. The
-- rest belong to this Worker.

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);

-- One Turso database per user, made the first time they turn on sync.
-- The newest token is kept (sealed, see src/secretBox.ts) so phones share it
-- until a day before it expires.
CREATE TABLE IF NOT EXISTS sync_databases (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  db_name TEXT NOT NULL UNIQUE,
  db_url TEXT NOT NULL,
  token TEXT,
  token_expires_at INTEGER
);

-- Pro RevenueCat App User IDs (one per install) that signed in as this user.
-- The account is Pro while any of them has the entitlement, so a new phone
-- reaches the cloud copy before its own purchase is restored.
CREATE TABLE IF NOT EXISTS pro_links (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  app_user_id TEXT NOT NULL,
  is_pro INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, app_user_id)
);
-- An App User ID belongs to the first account that claims it.
CREATE UNIQUE INDEX IF NOT EXISTS pro_links_app_user_id_idx ON pro_links (app_user_id);

-- Images stored per user, for the upload quota.
CREATE TABLE IF NOT EXISTS media_usage (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  objects INTEGER NOT NULL DEFAULT 0
);

-- The Apple refresh token of a user who signed in with Apple, sealed, so it
-- can be revoked when they delete their account.
CREATE TABLE IF NOT EXISTS apple_tokens (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  refresh_token TEXT NOT NULL
);

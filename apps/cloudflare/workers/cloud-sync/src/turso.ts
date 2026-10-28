// Per-user Turso databases through the Turso Platform API. Each user gets one
// database in TURSO_GROUP; the phone syncs its local replica with it using a
// token that opens only that database.

import type { Env } from './env';
import { open, seal } from './secretBox';

const API = 'https://api.turso.tech/v1';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Token lifetime handed to phones. A stored token is reused until it has a day left. */
const TOKEN_TTL_DAYS = 7;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * DAY_MS;
const TOKEN_REUSE_MARGIN_MS = DAY_MS;

/**
 * The cloud copy's schema. Rows are stored as JSON so an app update that adds
 * a column needs no change here; see the app's `features/cloudSync/lib`.
 * Mirrored by the app's `CLOUD_SCHEMA_SQL`, which creates it on a local sync
 * server; keep the two identical.
 */
export const CLOUD_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS sync_rows (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    data TEXT NOT NULL,
    rev TEXT NOT NULL,
    origin TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (table_name, row_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_info (key TEXT NOT NULL PRIMARY KEY, value TEXT)`,
];

export interface SyncDatabase {
  url: string;
  token: string;
  expiresAt: number;
}

interface SyncDatabaseRow {
  db_name: string;
  db_url: string;
  token: string | null;
  token_expires_at: number | null;
}

/** Name for a user's database: lowercase, dashes, under Turso's 64 characters. */
export async function databaseNameFor(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `m2t-sync-${hex.slice(0, 24)}`;
}

/** The user's database and a usable token, making the database on first use. */
export async function getSyncDatabase(env: Env, userId: string): Promise<SyncDatabase> {
  if (env.LOCAL_SYNC_URL) {
    return { url: env.LOCAL_SYNC_URL, token: 'local', expiresAt: Date.now() + TOKEN_TTL_MS };
  }
  const now = Date.now();
  const existing = await env.AUTH_DB.prepare(
    'SELECT db_name, db_url, token, token_expires_at FROM sync_databases WHERE user_id = ?1',
  )
    .bind(userId)
    .first<SyncDatabaseRow>();

  if (existing?.token && (existing.token_expires_at ?? 0) - now > TOKEN_REUSE_MARGIN_MS) {
    // Stored sealed; unreadable after a secret rotation, then a new one is minted.
    const token = await open(env, 'turso-token', existing.token);
    if (token) return { url: existing.db_url, token, expiresAt: existing.token_expires_at ?? now };
  }

  let dbName = existing?.db_name;
  let url = existing?.db_url;
  let created = false;
  if (!dbName || !url) {
    dbName = await databaseNameFor(userId);
    const hostname = await createDatabase(env, dbName);
    url = `libsql://${hostname}`;
    created = true;
  }
  const expiresAt = now + TOKEN_TTL_MS;
  const token = await createToken(env, dbName);
  if (created) await applyCloudSchema(url, token);

  try {
    await env.AUTH_DB.prepare(
      `INSERT INTO sync_databases (user_id, db_name, db_url, token, token_expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET token = ?4, token_expires_at = ?5`,
    )
      .bind(userId, dbName, url, await seal(env, 'turso-token', token), expiresAt)
      .run();
  } catch (error) {
    // The user was deleted meanwhile (foreign key): don't leave a database
    // that no D1 row points to.
    if (created) await deleteDatabase(env, dbName).catch(() => undefined);
    throw error;
  }
  return { url, token, expiresAt };
}

export async function deleteSyncDatabase(env: Env, userId: string): Promise<void> {
  const row = await env.AUTH_DB.prepare('SELECT db_name FROM sync_databases WHERE user_id = ?1')
    .bind(userId)
    .first<{ db_name: string }>();
  if (row && !env.LOCAL_SYNC_URL) await deleteDatabase(env, row.db_name);
  await env.AUTH_DB.prepare('DELETE FROM sync_databases WHERE user_id = ?1').bind(userId).run();
}

async function deleteDatabase(env: Env, dbName: string): Promise<void> {
  const res = await platform(env, `/organizations/${env.TURSO_ORG}/databases/${dbName}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) throw new Error(`turso_delete_failed_${res.status}`);
}

async function createDatabase(env: Env, dbName: string): Promise<string> {
  const res = await platform(env, `/organizations/${env.TURSO_ORG}/databases`, {
    method: 'POST',
    body: JSON.stringify({ name: dbName, group: env.TURSO_GROUP }),
  });
  if (res.status === 409) {
    // Made by an earlier attempt that failed before it was recorded.
    const existing = await platform(env, `/organizations/${env.TURSO_ORG}/databases/${dbName}`);
    if (!existing.ok) throw new Error(`turso_get_failed_${existing.status}`);
    const body = (await existing.json()) as { database?: { Hostname?: string } };
    if (!body.database?.Hostname) throw new Error('turso_get_no_hostname');
    return body.database.Hostname;
  }
  if (!res.ok) throw new Error(`turso_create_failed_${res.status}`);
  const body = (await res.json()) as { database?: { Hostname?: string } };
  if (!body.database?.Hostname) throw new Error('turso_create_no_hostname');
  return body.database.Hostname;
}

async function createToken(env: Env, dbName: string): Promise<string> {
  const res = await platform(
    env,
    `/organizations/${env.TURSO_ORG}/databases/${dbName}/auth/tokens?expiration=${TOKEN_TTL_DAYS}d&authorization=full-access`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`turso_token_failed_${res.status}`);
  const body = (await res.json()) as { jwt?: string };
  if (!body.jwt) throw new Error('turso_token_missing');
  return body.jwt;
}

/** Creates the sync tables over Turso's HTTP SQL API, before any phone connects. */
async function applyCloudSchema(url: string, token: string): Promise<void> {
  const httpUrl = url.replace(/^libsql:\/\//, 'https://');
  const res = await fetch(`${httpUrl}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        ...CLOUD_SCHEMA_SQL.map((sql) => ({ type: 'execute', stmt: { sql } })),
        { type: 'close' },
      ],
    }),
  });
  if (!res.ok) throw new Error(`turso_schema_failed_${res.status}`);
}

function platform(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  if (!env.TURSO_API_TOKEN) throw new Error('turso_not_configured');
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TURSO_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

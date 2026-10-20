// D1 access for vaults, their devices and backup metadata.

import type { Env } from './env';
import { sha256Hex } from './tokens';

export type VaultRow = {
  id: string;
  secret_hash: string;
  primary_device_id: string | null;
  created_at: number;
  last_seen_at: number;
};

export type DeviceRow = {
  id: string;
  platform: string;
  name: string | null;
  app_version: string | null;
  created_at: number;
  last_seen_at: number;
};

export type BackupRow = {
  id: string;
  device_id: string;
  r2_key: string;
  created_at: number;
  size: number;
  sha256: string;
  schema_version: number;
  app_version: string | null;
  exported_at: string | null;
};

const db = (env: Env) => env.MONEY2TIME_D1_CLOUD_BACKUP;
const encoder = new TextEncoder();

export const hashSecret = (secret: string) => sha256Hex(encoder.encode(secret).buffer as ArrayBuffer);

/** Constant-time comparison of two hex digests. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function getVault(env: Env, vaultId: string): Promise<VaultRow | null> {
  return db(env).prepare('select * from vault where id = ?1').bind(vaultId).first<VaultRow>();
}

/** The vault the secret opens, or null for an unknown vault or a wrong secret. */
export async function openVault(env: Env, vaultId: string, secret: string): Promise<VaultRow | null> {
  const vault = await getVault(env, vaultId);
  if (!vault || !sameHash(vault.secret_hash, await hashSecret(secret))) return null;
  // Touch at most hourly: last_seen_at only drives the cleanup of abandoned vaults.
  if (Date.now() - vault.last_seen_at > 60 * 60 * 1000) {
    await db(env).prepare('update vault set last_seen_at = ?2 where id = ?1').bind(vault.id, Date.now()).run();
  }
  return vault;
}

export async function createVault(env: Env, vaultId: string, secret: string): Promise<VaultRow> {
  const now = Date.now();
  await db(env)
    .prepare(
      'insert into vault (id, secret_hash, created_at, last_seen_at) values (?1, ?2, ?3, ?3) on conflict (id) do nothing',
    )
    .bind(vaultId, await hashSecret(secret), now)
    .run();
  return (await getVault(env, vaultId))!;
}

export async function upsertDevice(
  env: Env,
  vaultId: string,
  device: { id: string; platform: string; name: string | null; appVersion: string | null; appUserId: string | null },
): Promise<void> {
  const now = Date.now();
  await db(env)
    .prepare(
      `insert into device (vault_id, id, platform, name, app_version, app_user_id, created_at, last_seen_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       on conflict (vault_id, id) do update set
         platform = excluded.platform, name = excluded.name, app_version = excluded.app_version,
         app_user_id = coalesce(excluded.app_user_id, device.app_user_id), last_seen_at = excluded.last_seen_at`,
    )
    .bind(vaultId, device.id, device.platform, device.name, device.appVersion, device.appUserId, now)
    .run();
}

/** RevenueCat App User IDs the vault's phones run with, primary first. */
export async function listAppUserIds(env: Env, vaultId: string): Promise<string[]> {
  const result = await db(env)
    .prepare(
      `select distinct d.app_user_id as id from device d
       join vault v on v.id = d.vault_id
       where d.vault_id = ?1 and d.app_user_id is not null
       order by d.id = v.primary_device_id desc, d.last_seen_at desc`,
    )
    .bind(vaultId)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

export async function getDevice(env: Env, vaultId: string, deviceId: string): Promise<DeviceRow | null> {
  return db(env)
    .prepare('select id, platform, name, app_version, created_at, last_seen_at from device where vault_id = ?1 and id = ?2')
    .bind(vaultId, deviceId)
    .first<DeviceRow>();
}

export async function listDevices(env: Env, vaultId: string): Promise<DeviceRow[]> {
  const result = await db(env)
    .prepare(
      'select id, platform, name, app_version, created_at, last_seen_at from device where vault_id = ?1 order by last_seen_at desc',
    )
    .bind(vaultId)
    .all<DeviceRow>();
  return result.results;
}

export async function getPrimaryDeviceId(env: Env, vaultId: string): Promise<string | null> {
  return (await getVault(env, vaultId))?.primary_device_id ?? null;
}

/** Makes `deviceId` primary only when the vault has none yet. */
export async function claimPrimaryIfUnset(env: Env, vaultId: string, deviceId: string): Promise<void> {
  await db(env)
    .prepare('update vault set primary_device_id = ?2 where id = ?1 and primary_device_id is null')
    .bind(vaultId, deviceId)
    .run();
}

export async function setPrimary(env: Env, vaultId: string, deviceId: string): Promise<void> {
  await db(env).prepare('update vault set primary_device_id = ?2 where id = ?1').bind(vaultId, deviceId).run();
}

/** A phone leaves the vault; if it was primary, the vault has none until another takes over. */
export async function removeDevice(env: Env, vaultId: string, deviceId: string): Promise<void> {
  await db(env).batch([
    db(env).prepare('delete from device where vault_id = ?1 and id = ?2').bind(vaultId, deviceId),
    db(env)
      .prepare('update vault set primary_device_id = null where id = ?1 and primary_device_id = ?2')
      .bind(vaultId, deviceId),
  ]);
}

export async function getBackup(env: Env, vaultId: string): Promise<BackupRow | null> {
  return db(env)
    .prepare(
      'select id, device_id, r2_key, created_at, size, sha256, schema_version, app_version, exported_at from backup where vault_id = ?1',
    )
    .bind(vaultId)
    .first<BackupRow>();
}

export async function putBackup(env: Env, vaultId: string, row: BackupRow): Promise<void> {
  await db(env)
    .prepare(
      `insert into backup (vault_id, id, device_id, r2_key, created_at, size, sha256, schema_version, app_version, exported_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       on conflict (vault_id) do update set
         id = excluded.id, device_id = excluded.device_id, r2_key = excluded.r2_key,
         created_at = excluded.created_at, size = excluded.size, sha256 = excluded.sha256,
         schema_version = excluded.schema_version, app_version = excluded.app_version,
         exported_at = excluded.exported_at`,
    )
    .bind(
      vaultId,
      row.id,
      row.device_id,
      row.r2_key,
      row.created_at,
      row.size,
      row.sha256,
      row.schema_version,
      row.app_version,
      row.exported_at,
    )
    .run();
}

export async function deleteBackup(env: Env, vaultId: string): Promise<void> {
  const existing = await getBackup(env, vaultId);
  if (existing) await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(existing.r2_key);
  await db(env).prepare('delete from backup where vault_id = ?1').bind(vaultId).run();
}

/** The vault and everything in it: backup, phones, linked browsers. */
export async function deleteVault(env: Env, vaultId: string): Promise<void> {
  // Any object under the vault's prefix, not just the one D1 points at, so an
  // interrupted upload cannot leave a file behind.
  let cursor: string | undefined;
  do {
    const listing = await env.MONEY2TIME_R2_CLOUD_BACKUP.list({ prefix: `vaults/${vaultId}/`, cursor });
    if (listing.objects.length) {
      await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(listing.objects.map((object) => object.key));
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  await db(env).batch([
    db(env).prepare('delete from backup where vault_id = ?1').bind(vaultId),
    db(env).prepare('delete from device where vault_id = ?1').bind(vaultId),
    db(env).prepare('delete from web_session where vault_id = ?1').bind(vaultId),
    db(env).prepare('delete from link_request where vault_id = ?1').bind(vaultId),
    db(env).prepare('delete from vault where id = ?1').bind(vaultId),
  ]);
}

/** Vaults nobody has opened in this long are deleted: their phone stopped backing up long ago. */
export const ABANDONED_VAULT_MS = 180 * 24 * 60 * 60 * 1000;

export async function pruneAbandonedVaults(env: Env): Promise<void> {
  const stale = await db(env)
    .prepare('select id from vault where last_seen_at < ?1 limit 100')
    .bind(Date.now() - ABANDONED_VAULT_MS)
    .all<{ id: string }>();
  for (const row of stale.results) await deleteVault(env, row.id);
}

/**
 * Fixed-window counter for the calls anyone can make. Returns false once
 * `key` has been used `max` times in the current window.
 */
export async function withinRateLimit(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const row = await db(env)
    .prepare(
      `insert into rate_limit (key, window_start, count) values (?1, ?2, 1)
       on conflict (key) do update set
         count = case when rate_limit.window_start = excluded.window_start then rate_limit.count + 1 else 1 end,
         window_start = excluded.window_start
       returning count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= max;
}

export async function pruneRateLimits(env: Env): Promise<void> {
  await db(env).prepare('delete from rate_limit where window_start < ?1').bind(Date.now() - 24 * 60 * 60 * 1000).run();
}

// D1 access for devices, the primary device and backup metadata.

import type { Env } from './env';

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

export async function upsertDevice(
  env: Env,
  userId: string,
  device: { id: string; platform: string; name: string | null; appVersion: string | null; appUserId: string | null },
): Promise<void> {
  const now = Date.now();
  await db(env)
    .prepare(
      `insert into device (user_id, id, platform, name, app_version, app_user_id, created_at, last_seen_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       on conflict (user_id, id) do update set
         platform = excluded.platform, name = excluded.name, app_version = excluded.app_version,
         app_user_id = coalesce(excluded.app_user_id, device.app_user_id), last_seen_at = excluded.last_seen_at`,
    )
    .bind(userId, device.id, device.platform, device.name, device.appVersion, device.appUserId, now)
    .run();
}

/** RevenueCat App User IDs the account's phones run with, primary first. */
export async function listAppUserIds(env: Env, userId: string): Promise<string[]> {
  const result = await db(env)
    .prepare(
      `select distinct d.app_user_id as id from device d
       left join primary_device p on p.user_id = d.user_id and p.device_id = d.id
       where d.user_id = ?1 and d.app_user_id is not null
       order by p.device_id is null, d.last_seen_at desc`,
    )
    .bind(userId)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

export async function getDevice(env: Env, userId: string, deviceId: string): Promise<DeviceRow | null> {
  return db(env)
    .prepare('select id, platform, name, app_version, created_at, last_seen_at from device where user_id = ?1 and id = ?2')
    .bind(userId, deviceId)
    .first<DeviceRow>();
}

export async function listDevices(env: Env, userId: string): Promise<DeviceRow[]> {
  const result = await db(env)
    .prepare(
      'select id, platform, name, app_version, created_at, last_seen_at from device where user_id = ?1 order by last_seen_at desc',
    )
    .bind(userId)
    .all<DeviceRow>();
  return result.results;
}

export async function getPrimaryDeviceId(env: Env, userId: string): Promise<string | null> {
  const row = await db(env)
    .prepare('select device_id from primary_device where user_id = ?1')
    .bind(userId)
    .first<{ device_id: string }>();
  return row?.device_id ?? null;
}

/** Makes `deviceId` primary only when the account has none yet. */
export async function claimPrimaryIfUnset(env: Env, userId: string, deviceId: string): Promise<void> {
  await db(env)
    .prepare('insert into primary_device (user_id, device_id, assigned_at) values (?1, ?2, ?3) on conflict (user_id) do nothing')
    .bind(userId, deviceId, Date.now())
    .run();
}

export async function setPrimary(env: Env, userId: string, deviceId: string): Promise<void> {
  await db(env)
    .prepare(
      `insert into primary_device (user_id, device_id, assigned_at) values (?1, ?2, ?3)
       on conflict (user_id) do update set device_id = excluded.device_id, assigned_at = excluded.assigned_at`,
    )
    .bind(userId, deviceId, Date.now())
    .run();
}

export async function getBackup(env: Env, userId: string): Promise<BackupRow | null> {
  return db(env)
    .prepare(
      'select id, device_id, r2_key, created_at, size, sha256, schema_version, app_version, exported_at from backup where user_id = ?1',
    )
    .bind(userId)
    .first<BackupRow>();
}

export async function putBackup(env: Env, userId: string, row: BackupRow): Promise<void> {
  await db(env)
    .prepare(
      `insert into backup (user_id, id, device_id, r2_key, created_at, size, sha256, schema_version, app_version, exported_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       on conflict (user_id) do update set
         id = excluded.id, device_id = excluded.device_id, r2_key = excluded.r2_key,
         created_at = excluded.created_at, size = excluded.size, sha256 = excluded.sha256,
         schema_version = excluded.schema_version, app_version = excluded.app_version,
         exported_at = excluded.exported_at`,
    )
    .bind(
      userId,
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

export async function deleteBackup(env: Env, userId: string): Promise<void> {
  const existing = await getBackup(env, userId);
  if (existing) await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(existing.r2_key);
  await db(env).prepare('delete from backup where user_id = ?1').bind(userId).run();
}

/** The fingerprint of the account's backup key, if a phone has set one. */
export async function getKeyCheck(env: Env, userId: string): Promise<string | null> {
  const row = await db(env).prepare('select key_check from account_key where user_id = ?1').bind(userId).first<{ key_check: string }>();
  return row?.key_check ?? null;
}

/** The first phone sets the key; later calls keep the existing one. */
export async function setKeyCheckIfUnset(env: Env, userId: string, keyCheck: string): Promise<string> {
  await db(env)
    .prepare('insert into account_key (user_id, key_check, created_at) values (?1, ?2, ?3) on conflict (user_id) do nothing')
    .bind(userId, keyCheck, Date.now())
    .run();
  return (await getKeyCheck(env, userId)) ?? keyCheck;
}

export async function replaceKeyCheck(env: Env, userId: string, keyCheck: string): Promise<void> {
  await db(env)
    .prepare(
      `insert into account_key (user_id, key_check, created_at) values (?1, ?2, ?3)
       on conflict (user_id) do update set key_check = excluded.key_check, created_at = excluded.created_at`,
    )
    .bind(userId, keyCheck, Date.now())
    .run();
}

/** Everything the account owns outside Better Auth's own tables. */
export async function deleteUserData(env: Env, userId: string): Promise<void> {
  // Any object under the user's prefix, not just the one D1 points at, so an
  // interrupted upload cannot leave a file behind.
  let cursor: string | undefined;
  do {
    const listing = await env.MONEY2TIME_R2_CLOUD_BACKUP.list({ prefix: `users/${userId}/`, cursor });
    if (listing.objects.length) {
      await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(listing.objects.map((object) => object.key));
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  await db(env).batch([
    db(env).prepare('delete from backup where user_id = ?1').bind(userId),
    db(env).prepare('delete from primary_device where user_id = ?1').bind(userId),
    db(env).prepare('delete from device where user_id = ?1').bind(userId),
    db(env).prepare('delete from account_key where user_id = ?1').bind(userId),
    db(env).prepare('delete from web_session where user_id = ?1').bind(userId),
    db(env).prepare('delete from link_request where user_id = ?1').bind(userId),
  ]);
}

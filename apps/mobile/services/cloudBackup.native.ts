/**
 * Cloud Backup & Web Dashboard, the phone's half.
 *
 * Once signed in, the primary phone keeps one compressed backup in the cloud:
 * the same JSON Export Database writes, gzipped and SHA-256 checksummed here,
 * uploaded through a short-lived URL the Worker
 * (apps/cloudflare/workers/cloud-backup) issues only to the account's primary
 * device. Each upload replaces the last. app.money2time.com reads it, read only.
 *
 * The phone stays the source of truth. Nothing syncs between phones: a second
 * phone can sign in, but it uploads only after an explicit Transfer Primary
 * Device, and the only way data moves onto a phone is an explicit restore.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system/next';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { sha256 } from 'js-sha256';
import { Platform } from 'react-native';

import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  applyBackupJson,
  type BackupSummary,
  buildBackupJson,
  type ImportResult,
  parseBackupJson,
  summarizeBackup,
  yieldToEventLoop,
} from '~/services/dataManagementService';

import {
  CLOUD_BACKUP_SCHEMA_VERSION,
  cloudBackupBaseUrl,
  CloudBackupError,
  type CloudBackupMeta,
  type CloudBackupRunResult,
  type CloudBackupStatus,
  type CloudDevice,
  isCloudBackupStale,
} from './cloudBackup.shared';

export * from './cloudBackup.shared';

const DEVICE_ID_KEY = 'money2time_cloud_device_id';
const LAST_BACKUP_KEY = 'cloudBackup.lastBackupAt';
const LAST_ERROR_KEY = 'cloudBackup.lastError';
const REQUEST_TIMEOUT_MS = 30_000;

type CloudAuth = typeof import('./cloudBackupAuth');

let authModule: Promise<CloudAuth | null> | null = null;

/** The auth client, or null on a build without its native modules. */
function loadAuth(): Promise<CloudAuth | null> {
  authModule ??= import('./cloudBackupAuth').catch(() => null);
  return authModule;
}

async function requireAuth(): Promise<CloudAuth> {
  const auth = await loadAuth();
  if (!auth) throw new CloudBackupError('server');
  return auth;
}

/** Signed in to Cloud Backup on this phone (a session cookie is stored). */
export async function hasCloudSession(): Promise<boolean> {
  const auth = await loadAuth();
  if (!auth) return false;
  return Boolean(await auth.cloudAuthClient.getCookie());
}

/** Generated once per install and kept in the keychain / keystore. */
async function getDeviceId(): Promise<string> {
  const { secureStore: SecureStore } = await requireAuth();
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { cloudAuthClient } = await requireAuth();
  const cookie = await cloudAuthClient.getCookie();
  if (!cookie) throw new CloudBackupError('unauthenticated');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${cloudBackupBaseUrl()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Cookie: cookie,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      // The session travels in the Cookie header above, not the platform jar.
      credentials: 'omit',
    });
  } catch {
    throw new CloudBackupError('offline');
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    primaryDevice?: CloudDevice | null;
  };
  if (response.status === 401) throw new CloudBackupError('unauthenticated');
  if (response.status === 409 && data.error === 'not_primary') {
    throw new CloudBackupError('not_primary', data.primaryDevice ?? null);
  }
  if (!response.ok) throw new CloudBackupError('server');
  return data;
}

function deviceDetails() {
  let appUserId: string | null = null;
  try {
    appUserId = settingsRepository.get().appUserId?.trim() || null;
  } catch {
    appUserId = null;
  }
  return {
    platform: Platform.OS,
    name: Device.deviceName ?? Device.modelName ?? null,
    appVersion: Application.nativeApplicationVersion ?? null,
    // RevenueCat's App User ID, so the web dashboard knows whether the
    // account is Pro. The Worker checks it with RevenueCat itself.
    appUserId,
  };
}

export async function getSignedInEmail(): Promise<string | null> {
  try {
    const auth = await loadAuth();
    if (!auth) return null;
    const { data } = await auth.cloudAuthClient.getSession();
    return data?.user.email ?? null;
  } catch {
    return null;
  }
}

/** Registers this phone (the first on an account becomes primary) and reads the account. */
export async function refreshCloudStatus(): Promise<CloudBackupStatus> {
  const deviceId = await getDeviceId();
  const data = await api<Omit<CloudBackupStatus, 'deviceId' | 'lastBackupAt' | 'lastError'>>(
    '/v1/devices',
    {
      method: 'POST',
      body: { deviceId, ...deviceDetails() },
    },
  );
  const [lastBackupAt, lastError] = await Promise.all([
    AsyncStorage.getItem(LAST_BACKUP_KEY),
    AsyncStorage.getItem(LAST_ERROR_KEY),
  ]);
  return { ...data, deviceId, lastBackupAt, lastError };
}

/** Transfer Primary Device: this phone becomes the one that uploads. */
export async function makeThisPhonePrimary(): Promise<void> {
  const deviceId = await getDeviceId();
  await api('/v1/devices/primary', { method: 'POST', body: { deviceId } });
  void trackEvent(AnalyticsEvents.CLOUD_BACKUP_PRIMARY_TRANSFERRED);
}

let running: Promise<CloudBackupRunResult> | null = null;

/**
 * Uploads a backup when the last one is more than a day old, or now with
 * `force`. Safe to call from every trigger: one run at a time, and a phone
 * that is signed out or not primary just skips.
 */
export async function runCloudBackupIfDue(
  opts: { force?: boolean; trigger?: 'automatic' | 'manual' } = {},
): Promise<CloudBackupRunResult> {
  if (running) {
    const existing = await running;
    if (!opts.force) return existing;
  }
  const promise = (async (): Promise<CloudBackupRunResult> => {
    if (!(await hasCloudSession())) return { skipped: true, reason: 'signed_out' };
    const last = await AsyncStorage.getItem(LAST_BACKUP_KEY);
    if (!opts.force && !isCloudBackupStale(last)) return { skipped: true, reason: 'fresh' };

    try {
      const deviceId = await getDeviceId();
      const { json, data } = await buildBackupJson();
      const exportedAt = data.exportedAt;
      await yieldToEventLoop();
      const gz = gzipSync(strToU8(json), { level: 6 });
      await yieldToEventLoop();
      const checksum = sha256.hex(gz);

      const grant = await api<{
        uploadUrl: string;
        method: string;
        headers: Record<string, string>;
      }>('/v1/backups/upload-url', {
        method: 'POST',
        body: {
          deviceId,
          size: gz.byteLength,
          sha256: checksum,
          schemaVersion: CLOUD_BACKUP_SCHEMA_VERSION,
          appVersion: Application.nativeApplicationVersion ?? undefined,
          exportedAt,
        },
      });

      const file = new File(Paths.cache, `cloud-backup-${Date.now()}.json.gz`);
      try {
        file.write(gz);
        const upload = await uploadAsync(grant.uploadUrl, file.uri, {
          httpMethod: 'PUT',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: grant.headers,
        });
        if (upload.status === 409) throw new CloudBackupError('not_primary');
        if (upload.status < 200 || upload.status >= 300) throw new CloudBackupError('server');
        const body = JSON.parse(upload.body) as { backup: CloudBackupMeta };
        const at = new Date().toISOString();
        await AsyncStorage.multiSet([[LAST_BACKUP_KEY, at]]);
        await AsyncStorage.removeItem(LAST_ERROR_KEY);
        void trackEvent(AnalyticsEvents.CLOUD_BACKUP_UPLOADED, {
          trigger: opts.trigger ?? 'automatic',
        });
        return { skipped: false, backup: body.backup };
      } finally {
        try {
          file.delete();
        } catch {
          // Already gone.
        }
      }
    } catch (error) {
      const code = error instanceof CloudBackupError ? error.code : 'server';
      // A signed-out or secondary phone skipping is not a failure.
      if (code === 'not_primary' || code === 'unauthenticated')
        return { skipped: true, reason: code };
      await AsyncStorage.setItem(LAST_ERROR_KEY, code);
      void trackEvent(AnalyticsEvents.CLOUD_BACKUP_FAILED, { reason: code });
      throw error;
    }
  })();
  running = promise;
  void promise
    .finally(() => {
      if (running === promise) running = null;
    })
    .catch(() => undefined);
  return promise;
}

/** Downloads and verifies the cloud backup, without applying it. */
async function downloadCloudBackup(): Promise<{ json: string; meta: CloudBackupMeta }> {
  const latest = await api<{ backup: CloudBackupMeta | null; downloadUrl?: string }>(
    '/v1/backups/latest',
  );
  if (!latest.backup || !latest.downloadUrl) throw new CloudBackupError('no_backup');
  const destination = new File(Paths.cache, `cloud-restore-${Date.now()}.json.gz`);
  try {
    try {
      await File.downloadFileAsync(latest.downloadUrl, destination);
    } catch {
      throw new CloudBackupError('offline');
    }
    const bytes = await destination.bytes();
    if (sha256.hex(bytes) !== latest.backup.sha256) throw new CloudBackupError('checksum');
    let json: string;
    try {
      json = strFromU8(gunzipSync(bytes));
    } catch {
      throw new CloudBackupError('corrupt');
    }
    return { json, meta: latest.backup };
  } finally {
    try {
      destination.delete();
    } catch {
      // Already gone.
    }
  }
}

/** What a restore would bring in, for the confirmation. */
export async function previewCloudBackup(): Promise<{
  meta: CloudBackupMeta;
  summary: BackupSummary;
  json: string;
}> {
  const { json, meta } = await downloadCloudBackup();
  return { meta, summary: summarizeBackup(parseBackupJson(json)), json };
}

/** Replaces everything on this phone with the cloud backup. Explicit only. */
export function restoreCloudBackupJson(json: string): ImportResult {
  const result = applyBackupJson(json);
  if (result.success) void trackEvent(AnalyticsEvents.CLOUD_BACKUP_RESTORED);
  return result;
}

export async function deleteCloudBackup(): Promise<void> {
  await api('/v1/backups', { method: 'DELETE' });
  await AsyncStorage.multiRemove([LAST_BACKUP_KEY, LAST_ERROR_KEY]);
  void trackEvent(AnalyticsEvents.CLOUD_BACKUP_DELETED);
}

export async function sendSignInCode(email: string): Promise<void> {
  const { cloudAuthClient } = await requireAuth();
  const { error } = await cloudAuthClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  if (error) throw new CloudBackupError(error.status === 429 ? 'rate_limited' : 'server');
}

export async function signInWithCode(email: string, code: string): Promise<void> {
  const { cloudAuthClient } = await requireAuth();
  const { error } = await cloudAuthClient.signIn.emailOtp({ email, otp: code });
  if (error) throw new CloudBackupError(error.status === 429 ? 'rate_limited' : 'invalid_code');
  void trackEvent(AnalyticsEvents.CLOUD_BACKUP_SIGNED_IN, { method: 'email' });
}

/** Google, through the browser and back to the app's money2time:// scheme. */
export async function signInWithGoogleAccount(): Promise<void> {
  const { cloudAuthClient } = await requireAuth();
  const { error } = await cloudAuthClient.signIn.social({
    provider: 'google',
    callbackURL: '/cloud-backup',
  });
  if (error) throw new CloudBackupError('google_unavailable');
  if (!(await hasCloudSession())) throw new CloudBackupError('cancelled');
  void trackEvent(AnalyticsEvents.CLOUD_BACKUP_SIGNED_IN, { method: 'google' });
}

export async function signOutOfCloud(): Promise<void> {
  try {
    const auth = await loadAuth();
    await auth?.cloudAuthClient.signOut();
  } finally {
    await AsyncStorage.multiRemove([LAST_BACKUP_KEY, LAST_ERROR_KEY]);
    void trackEvent(AnalyticsEvents.CLOUD_BACKUP_SIGNED_OUT);
  }
}

/** Deletes the account and its cloud backup. Data on this phone is untouched. */
export async function deleteCloudAccount(): Promise<void> {
  const { cloudAuthClient } = await requireAuth();
  const { error } = await cloudAuthClient.deleteUser();
  if (error)
    throw new CloudBackupError(
      error.status === 400 || error.status === 403 ? 'session_not_fresh' : 'server',
    );
  await AsyncStorage.multiRemove([LAST_BACKUP_KEY, LAST_ERROR_KEY]);
  void trackEvent(AnalyticsEvents.CLOUD_BACKUP_ACCOUNT_DELETED);
}

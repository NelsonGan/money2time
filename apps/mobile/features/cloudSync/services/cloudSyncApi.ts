// HTTP client for the cloud-sync Worker (apps/cloudflare/workers/cloud-sync).
// Sign-in goes through Better Auth's endpoints; everything else under /v1
// carries the session token as a bearer token.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

const DEFAULT_BASE_URL = 'https://workers-cloud-sync.money2time.com';
/** Dev builds only: a URL saved here (e.g. a `wrangler dev` Worker) replaces the default. */
const DEV_BASE_URL_KEY = 'm2t.cloudSync.devBaseUrl';
const TIMEOUT_MS = 20_000;

let devBaseUrl: string | null | undefined;

async function baseUrl(): Promise<string> {
  if (__DEV__ && devBaseUrl === undefined) {
    devBaseUrl = await AsyncStorage.getItem(DEV_BASE_URL_KEY).catch(() => null);
  }
  const url =
    (__DEV__ && devBaseUrl) ||
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_CLOUD_SYNC?.trim() ||
    DEFAULT_BASE_URL;
  return url.replace(/\/+$/, '');
}

type CloudSyncErrorCode =
  | 'network'
  | 'unauthorized'
  | 'not_pro'
  /** The account is Pro, but this phone is past the 5 phones its Pro reaches. */
  | 'phone_limit'
  | 'invalid_code'
  | 'rate_limited'
  /** Shared ledgers: nobody in the ledger is Pro, so it is paused. */
  | 'ledger_paused'
  /** Shared ledgers: no such ledger or invite, or no access to it any more. */
  | 'not_found'
  /** Shared ledgers: already sharing the most ledgers allowed. */
  | 'limit_reached'
  /** Shared ledgers: no seat left for another member. */
  | 'full'
  /** Shared ledgers: an invite to the user's own ledger. */
  | 'own_ledger'
  /** Shared ledgers (app only): leaving would lose entries not sent yet. */
  | 'unsent_changes'
  /** Email sign-in: the Turnstile check failed (the Worker thinks a bot is sending). */
  | 'captcha_failed'
  | 'server';

export class CloudSyncApiError extends Error {
  constructor(
    readonly code: CloudSyncErrorCode,
    readonly status: number,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CloudSyncApiError';
  }
}

export interface CloudUser {
  id: string;
  email: string;
  name: string;
}

interface SignInResult {
  token: string;
  user: CloudUser;
}

export interface SyncCredentials {
  url: string;
  authToken: string;
  expiresAt: number;
}

export async function request<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = `${await baseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch {
    throw new CloudSyncApiError('network', 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw toError(res.status, json);
  return json as T;
}

function toError(status: number, body: unknown): CloudSyncApiError {
  const record = (body && typeof body === 'object' ? body : {}) as {
    error?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const code = String(record.code ?? record.error ?? '');
  if (status === 401) return new CloudSyncApiError('unauthorized', status, code);
  if (status === 403 && code === 'not_pro') return new CloudSyncApiError('not_pro', status);
  if (status === 403 && code === 'captcha_failed') {
    return new CloudSyncApiError('captcha_failed', status);
  }
  if (status === 403 && code === 'phone_limit') {
    return new CloudSyncApiError('phone_limit', status);
  }
  // `owner_not_pro`: the Worker before a member's Pro could keep a ledger going.
  if (status === 403 && (code === 'ledger_paused' || code === 'owner_not_pro')) {
    return new CloudSyncApiError('ledger_paused', status);
  }
  if (status === 404 && (code === 'not_found' || code === 'invite_not_found')) {
    return new CloudSyncApiError('not_found', status);
  }
  if (status === 409 && (code === 'limit_reached' || code === 'full' || code === 'own_ledger')) {
    return new CloudSyncApiError(code, status);
  }
  if (status === 429) return new CloudSyncApiError('rate_limited', status);
  if (/OTP|INVALID|EXPIRED|TOO_MANY_ATTEMPTS/i.test(code)) {
    return new CloudSyncApiError('invalid_code', status, code);
  }
  return new CloudSyncApiError('server', status, code || String(record.message ?? ''));
}

function toSignInResult(body: { token?: string; user?: CloudUser } | null): SignInResult {
  if (!body?.token || !body.user?.id) throw new CloudSyncApiError('server', 200, 'no_token');
  return {
    token: body.token,
    user: { id: body.user.id, email: body.user.email ?? '', name: body.user.name ?? '' },
  };
}

/** Signs in with a native Apple or Google ID token. */
export async function signInWithIdToken(args: {
  provider: 'apple' | 'google';
  idToken: string;
  nonce?: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<SignInResult> {
  const user =
    args.firstName || args.lastName
      ? { name: { firstName: args.firstName ?? '', lastName: args.lastName ?? '' } }
      : undefined;
  const body = await request<{ token?: string; user?: CloudUser }>('/api/auth/sign-in/social', {
    body: {
      provider: args.provider,
      idToken: { token: args.idToken, nonce: args.nonce, user },
    },
  });
  return toSignInResult(body);
}

/**
 * Hands the Worker Apple's one-time authorization code, so it can revoke the
 * user's Apple tokens if they delete their account (Apple's requirement).
 */
export async function sendAppleAuthorization(token: string, code: string): Promise<void> {
  await request('/v1/apple/authorization', { body: { code }, token });
}

/**
 * Mails a sign-in code. `captchaToken` is the Turnstile answer for this send
 * (features/cloudSync/components/Turnstile.tsx); without one the Worker decides.
 */
export async function sendEmailCode(email: string, captchaToken?: string): Promise<void> {
  await request('/api/auth/email-otp/send-verification-otp', {
    body: { email, type: 'sign-in' },
    headers: captchaToken ? { 'x-turnstile-token': captchaToken } : undefined,
  });
}

export async function signInWithEmailCode(email: string, otp: string): Promise<SignInResult> {
  const body = await request<{ token?: string; user?: CloudUser }>('/api/auth/sign-in/email-otp', {
    body: { email, otp },
  });
  return toSignInResult(body);
}

export async function signOutSession(token: string): Promise<void> {
  await request('/api/auth/sign-out', { body: {}, token });
}

export function deleteAccount(token: string): Promise<{ ok: boolean }> {
  return request('/v1/account', { method: 'DELETE', token });
}

/**
 * Whether this phone gets Pro from the account (any install of it is Pro, and
 * this phone is among the 5 its Pro reaches; `limited` when it is not). Sent
 * with this install's App User ID, which the Worker links if it is Pro.
 */
export async function getAccountStatus(
  token: string,
  appUserId: string | null,
): Promise<{ isPro: boolean; limited: boolean }> {
  const body = await request<{ isPro?: unknown; limited?: unknown }>('/v1/account/status', {
    body: { appUserId },
    token,
  });
  return { isPro: body.isPro === true, limited: body.limited === true };
}

/** Sign-out: this install stops counting toward the account's Pro. */
export async function unlinkInstall(token: string, appUserId: string | null): Promise<void> {
  if (!appUserId) return;
  await request('/v1/account/install', { method: 'DELETE', body: { appUserId }, token });
}

/** The Worker's WebSocket URL for live updates (services/liveSync.ts). */
export async function liveUrl(deviceId: string): Promise<string> {
  const base = (await baseUrl()).replace(/^http/, 'ws');
  return `${base}/v1/live?device=${encodeURIComponent(deviceId)}`;
}

/** Tells the user's other phones (or a shared ledger's people) that `channel` changed. */
export async function notifyChanged(
  token: string,
  channel: string,
  deviceId: string,
): Promise<void> {
  await request('/v1/sync/notify', { body: { channel, device: deviceId }, token });
}

export function getSyncCredentials(token: string, appUserId: string): Promise<SyncCredentials> {
  return request<SyncCredentials>('/v1/sync/credentials', { body: { appUserId }, token });
}

/** The user's own images; a shared ledger's are under `ledgerMediaPath`. */
export const PERSONAL_MEDIA_PATH = '/v1/media';

export function ledgerMediaPath(shareId: string): string {
  return `/v1/ledgers/${encodeURIComponent(shareId)}/media`;
}

export async function existingMedia(
  token: string,
  mediaPath: string,
  paths: string[],
): Promise<Set<string>> {
  const body = await request<{ existing?: string[] }>(`${mediaPath}/exists`, {
    body: { paths },
    token,
  });
  return new Set(body.existing ?? []);
}

function mediaUrl(base: string, mediaPath: string, path: string): string {
  return `${base}${mediaPath}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function uploadMedia(
  token: string,
  mediaPath: string,
  path: string,
  file: File,
): Promise<void> {
  const result = await file.upload(mediaUrl(await baseUrl(), mediaPath, path), {
    httpMethod: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new CloudSyncApiError(result.status === 401 ? 'unauthorized' : 'server', result.status);
  }
}

export async function downloadMedia(
  token: string,
  mediaPath: string,
  path: string,
  destination: File,
): Promise<void> {
  await File.downloadFileAsync(mediaUrl(await baseUrl(), mediaPath, path), destination, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });
}

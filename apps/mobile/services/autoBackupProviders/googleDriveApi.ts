/**
 * A direct Google Drive v3 REST client for auto-backup.
 *
 * This replaces `react-native-cloud-storage`'s Drive provider, which modelled
 * Drive as a POSIX filesystem and paid for it in round-trips: every path had to
 * be resolved to a file id by listing each directory level, so a single backup
 * ran ~5 API calls and listing 10 backups ran ~32 (three per file, just to read
 * a size). On a phone network that is what made "Back up now" spin for a minute
 * and then fail: any one of those calls timing out failed the whole run, with
 * no retry.
 *
 * Two of its bugs are fixed here rather than worked around:
 *
 *  - It set `Content-Length` from `body.length`, which counts UTF-16 code units,
 *    not UTF-8 bytes. Any backup containing an emoji or CJK text (i.e. most of
 *    them, now that category icons are stored as `emoji:X`) declared a shorter
 *    body than it sent, and the upload stalled until the abort timer fired.
 *    That is the "googleDrive: Aborted" users report. We never set the header
 *    and let the platform compute it.
 *  - Its abort timer was stored on the client and only cleared when the *next*
 *    request started, so a pending abort could fire against an unrelated later
 *    request. Here the timer is always cleared in a `finally`.
 *
 * Everything runs under the `drive.file` OAuth scope, which only ever sees
 * files this app created.
 */
import { getErrorMessage } from '~/utils/errorHandling';

import { clearGoogleTokenCache, getGoogleAccessToken } from './googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const JSON_MIME_TYPE = 'application/json';

// Metadata calls are small single round-trips. Transfers carry the whole backup
// body and legitimately take longer on a slow mobile connection, so they get a
// much more generous budget than the 3s the old client defaulted to.
export const METADATA_TIMEOUT_MS = 20_000;
export const TRANSFER_TIMEOUT_MS = 120_000;

const DEFAULT_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 800;

export type DriveErrorKind =
  | 'offline'
  | 'timeout'
  | 'auth'
  | 'quota'
  | 'rate_limited'
  | 'server'
  | 'client';

export class DriveError extends Error {
  readonly kind: DriveErrorKind;
  readonly status: number | null;

  constructor(kind: DriveErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'DriveError';
    this.kind = kind;
    this.status = status;
  }
}

/** Transient conditions worth a second look; everything else fails fast. */
export function isRetryableDriveError(kind: DriveErrorKind): boolean {
  return kind === 'offline' || kind === 'timeout' || kind === 'rate_limited' || kind === 'server';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

function encodeQuery(query: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/** Drive query strings are single-quoted, so a name containing one must escape. */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new DriveError('timeout', `Timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new DriveError('offline', getErrorMessage(error, 'Network request failed'));
  } finally {
    clearTimeout(timer);
  }
}

interface DriveApiErrorBody {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
  };
}

function classifyStatus(status: number, reason: string): DriveErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) {
    if (reason === 'storageQuotaExceeded') return 'quota';
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') return 'rate_limited';
    return 'client';
  }
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'client';
}

async function driveErrorFromResponse(response: Response): Promise<DriveError> {
  let message = `Drive request failed with status ${response.status}`;
  let reason = '';
  try {
    const body = (await response.json()) as DriveApiErrorBody;
    if (body?.error?.message) message = body.error.message;
    reason = body?.error?.errors?.[0]?.reason ?? '';
  } catch {
    // Non-JSON error body (an HTML error page from a captive portal, say).
  }
  return new DriveError(classifyStatus(response.status, reason), message, response.status);
}

interface DriveRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /**
   * Total tries, including the first. Pass 1 for requests whose retry has to be
   * driven by the caller (an interrupted resumable upload has to restart from a
   * fresh session rather than re-sending into the old one).
   */
  attempts?: number;
}

/**
 * Issues an authenticated Drive request, retrying transient failures and
 * re-minting the access token once if Drive rejects it.
 */
export async function driveRequest(
  url: string,
  options: DriveRequestOptions = {},
): Promise<Response> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = METADATA_TIMEOUT_MS,
    attempts = DEFAULT_ATTEMPTS,
  } = options;

  let lastError: DriveError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const token = await getGoogleAccessToken();
    if (!token) throw new DriveError('auth', 'Google Drive: not signed in');

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        { method, headers: { ...headers, Authorization: `Bearer ${token}` }, body },
        timeoutMs,
      );
    } catch (error) {
      lastError = error as DriveError;
      if (attempt >= attempts || !isRetryableDriveError(lastError.kind)) throw lastError;
      await delay(backoffDelayMs(attempt));
      continue;
    }

    if (response.ok) return response;

    const driveError = await driveErrorFromResponse(response);
    lastError = driveError;

    if (driveError.kind === 'auth') {
      // The token we sent was cached by the native SDK and Drive has rejected
      // it. Drop it so the next attempt mints a fresh one; retry immediately
      // since there is nothing transient to wait out.
      await clearGoogleTokenCache(token);
      if (attempt >= attempts) throw driveError;
      continue;
    }

    if (attempt >= attempts || !isRetryableDriveError(driveError.kind)) throw driveError;
    await delay(backoffDelayMs(attempt));
  }

  throw lastError ?? new DriveError('client', 'Drive request failed');
}

export interface DriveFile {
  id: string;
  name: string;
  sizeBytes: number;
  createdTime: string | null;
}

interface DriveFileResource {
  id?: string;
  name?: string;
  size?: string;
  createdTime?: string;
}

interface DriveListResponse {
  files?: DriveFileResource[];
  nextPageToken?: string;
}

function toDriveFile(resource: DriveFileResource): DriveFile | null {
  if (!resource.id || !resource.name) return null;
  const size = Number.parseInt(resource.size ?? '', 10);
  return {
    id: resource.id,
    name: resource.name,
    sizeBytes: Number.isFinite(size) ? size : 0,
    createdTime: resource.createdTime ?? null,
  };
}

/**
 * Finds every folder at the Drive root with this name, oldest first.
 *
 * Drive allows same-named siblings, and the old provider created duplicates:
 * its "does it exist?" probe reported false on any error (including a network
 * blip), and Drive's file-list index lags creation by seconds to minutes, so a
 * second backup started soon after the first would not see the folder it had
 * just made and would create another. Backups then scattered across several
 * identically-named folders, and whichever one Drive happened to return first
 * was the only one the app could see.
 *
 * Returning all of them, in a stable order, lets callers write to one folder
 * consistently while still reading (and rotating) everything already stored.
 */
export async function findFolderIds(name: string): Promise<string[]> {
  const q = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    `'root' in parents`,
    'trashed = false',
  ].join(' and ');

  const url = `${DRIVE_API}/files${encodeQuery({
    q,
    spaces: 'drive',
    fields: 'files(id,name,createdTime)',
    // Oldest first, so every run and every device agrees on which folder is
    // the canonical one rather than picking Drive's arbitrary first result.
    orderBy: 'createdTime',
    pageSize: 100,
  })}`;

  const response = await driveRequest(url);
  const body = (await response.json()) as DriveListResponse;
  return (body.files ?? []).map((file) => file.id).filter((id): id is string => Boolean(id));
}

/** The canonical backup folder (the oldest match), or null if there is none. */
export async function findFolderId(name: string): Promise<string | null> {
  const ids = await findFolderIds(name);
  return ids[0] ?? null;
}

/**
 * Creates the folder. Deliberately not retried: a POST that succeeded but whose
 * response was lost would leave a second same-named folder behind, which is
 * exactly what scattered backups across duplicates in the first place. Callers
 * recover by re-querying instead.
 */
export async function createFolder(name: string): Promise<string> {
  const url = `${DRIVE_API}/files${encodeQuery({ fields: 'id' })}`;
  const response = await driveRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': JSON_MIME_TYPE },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: ['root'] }),
    attempts: 1,
  });
  const body = (await response.json()) as DriveFileResource;
  if (!body.id) throw new DriveError('client', 'Drive did not return a folder id');
  return body.id;
}

/**
 * Lists a folder's children in one paged sweep. `size` and `createdTime` come
 * back with the listing, so there is no per-file stat call.
 */
export async function listFolderChildren(folderId: string): Promise<DriveFile[]> {
  const q = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`;
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = `${DRIVE_API}/files${encodeQuery({
      q,
      spaces: 'drive',
      fields: 'nextPageToken,files(id,name,size,createdTime)',
      pageSize: 100,
      pageToken,
    })}`;
    const response = await driveRequest(url);
    const body = (await response.json()) as DriveListResponse;
    for (const resource of body.files ?? []) {
      const file = toDriveFile(resource);
      if (file) files.push(file);
    }
    pageToken = body.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/**
 * Uploads a JSON backup via Drive's resumable protocol, which is the documented
 * path for large bodies over unreliable connections (multipart is only
 * recommended below 5MB, and a long-lived user's backup passes that).
 *
 * An interrupted transfer restarts from a fresh session rather than re-sending
 * into the old one, so the two requests are made with retries disabled and the
 * whole operation is retried instead.
 */
export async function uploadJsonFile(
  folderId: string,
  name: string,
  json: string,
): Promise<string> {
  let lastError: DriveError | null = null;
  // The two upload requests run with retries disabled, so a 401 arrives here
  // instead. `driveRequest` has already dropped the rejected token by then, so
  // one more pass will use a fresh one. Only one, though: a genuinely revoked
  // grant must not loop.
  let authRetried = false;

  for (let attempt = 1; attempt <= DEFAULT_ATTEMPTS; attempt++) {
    try {
      return await uploadJsonFileOnce(folderId, name, json);
    } catch (error) {
      const driveError =
        error instanceof DriveError
          ? error
          : new DriveError('client', getErrorMessage(error, 'Drive upload failed'));
      lastError = driveError;

      const retryForAuth = driveError.kind === 'auth' && !authRetried;
      if (retryForAuth) authRetried = true;

      const shouldRetry = retryForAuth || isRetryableDriveError(driveError.kind);
      if (attempt >= DEFAULT_ATTEMPTS || !shouldRetry) throw driveError;
      // A refreshed token needs no cool-off; a flaky network does.
      if (!retryForAuth) await delay(backoffDelayMs(attempt));
    }
  }

  throw lastError ?? new DriveError('client', 'Drive upload failed');
}

async function uploadJsonFileOnce(folderId: string, name: string, json: string): Promise<string> {
  const initUrl = `${DRIVE_UPLOAD_API}/files${encodeQuery({
    uploadType: 'resumable',
    fields: 'id',
  })}`;

  const initResponse = await driveRequest(initUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `${JSON_MIME_TYPE}; charset=UTF-8`,
      'X-Upload-Content-Type': JSON_MIME_TYPE,
    },
    body: JSON.stringify({ name, parents: [folderId], mimeType: JSON_MIME_TYPE }),
    attempts: 1,
  });

  const sessionUri = initResponse.headers.get('location');
  if (!sessionUri) {
    // Some proxies strip the Location header. Fall back to a single-shot
    // multipart upload rather than failing the backup outright.
    return uploadJsonFileMultipart(folderId, name, json);
  }

  const uploadResponse = await driveRequest(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Type': JSON_MIME_TYPE },
    body: json,
    timeoutMs: TRANSFER_TIMEOUT_MS,
    attempts: 1,
  });

  const body = (await uploadResponse.json()) as DriveFileResource;
  if (!body.id) throw new DriveError('client', 'Drive did not return a file id');
  return body.id;
}

const MULTIPART_BOUNDARY = 'money2time-backup-boundary';

async function uploadJsonFileMultipart(
  folderId: string,
  name: string,
  json: string,
): Promise<string> {
  const metadata = JSON.stringify({ name, parents: [folderId], mimeType: JSON_MIME_TYPE });
  // Note the absent Content-Length: fetch computes it from the encoded bytes.
  const body = [
    `--${MULTIPART_BOUNDARY}\r\n`,
    `Content-Type: ${JSON_MIME_TYPE}; charset=UTF-8\r\n\r\n`,
    `${metadata}\r\n`,
    `--${MULTIPART_BOUNDARY}\r\n`,
    `Content-Type: ${JSON_MIME_TYPE}\r\n\r\n`,
    `${json}\r\n`,
    `--${MULTIPART_BOUNDARY}--`,
  ].join('');

  const url = `${DRIVE_UPLOAD_API}/files${encodeQuery({
    uploadType: 'multipart',
    fields: 'id',
  })}`;

  const response = await driveRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
    timeoutMs: TRANSFER_TIMEOUT_MS,
    attempts: 1,
  });

  const parsed = (await response.json()) as DriveFileResource;
  if (!parsed.id) throw new DriveError('client', 'Drive did not return a file id');
  return parsed.id;
}

export async function downloadFileText(fileId: string): Promise<string> {
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}${encodeQuery({ alt: 'media' })}`;
  const response = await driveRequest(url, { timeoutMs: TRANSFER_TIMEOUT_MS });
  return response.text();
}

export async function deleteFile(fileId: string): Promise<void> {
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}`;
  try {
    await driveRequest(url, { method: 'DELETE' });
  } catch (error) {
    // Already gone is the outcome we wanted.
    if (error instanceof DriveError && error.status === 404) return;
    throw error;
  }
}

import { captureCreativeMedia } from './export';
import type { ExportDeviceType } from './export';
import { isCreativePlacement } from '../data/appStoreCreative';

export interface Screenshot {
  filename: string;
  data: string;  // base64 media (no data: prefix)
}

/**
 * The upload modal covers one thing the rasterizer does not: Play's app icon,
 * which is a file in the repo rather than a scene rendered from React.
 */
export type UploadDevice = ExportDeviceType | 'icon';

/** Play's app icon, served straight out of `public/`. */
export const APP_ICON_URL = '/assets/icons/play_store_512.png';

/** Play takes the listing icon at exactly this, and rejects anything else. */
export const PLAY_ICON_SIZE = 512;

export interface ServerStatus {
  online: boolean;
  ios: boolean;
  android: boolean;
  /** Why a platform is or is not ready, straight from /api/status. */
  detail?: Partial<Record<'ios' | 'android', string>>;
}

// ── Server status ─────────────────────────────────────────────────────────────

export async function checkServer(): Promise<ServerStatus> {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { online: false, ios: false, android: false };
    const body = await res.json();
    return { online: true, ios: !!body.ios, android: !!body.android, detail: body.detail };
  } catch {
    return { online: false, ios: false, android: false };
  }
}

// ── Screenshot capture ────────────────────────────────────────────────────────

async function captureEl(el: HTMLElement, device: ExportDeviceType, filename: string): Promise<Screenshot> {
  const dataUrl = await captureCreativeMedia(el, device);
  return { filename, data: dataUrl.split(',')[1] };
}

export async function captureCurrentView(
  device: ExportDeviceType,
  locale: string,
  sceneRefs: Map<string, HTMLDivElement>,
  featureRef: HTMLDivElement | null,
  onProgress?: (current: number, total: number) => void,
  creativeRef?: HTMLDivElement | null,
): Promise<Screenshot[]> {
  if (isCreativePlacement(device)) {
    if (!creativeRef) throw new Error('The creative is not ready. Please try again.');
    const result = await captureEl(creativeRef, device, `${device}-${locale}.${device === 'search' ? 'mp4' : 'jpg'}`);
    onProgress?.(1, 1);
    return [result];
  }
  if (device === 'feature') {
    if (!featureRef) return [];
    onProgress?.(1, 1);
    return [await captureEl(featureRef, 'feature', `feature-${locale}.png`)];
  }
  const entries = [...sceneRefs.entries()];
  const total   = entries.length;
  const results: Screenshot[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [id, el] = entries[i];
    results.push(await captureEl(el, device, `${String(i + 1).padStart(2, '0')}-${locale}-${id}.png`));
    onProgress?.(i + 1, total);
  }
  return results;
}

// ── App icon ──────────────────────────────────────────────────────────────────

/**
 * The icon's real dimensions, read in the browser so a wrong-sized file is
 * caught before an edit is opened rather than half way through thirty locales.
 */
export function appIconSize(): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`could not load ${APP_ICON_URL}`));
    img.src = `${APP_ICON_URL}?t=${Date.now()}`;
  });
}

/** Put the icon on one Play listing, inside an open edit session. */
export async function uploadAndroidIcon(sessionId: string, playLocale: string): Promise<void> {
  const res = await fetch('/api/upload/android/icon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, playLocale }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
}

// ── iOS upload ────────────────────────────────────────────────────────────────

export interface IOSUploadResult {
  skipped?: boolean;
  reason?: string;
  count?: number;
  version?: string;
  ascLocale?: string;
  /** App Store locales this upload reached. */
  uploaded?: string[];
  /** App Store locales that failed while others in the same call succeeded. */
  errors?: string[];
  /** The creative is uploaded; Apple is still processing it. */
  pending?: boolean;
  /** Resume this creative on the original version without uploading it again. */
  resumeToken?: string;
}

export async function uploadIOSLocale(
  device: ExportDeviceType,
  locale: string,
  screenshots: Screenshot[],
  onProcessing?: () => void,
): Promise<IOSUploadResult> {
  const creative = isCreativePlacement(device);
  if (creative && screenshots.length !== 1) throw new Error('Upload one creative per language.');
  let payload: object = creative
    ? { placement: device, locale, data: screenshots[0].data }
    : { device, locale, screenshots };
  const deadline = Date.now() + 15 * 60_000;
  let notified = false;
  while (true) {
    const res = await fetch(creative ? '/api/upload/ios/creative' : '/api/upload/ios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => {
      throw new Error(res.ok ? 'The upload server returned an invalid response.' : `Upload failed (${res.status}).`);
    });
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    const result = body as IOSUploadResult;
    if (!creative || !result.pending) return result;
    if (!result.resumeToken) throw new Error('App Store did not provide an upload reference. Check Asset Library before retrying.');
    if (!notified) { onProcessing?.(); notified = true; }
    if (Date.now() >= deadline) throw new Error('Apple is still processing this creative. Existing creatives were kept. Retry this upload to continue with the same creative while this Studio server is running.');
    payload = { resumeToken: result.resumeToken };
  }
}

// ── Android upload ────────────────────────────────────────────────────────────

export async function startAndroidSession(device: UploadDevice): Promise<string> {
  const storeDevice = device === 'ipad' ? 'tablet' : device;
  const res = await fetch('/api/upload/android/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: storeDevice }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  const { sessionId } = await res.json();
  return sessionId as string;
}

/**
 * Open the edit an icon run writes through, and get the listings to write to
 * out of the same call.
 *
 * Play holds one edit per app and opening a second invalidates the first, so
 * asking "which locales?" separately would kill the edit it was asked
 * alongside. The server reads them from inside the edit it just opened.
 */
export async function startAndroidIconSession(): Promise<{ sessionId: string; locales: string[] }> {
  const res = await fetch('/api/upload/android/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: 'icon' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  const { sessionId, locales } = await res.json();
  return { sessionId, locales: (locales ?? []) as string[] };
}

export interface AndroidUploadResult {
  skipped?: boolean;
  reason?: string;
  uploaded?: string[];
  errors?: string[];
  /** How many went to each gallery — Play caps each, so this may be fewer than
   *  the screenshots handed in. */
  count: number;
  /** The Play galleries written. Tablet art goes to 7-inch and 10-inch both. */
  galleries?: string[];
  /** Filenames dropped for exceeding the Play limit. */
  dropped?: string[];
}

export async function uploadAndroidLocale(
  sessionId: string,
  locale: string,
  screenshots: Screenshot[],
): Promise<AndroidUploadResult> {
  const res = await fetch('/api/upload/android/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, locale, screenshots }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

export async function commitAndroidSession(sessionId: string): Promise<void> {
  const res = await fetch('/api/upload/android/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
}

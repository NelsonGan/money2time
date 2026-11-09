/**
 * Server-side bits the upload routes share. Node.js runtime only.
 *
 * The work itself lives in `src/data/storeUpload.mjs`, which the CLI scripts
 * import too. What is here is the part that is specific to being a request:
 * where captured PNGs are staged, and the Play edit that has to outlive the
 * request that opened it.
 */
import path from 'path';

export {
  run, runJson, briefError,
  iosReady, androidReady,
  stageLocale, sortedPngs,
  iosVersion, iosLocalizationId,
  uploadIOSLocale, uploadIOSDescription,
  androidEditCreate, androidEditCommit, androidEditDelete,
  uploadAndroidLocale, uploadAndroidDescriptions,
  androidListingLocales, androidIconPath, uploadAndroidIcon,
  androidTracks, uploadAndroidReleaseNotes,
} from '@/data/storeUpload.mjs';

export {
  IOS_LOCALE_MAP, ANDROID_LOCALE_MAP,
  IOS_DEVICE_TYPE, ANDROID_IMAGE_TYPES,
  ANDROID_MAX_SCREENSHOTS,
} from '@/data/storeLocales.mjs';

/**
 * Captured PNGs land here before a CLI sees them. Project-local rather than a
 * temp dir so that when an upload goes wrong you can look at exactly what was
 * sent. Gitignored.
 */
export const STAGING_ROOT = path.join(process.cwd(), '.upload-staging');

export function stagingDir(...parts: string[]): string {
  return path.join(STAGING_ROOT, ...parts);
}

/**
 * A Play edit outlives the request that opened it: the modal opens one, sends
 * a request per locale, then commits. Kept on globalThis so a dev hot-reload
 * does not orphan an edit mid-run.
 */
export interface AndroidSession {
  editId: string;
  device: string;
}

declare global { var __androidSessions: Map<string, AndroidSession> | undefined; }

export const androidSessions: Map<string, AndroidSession> =
  globalThis.__androidSessions ?? new Map();

if (!globalThis.__androidSessions) {
  globalThis.__androidSessions = androidSessions;
}

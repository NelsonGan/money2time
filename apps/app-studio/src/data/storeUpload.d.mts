/** The contract `storeUpload.mjs` offers the API routes and the CLI scripts. */

export interface CliResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export type Logger = (line: string) => void;

export interface Readiness {
  ok: boolean;
  /** Present when ok. */
  detail?: string;
  /** Present when not ok. */
  why?: string;
}

export interface IOSVersion {
  id: string;
  versionString: string;
  /** A first release has no What's New field; App Store Connect refuses it. */
  isFirstRelease: boolean;
}

export interface IOSUploadResult {
  skipped?: boolean;
  reason?: string;
  uploaded: string[];
  errors: string[];
  version: string;
}

export interface IOSDescriptionResult {
  skipped?: boolean;
  updated: string[];
  errors: string[];
  /** Fields that could not be written but did not fail the locale. */
  notes: string[];
  version: string;
  isFirstRelease: boolean;
}

export interface AndroidUploadResult {
  skipped?: boolean;
  reason?: string;
  uploaded: string[];
  errors: string[];
  /** How many were sent to each gallery, after Play's per-gallery cap. */
  count: number;
  /** The Play galleries written; tablet art goes to both 7-inch and 10-inch. */
  galleries: string[];
  dropped: string[];
}

export interface AndroidDescriptionResult {
  /** Every store locale written. */
  updated: string[];
  /** The same, grouped by our locale code. */
  byLocale: Record<string, string[]>;
  errors: string[];
}

export interface IOSDescriptionCopy {
  name?: string;
  subtitle?: string;
  description?: string;
  keywords?: string;
  whatsNew?: string;
  supportUrl?: string;
  marketingUrl?: string;
  privacyPolicyUrl?: string;
  privacyChoicesUrl?: string;
  privacyPolicyText?: string;
}

export interface AndroidDescriptionCopy {
  name?: string;
  subtitle?: string;
  description?: string;
}

export interface Screenshot {
  filename: string;
  /** base64 PNG, no data: prefix. */
  data: string;
}

export declare function run(bin: string, args: string[], opts?: object): Promise<CliResult>;
export declare function runJson(bin: string, args: string[], opts?: object): Promise<CliResult & { json: unknown }>;
export declare function briefError(res: CliResult): string;

export declare function iosReady(): Promise<Readiness>;
export declare function androidReady(): Promise<Readiness>;

export declare const UPLOAD_CONCURRENCY: number;
export declare function forEachLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void>;
export declare function parseConcurrency(value: string | undefined): number;

export declare function stageLocale(root: string, locale: string, screenshots: Screenshot[]): string;
export declare function sortedPngs(dir: string): string[];

export declare function iosVersion(opts?: { refresh?: boolean }): Promise<IOSVersion>;
export declare function iosLocalizationId(
  versionId: string,
  ascLocale: string,
  opts?: { create?: boolean },
): Promise<{ id: string | null; created: boolean; wouldCreate?: boolean }>;

export declare function uploadIOSLocale(args: {
  device: string; locale: string; dir: string; dryRun?: boolean; log?: Logger;
}): Promise<IOSUploadResult>;

export declare function uploadIOSDescription(args: {
  locale: string; copy: IOSDescriptionCopy; dryRun?: boolean; log?: Logger;
}): Promise<IOSDescriptionResult>;

export declare function androidEditCreate(): Promise<string>;
export declare function androidEditCommit(editId: string): Promise<void>;
export declare function androidEditDelete(editId: string): Promise<void>;

export declare function uploadAndroidLocale(args: {
  device: string; locale: string; dir: string; editId: string; log?: Logger;
}): Promise<AndroidUploadResult>;

export declare function androidListingLocales(editId: string): Promise<string[]>;
export declare function androidIconPath(root?: string): string;
export declare function uploadAndroidIcon(args: {
  playLocale: string; file: string; editId: string;
}): Promise<{ locale: string }>;

export interface AndroidTrack {
  track: string;
  releases: Array<{ name?: string; status?: string; versionCodes: string[] }>;
}

export declare const ANDROID_RELEASE_NOTE_MAX: number;

export declare function androidTracks(): Promise<AndroidTrack[]>;

export declare function androidDefaultLanguage(): Promise<string | null>;

export declare function uploadAndroidReleaseNotes(args: {
  track: string;
  localizations: Record<string, { whatsNew?: string }>;
  dryRun?: boolean;
  log?: Logger;
}): Promise<AndroidDescriptionResult>;

export declare function uploadAndroidDescriptions(args: {
  root: string;
  localizations: Record<string, AndroidDescriptionCopy>;
  dryRun?: boolean;
  log?: Logger;
}): Promise<AndroidDescriptionResult>;

export {
  IOS_LOCALE_MAP, ANDROID_LOCALE_MAP, IOS_DEVICE_TYPE, ANDROID_IMAGE_TYPES,
  ANDROID_ICON_FILE,
} from './storeLocales.mjs';

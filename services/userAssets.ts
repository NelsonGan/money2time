import { Directory, File, Paths } from 'expo-file-system/next';

import { newId } from '~/utils/id';

/**
 * Persistent store for user-uploaded assets, namespaced by kind under one root
 * that the backup layer walks wholesale.
 *
 *   <documentDirectory>/user-assets/
 *     account-logos/<id>.<ext>   ← accounts.logo_id
 *     album-covers/<id>.<ext>    ← albums.cover_photo_uri
 *     avatars/<id>.<ext>         ← settings.profile_avatar_uri
 *     category-icons/<id>.<ext>  ← categories.icon, accounts.goal_emoji,
 *                                  budget_templates.emoji,
 *                                  monthly_budgets.template_emoji
 *     item-icons/<id>.<ext>      ← items.icon_id
 *     payment-qr/<id>.<ext>      ← settings.payment_qr_uri
 *     receipts/<id>.<ext>        ← transactions.receipt_uri,
 *                                  receipt_splits.receipt_image_uri
 *
 * Logo/icon kinds are referenced with a `custom:` prefix followed by the path
 * relative to the user-assets root, e.g. `custom:account-logos/9f3c….png`; the
 * photo kinds store the bare relative path. Adding a kind means adding it to
 * `collectReferencedAssetPaths` in services/userAssetGc.ts, or the orphan sweep
 * will delete live files.
 */
const ROOT = 'user-assets';
const ACCOUNT_LOGOS_KIND = 'account-logos';
export const CUSTOM_LOGO_PREFIX = 'custom:';
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic']);
const AVATARS_KIND = 'avatars';
const ALBUM_COVERS_KIND = 'album-covers';
const ITEM_ICONS_KIND = 'item-icons';
const CATEGORY_ICONS_KIND = 'category-icons';
const RECEIPTS_KIND = 'receipts';
const PAYMENT_QR_KIND = 'payment-qr';

export interface UserAssetBackupEntry {
  /** Path relative to the user-assets root, e.g. `account-logos/9f3c.png`. */
  path: string;
  base64: string;
}

function rootDir(): Directory {
  return new Directory(Paths.document, ROOT);
}

function kindDir(kind: string): Directory {
  return new Directory(Paths.document, ROOT, kind);
}

function ensureDir(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

function extensionFor(uri: string): string {
  const raw = uri.split('?')[0].split('#')[0];
  const ext = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : '';
  return ALLOWED_EXTENSIONS.has(ext) ? ext : 'png';
}

export function isCustomLogoId(logoId?: string | null): boolean {
  return !!logoId && logoId.startsWith(CUSTOM_LOGO_PREFIX);
}

/**
 * Normalizes a stored asset reference to its path relative to the user-assets
 * root, or null when the value is not a managed on-disk asset.
 *
 * Accepts both bare relative paths as stored on their rows
 * (`receipts/x.jpg`, `album-covers/x.jpg`, `avatars/x.jpg`, `payment-qr/x.jpg`)
 * and `custom:`-prefixed ids (`custom:account-logos/x.png`,
 * `custom:item-icons/x.png`). Built-in logo/icon ids (no `custom:` prefix, no
 * slash) resolve to themselves and simply never match a real file. Rejects
 * traversal and absolute paths.
 */
export function assetRelativePathFromRef(ref?: string | null): string | null {
  if (!ref) return null;
  const rel = ref.startsWith(CUSTOM_LOGO_PREFIX) ? ref.slice(CUSTOM_LOGO_PREFIX.length) : ref;
  if (!rel || rel.includes('..') || rel.startsWith('/')) return null;
  return rel;
}

/** Relative path within user-assets for a `custom:` logo id, or null. */
function relativePathFor(logoId?: string | null): string | null {
  if (!isCustomLogoId(logoId)) return null;
  const rel = logoId!.slice(CUSTOM_LOGO_PREFIX.length);
  // Guard against traversal in restored ids.
  if (rel.includes('..') || rel.startsWith('/')) return null;
  return rel;
}

/** Copies a picked image into the store and returns its `custom:` logo id. */
export function saveCustomAccountLogo(sourceUri: string): string {
  ensureDir(kindDir(ACCOUNT_LOGOS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, ACCOUNT_LOGOS_KIND, fileName);
  new File(sourceUri).copy(dest);
  invalidateCustomUriCache();
  return `${CUSTOM_LOGO_PREFIX}${ACCOUNT_LOGOS_KIND}/${fileName}`;
}

/** Copies a picked image into the avatar store, returning its relative path
 *  (e.g. `avatars/9f3c.jpg`) for persistence in settings. */
export function saveProfileAvatar(sourceUri: string): string {
  ensureDir(kindDir(AVATARS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, AVATARS_KIND, fileName);
  new File(sourceUri).copy(dest);
  return `${AVATARS_KIND}/${fileName}`;
}

/** Resolves a stored avatar relative path to an on-disk file uri, or null. */
export function getProfileAvatarUri(relativePath?: string | null): string | null {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  return file.exists ? file.uri : null;
}

/** Deletes a stored avatar file, e.g. when replacing or clearing it. */
export function deleteProfileAvatar(relativePath?: string | null) {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (file.exists) file.delete();
}

/** Copies a picked image into the album-cover store, returning its relative
 *  path (e.g. `album-covers/9f3c.jpg`) for persistence on the album row. */
export function saveAlbumCover(sourceUri: string): string {
  ensureDir(kindDir(ALBUM_COVERS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, ALBUM_COVERS_KIND, fileName);
  new File(sourceUri).copy(dest);
  return `${ALBUM_COVERS_KIND}/${fileName}`;
}

/** Resolves a stored album-cover relative path to an on-disk file uri, or null. */
export function getAlbumCoverUri(relativePath?: string | null): string | null {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  return file.exists ? file.uri : null;
}

/** Deletes a stored album-cover file, e.g. when replacing or clearing it. */
export function deleteAlbumCover(relativePath?: string | null) {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (file.exists) file.delete();
}

/** Copies a picked image into the receipt store, returning its relative path
 *  (e.g. `receipts/9f3c.jpg`) for persistence on the transaction row. */
export function saveReceiptImage(sourceUri: string): string {
  ensureDir(kindDir(RECEIPTS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, RECEIPTS_KIND, fileName);
  new File(sourceUri).copy(dest);
  return `${RECEIPTS_KIND}/${fileName}`;
}

/**
 * Duplicates an already-stored receipt file under a fresh name, returning the
 * copy's relative path. Used when one scanned photo yields several
 * transactions: each row must own its file exclusively, because deleting a
 * transaction's receipt deletes the file.
 */
export function copyReceiptImage(relativePath?: string | null): string | null {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const source = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (!source.exists) return null;
  ensureDir(kindDir(RECEIPTS_KIND));
  const fileName = `${newId()}.${extensionFor(relativePath)}`;
  const dest = new File(Paths.document, ROOT, RECEIPTS_KIND, fileName);
  source.copy(dest);
  return `${RECEIPTS_KIND}/${fileName}`;
}

/** Resolves a stored receipt relative path to an on-disk file uri, or null. */
export function getReceiptUri(relativePath?: string | null): string | null {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  return file.exists ? file.uri : null;
}

/** Deletes a stored receipt file, e.g. when replacing or clearing it. */
export function deleteReceiptImage(relativePath?: string | null) {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (file.exists) file.delete();
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Reads a stored receipt as base64 plus its MIME type, for upload to the
 * receipt-scan API. Returns null when the path is missing/invalid or the file
 * no longer exists.
 */
export async function readReceiptBase64(
  relativePath?: string | null,
): Promise<{ base64: string; mime: string } | null> {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (!file.exists) return null;
  const base64 = await file.base64();
  const mime = MIME_BY_EXTENSION[extensionFor(relativePath)] ?? 'image/jpeg';
  return { base64, mime };
}

/** Copies a picked image into the payment-QR store, returning its relative path
 *  (e.g. `payment-qr/9f3c.png`) for persistence in settings. */
export function savePaymentQr(sourceUri: string): string {
  ensureDir(kindDir(PAYMENT_QR_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, PAYMENT_QR_KIND, fileName);
  new File(sourceUri).copy(dest);
  return `${PAYMENT_QR_KIND}/${fileName}`;
}

/** Resolves a stored payment-QR relative path to an on-disk file uri, or null. */
export function getPaymentQrUri(relativePath?: string | null): string | null {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return null;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  return file.exists ? file.uri : null;
}

/** Deletes a stored payment-QR file, e.g. when replacing or clearing it. */
export function deletePaymentQr(relativePath?: string | null) {
  if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) return;
  const file = new File(Paths.document, ROOT, ...relativePath.split('/'));
  if (file.exists) file.delete();
}

/**
 * Memoizes {@link getCustomLogoUri}, which is called during render by
 * CategoryEmoji, ItemIcon and AccountLogo. Each miss is a synchronous
 * filesystem stat, and a transaction list re-renders its rows constantly, so
 * without this a single uploaded category icon costs one stat per visible row
 * per render pass. Invalidated wholesale by anything that adds or removes a
 * file, which is rare; ids are uuid-named, so a hit can only go stale that way.
 */
const customUriCache = new Map<string, string | null>();

function invalidateCustomUriCache() {
  customUriCache.clear();
}

/** Resolves a `custom:` logo id to an on-disk file uri, or null if missing. */
export function getCustomLogoUri(logoId?: string | null): string | null {
  const rel = relativePathFor(logoId);
  if (!rel) return null;
  const cached = customUriCache.get(rel);
  if (cached !== undefined) return cached;
  const file = new File(Paths.document, ROOT, ...rel.split('/'));
  const uri = file.exists ? file.uri : null;
  customUriCache.set(rel, uri);
  return uri;
}

/**
 * Clears one entry from the custom-uri cache. Call this when a native
 * `<Image>` reports a load failure for a uri that `getCustomLogoUri` had
 * resolved (and cached) as present — the stat and the actual read raced, or
 * the file was removed by something that didn't go through this module's
 * write paths (Sentry MONEY2TIME-R: "the file … couldn't be opened because
 * there is no such file"). The next render re-stats instead of trusting a
 * cache entry that's now proven stale.
 */
export function forgetCustomLogoUri(logoId?: string | null) {
  const rel = relativePathFor(logoId);
  if (!rel) return;
  customUriCache.delete(rel);
}

export function listCustomAccountLogos(): { id: string; uri: string }[] {
  const dir = kindDir(ACCOUNT_LOGOS_KIND);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({
      id: `${CUSTOM_LOGO_PREFIX}${ACCOUNT_LOGOS_KIND}/${file.name}`,
      uri: file.uri,
    }));
}

export function deleteCustomLogo(logoId: string) {
  const rel = relativePathFor(logoId);
  if (!rel) return;
  const file = new File(Paths.document, ROOT, ...rel.split('/'));
  if (file.exists) file.delete();
  invalidateCustomUriCache();
}

/** Copies a picked image into the item-icon store, returning a `custom:` id
 *  (e.g. `custom:item-icons/9f3c.png`) for persistence on the item row. */
export function saveCustomItemIcon(sourceUri: string): string {
  ensureDir(kindDir(ITEM_ICONS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, ITEM_ICONS_KIND, fileName);
  new File(sourceUri).copy(dest);
  invalidateCustomUriCache();
  return `${CUSTOM_LOGO_PREFIX}${ITEM_ICONS_KIND}/${fileName}`;
}

/**
 * Copies a picked image into the category-icon store, returning a `custom:` id
 * (e.g. `custom:category-icons/9f3c.png`). Shared by categories, savings goals
 * and budget templates, which all draw from one uploaded-icon library.
 */
export function saveCustomCategoryIcon(sourceUri: string): string {
  ensureDir(kindDir(CATEGORY_ICONS_KIND));
  const fileName = `${newId()}.${extensionFor(sourceUri)}`;
  const dest = new File(Paths.document, ROOT, CATEGORY_ICONS_KIND, fileName);
  new File(sourceUri).copy(dest);
  invalidateCustomUriCache();
  return `${CUSTOM_LOGO_PREFIX}${CATEGORY_ICONS_KIND}/${fileName}`;
}

export function listCustomCategoryIcons(): { id: string; uri: string }[] {
  const dir = kindDir(CATEGORY_ICONS_KIND);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({
      id: `${CUSTOM_LOGO_PREFIX}${CATEGORY_ICONS_KIND}/${file.name}`,
      uri: file.uri,
    }));
}

export function listCustomItemIcons(): { id: string; uri: string }[] {
  const dir = kindDir(ITEM_ICONS_KIND);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({
      id: `${CUSTOM_LOGO_PREFIX}${ITEM_ICONS_KIND}/${file.name}`,
      uri: file.uri,
    }));
}

/**
 * Reads every file under the user-assets root as base64 for inclusion in a
 * backup. Walks all kinds so future asset types are covered automatically.
 */
export async function collectUserAssetsForBackup(): Promise<UserAssetBackupEntry[]> {
  const root = rootDir();
  if (!root.exists) return [];
  const out: UserAssetBackupEntry[] = [];
  const walk = async (dir: Directory, prefix: string) => {
    for (const entry of dir.list()) {
      if (entry instanceof Directory) {
        await walk(entry, `${prefix}${entry.name}/`);
      } else {
        // A file enumerated here can vanish before it's read — a concurrent
        // delete (the user removes the receipt/logo/etc. mid-backup) or the
        // orphan sweep can win the race against this walk. Skip it rather
        // than failing the whole backup on one missing file (Sentry
        // MONEY2TIME-R: "couldn't be opened because there is no such file").
        try {
          out.push({ path: `${prefix}${entry.name}`, base64: await entry.base64() });
        } catch {
          continue;
        }
      }
    }
  };
  await walk(root, '');
  return out;
}

/**
 * Deletes every file under the user-assets root whose relative path is not in
 * `referencedPaths`, reclaiming images orphaned by deleted transactions, data
 * resets, imports, and abandoned scans. This matters because
 * {@link collectUserAssetsForBackup} walks the folder wholesale, so any orphan
 * left on disk is re-encoded into every backup forever — the dominant cause of
 * ever-growing backup sizes. Returns the number of files removed.
 *
 * Only deletes files the caller has proven unreferenced by any live row, so an
 * incomplete `referencedPaths` set risks deleting a live asset — callers must
 * collect from every asset-bearing column.
 */
export function sweepOrphanUserAssets(referencedPaths: ReadonlySet<string>): number {
  const root = rootDir();
  if (!root.exists) return 0;
  let removed = 0;
  const walk = (dir: Directory, prefix: string) => {
    for (const entry of dir.list()) {
      if (entry instanceof Directory) {
        walk(entry, `${prefix}${entry.name}/`);
      } else if (!referencedPaths.has(`${prefix}${entry.name}`)) {
        try {
          entry.delete();
          removed += 1;
        } catch {
          // Leave the file if the platform refuses the delete; a later sweep retries.
        }
      }
    }
  };
  walk(root, '');
  if (removed > 0) invalidateCustomUriCache();
  return removed;
}

/** Writes backed-up user assets back to disk (overwriting), creating dirs. */
export function restoreUserAssetsFromBackup(assets?: UserAssetBackupEntry[]) {
  if (!assets || assets.length === 0) return;
  for (const asset of assets) {
    const parts = asset.path.split('/').filter((part) => part && part !== '..');
    if (parts.length === 0) continue;
    const fileName = parts.pop() as string;
    const dir = new Directory(Paths.document, ROOT, ...parts);
    ensureDir(dir);
    const file = new File(Paths.document, ROOT, ...parts, fileName);
    file.create({ overwrite: true });
    file.write(asset.base64, { encoding: 'base64' });
  }
  invalidateCustomUriCache();
}

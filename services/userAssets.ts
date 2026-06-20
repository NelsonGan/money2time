import { Directory, File, Paths } from 'expo-file-system/next';

import { newId } from '~/utils/id';

/**
 * Persistent store for user-uploaded assets, namespaced so future upload kinds
 * (receipts, avatars, …) can live alongside account logos under one root that
 * the backup layer walks wholesale.
 *
 *   <documentDirectory>/user-assets/
 *     account-logos/<id>.<ext>
 *
 * Account logos are referenced from `accounts.logo_id` with a `custom:` prefix
 * followed by the path relative to the user-assets root, e.g.
 *   custom:account-logos/9f3c….png
 */
const ROOT = 'user-assets';
const ACCOUNT_LOGOS_KIND = 'account-logos';
export const CUSTOM_LOGO_PREFIX = 'custom:';
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic']);
const AVATARS_KIND = 'avatars';

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

/** Resolves a `custom:` logo id to an on-disk file uri, or null if missing. */
export function getCustomLogoUri(logoId?: string | null): string | null {
  const rel = relativePathFor(logoId);
  if (!rel) return null;
  const file = new File(Paths.document, ROOT, ...rel.split('/'));
  return file.exists ? file.uri : null;
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
        out.push({ path: `${prefix}${entry.name}`, base64: await entry.base64() });
      }
    }
  };
  await walk(root, '');
  return out;
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
}

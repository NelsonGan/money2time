/**
 * Shrinks picked images as they are saved, and the large ones already stored,
 * to the limits in imageShrink.shared.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system/next';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AppState } from 'react-native';

import {
  IMAGE_LIMITS,
  imageExtension,
  type PickedImageKind,
  resizeFor,
  savesAsPng,
  shouldShrinkStored,
  storedImageKind,
  type StoredImageMemo,
} from '~/services/imageShrink.shared';
import { listUserAssetFilesForBackup } from '~/services/userAssets';

export type { PickedImageKind } from '~/services/imageShrink.shared';

const STORED_MEMO_KEY = 'imageShrink.storedMemo.v1';

/**
 * A picked image at its kind's size, as a new temporary file. Falls back to the
 * original on any failure: saving the user's pick matters more than its size.
 */
export async function shrinkPickedImage(
  uri: string,
  kind: PickedImageKind,
  source: { width?: number | null; height?: number | null } = {},
): Promise<string> {
  try {
    const limit = IMAGE_LIMITS[kind];
    let width = source.width ?? 0;
    let height = source.height ?? 0;
    let context = ImageManipulator.manipulate(uri);
    if (!(width > 0 && height > 0)) {
      const decoded = await context.renderAsync();
      ({ width, height } = decoded);
      context = ImageManipulator.manipulate(decoded);
    }
    const resize = resizeFor(width, height, limit.maxEdge);
    if (resize) context.resize(resize);
    const image = await context.renderAsync();
    const out = await image.saveAsync(
      savesAsPng(kind, uri)
        ? { format: SaveFormat.PNG }
        : { compress: limit.compress, format: SaveFormat.JPEG },
    );
    return out.uri;
  } catch (error) {
    console.warn('[imageShrink] keeping the picked image as it is', error);
    return uri;
  }
}

/**
 * Re-encodes one stored file in place, in its own format, and returns its size
 * afterwards. The new file replaces the old only when it is clearly smaller.
 */
async function shrinkStoredFile(path: string, file: File, kind: PickedImageKind): Promise<number> {
  const size = file.size;
  const limit = IMAGE_LIMITS[kind];
  const png = imageExtension(path) === 'png';
  const decoded = await ImageManipulator.manipulate(file.uri).renderAsync();
  const resize = resizeFor(decoded.width, decoded.height, limit.maxEdge);
  // A PNG only gets smaller by getting fewer pixels.
  if (png && !resize) return size;
  const context = ImageManipulator.manipulate(decoded);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const out = await image.saveAsync(
    png ? { format: SaveFormat.PNG } : { compress: limit.compress, format: SaveFormat.JPEG },
  );
  const shrunk = new File(out.uri);
  // Not smaller, or the file was replaced or deleted while it was re-encoded
  // (a new avatar picked meanwhile): leave what is there.
  if (shrunk.size >= size * 0.9 || !file.exists || file.size !== size) {
    shrunk.delete();
    return file.exists ? file.size : 0;
  }
  // The path stays, so every row naming it still does; only the bytes change.
  shrunk.moveSync(file, { overwrite: true });
  return new File(file.uri).size;
}

async function readMemo(): Promise<StoredImageMemo> {
  try {
    const raw = await AsyncStorage.getItem(STORED_MEMO_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as StoredImageMemo) : {};
  } catch {
    return {};
  }
}

let running: Promise<void> | null = null;

/**
 * Brings stored photos and icons over their kind's size down to it, keeping
 * each file's path and format. Images picked before the limits, restored from
 * an older backup or synced from another phone are shrunk once, before a
 * backup reads them. A file that cannot get smaller is remembered at its size,
 * so later passes check only file sizes. Never throws.
 */
export function shrinkStoredPhotos(): Promise<void> {
  // Only in the foreground: a background task has little time, and a decode
  // the system cuts short must not be remembered as a file that cannot shrink.
  if (AppState.currentState === 'background') return Promise.resolve();
  running ??= (async () => {
    try {
      const memo = await readMemo();
      const next: StoredImageMemo = {};
      for (const entry of listUserAssetFilesForBackup()) {
        const kind = storedImageKind(entry.path);
        if (!kind) continue;
        const file = new File(entry.uri);
        const size = file.size;
        if (memo[entry.path] === size) next[entry.path] = size;
        if (!shouldShrinkStored(entry.path, size, memo)) continue;
        try {
          const after = await shrinkStoredFile(entry.path, file, kind);
          if (after > IMAGE_LIMITS[kind].shrinkAboveBytes) next[entry.path] = after;
        } catch (error) {
          // Not remembered: the next foreground pass tries again.
          console.warn(`[imageShrink] could not shrink ${entry.path}`, error);
        }
      }
      await AsyncStorage.setItem(STORED_MEMO_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[imageShrink] stored photo pass failed', error);
    } finally {
      running = null;
    }
  })();
  return running;
}

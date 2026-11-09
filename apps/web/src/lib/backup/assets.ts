"use client";

import type { UserAsset } from "./types";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Photos the user added in the app (trip covers, goal covers, custom icons)
 * travel inside the backup as base64. They are turned into object URLs on first
 * use, so a backup with dozens of photos costs nothing until a page shows one.
 * HEIC is skipped: most browsers cannot draw it.
 */
export function createAssetResolver(assets: UserAsset[] | undefined) {
  const byPath = new Map((assets ?? []).map((asset) => [asset.path, asset.base64]));
  const urls = new Map<string, string | null>();

  const resolve = (ref: string | null | undefined): string | null => {
    if (!ref) return null;
    const path = ref.startsWith("custom:") ? ref.slice("custom:".length) : ref;
    if (urls.has(path)) return urls.get(path) ?? null;
    const base64 = byPath.get(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME[ext];
    let url: string | null = null;
    if (base64 && mime && typeof window !== "undefined") {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      } catch {
        url = null;
      }
    }
    urls.set(path, url);
    return url;
  };

  const dispose = () => {
    for (const url of urls.values()) if (url) URL.revokeObjectURL(url);
    urls.clear();
  };

  return { resolve, dispose };
}

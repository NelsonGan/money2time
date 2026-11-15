"use client";

import { albumsOf, parseGroup, type AlbumView, type Group } from "@/lib/album/group";
import { CSRF_HEADER } from "@/lib/album/csrf";
import type { GroupRowWrite } from "@/lib/album/writes";

/**
 * The page's calls to its own API (`/api/*`, `src/lib/album/server.ts`). The
 * session is an HttpOnly cookie the page never sees; every write carries the
 * header the server checks against cross-site requests.
 */

export type SessionUser = { id: string; email: string; name: string };

export type InvitePreview = {
  ledgerId: string;
  name: string;
  ownerName: string;
  memberCount: number;
  kind: "ledger" | "album";
};

export class AlbumApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init.method && init.method !== "GET" ? { [CSRF_HEADER]: "1" } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AlbumApiError("network", 0);
  }
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) throw new AlbumApiError(typeof body?.error === "string" ? body.error : "server_error", response.status);
  return body as T;
}

export const api = {
  session: () => call<{ user: SessionUser | null }>("/session").then((body) => body.user),
  signOut: () => call("/session", { method: "DELETE" }),
  signInWithGoogle: (idToken: string) => call<{ user: SessionUser }>("/session/google", { method: "POST", body: { idToken } }).then((body) => body.user),
  sendEmailCode: (email: string, captcha: string | null) => call("/session/email-code", { method: "POST", body: { email, captcha } }),
  signInWithEmail: (email: string, otp: string) => call<{ user: SessionUser }>("/session/email", { method: "POST", body: { email, otp } }).then((body) => body.user),
  invite: (code: string) => call<InvitePreview>(`/invites/${code}`),
  join: (code: string, name: string) => call<{ album: { id: string } }>(`/invites/${code}/join`, { method: "POST", body: { name } }).then((body) => body.album.id),
  albums: async (): Promise<AlbumView[]> => albumsOf(await call("/albums")),
  /**
   * The album's group and its change stamp; with `since` (the stamp of the
   * last read), null while nothing changed since.
   */
  group: async (shareId: string, since?: string): Promise<{ group: Group; stamp: string | null } | null> => {
    const body = await call<{ unchanged?: unknown; stamp?: unknown }>(`/albums/${shareId}${since ? `?since=${encodeURIComponent(since)}` : ""}`);
    if (since && body?.unchanged === true) return null;
    const group = parseGroup(body);
    if (!group) throw new AlbumApiError("server_error", 502);
    return { group, stamp: typeof body.stamp === "string" ? body.stamp : null };
  },
  write: (shareId: string, rows: GroupRowWrite[], reason?: "close_even") => call(`/albums/${shareId}/write`, { method: "POST", body: { rows, reason } }),
  rejoin: (shareId: string, name: string) => call(`/albums/${shareId}/join`, { method: "POST", body: { name } }),
  inviteLink: (shareId: string, rotate = false) => call<{ url: string; expiresAt: number }>(`/albums/${shareId}/invite`, { method: "POST", body: { rotate } }),
  leave: (shareId: string) => call(`/albums/${shareId}/leave`, { method: "POST", body: {} }),
  removeMember: (shareId: string, userId: string) => call(`/albums/${shareId}/members/${userId}`, { method: "DELETE" }),
  coverUrl: (shareId: string, cover: string) => `/api/albums/${shareId}/media/${cover.split("/").map(encodeURIComponent).join("/")}`,
};

"use client";

import { createContext, useContext } from "react";

import type { SessionUser } from "./api";

/**
 * Where the album site is, and who is signed in: shared by every screen
 * (`AlbumApp` provides it). Its own module, so the screens and the shell do
 * not import each other.
 */

export type Route = { name: "home" } | { name: "join"; code: string } | { name: "album"; shareId: string; tab: Tab };
export type Tab = "transactions" | "breakdown" | "balances";

export function routeOf(pathname: string, search: string): Route {
  const join = /^\/join\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname);
  if (join) return { name: "join", code: join[1] };
  const album = /^\/a\/([A-Za-z0-9-]{8,64})\/?$/.exec(pathname);
  if (album) {
    const tab = new URLSearchParams(search).get("tab");
    return { name: "album", shareId: album[1], tab: tab === "breakdown" || tab === "balances" ? tab : "transactions" };
  }
  return { name: "home" };
}

export function pathOf(route: Route): string {
  if (route.name === "join") return `/join/${route.code}`;
  if (route.name === "album") return `/a/${route.shareId}${route.tab === "transactions" ? "" : `?tab=${route.tab}`}`;
  return "/";
}

type Site = {
  /** Undefined while the session is being asked for. */
  user: SessionUser | null | undefined;
  setUser: (user: SessionUser | null) => void;
  signOut: () => Promise<void>;
  route: Route;
  /** `replace`: the step does not get its own Back (a tab, a finished join). */
  go: (route: Route, options?: { replace?: boolean }) => void;
};

export const SiteContext = createContext<Site | null>(null);

export function useSite(): Site {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite outside AlbumApp");
  return site;
}


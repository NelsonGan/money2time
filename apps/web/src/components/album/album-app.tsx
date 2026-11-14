"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, type SessionUser } from "./api";
import { AlbumScreen } from "./album-screen";
import { HomeScreen } from "./home-screen";
import { JoinScreen } from "./join-screen";
import { pathOf, routeOf, SiteContext, type Route } from "./site";
import { Spinner } from "./ui";

/**
 * album.money2time.com: one page that reads where it is from the address.
 *
 *   /join/<code>   an invite: sign in, join, then the web or the app
 *   /a/<share>     an album (`?tab=breakdown|balances`)
 *   /              the visitor's shared albums, or sign-in
 *
 * Moving between them is `history.pushState`, so Back works as on any site,
 * and the session (an HttpOnly cookie) is asked for once.
 */

export function AlbumApp() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const read = () => setRoute(routeOf(window.location.pathname, window.location.search));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    let live = true;
    api
      .session()
      .then((value) => live && setUser(value))
      .catch(() => live && setUser(null));
    return () => {
      live = false;
    };
  }, []);

  const go = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const path = pathOf(next);
    if (options.replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setRoute(next);
    if (!options.replace) window.scrollTo({ top: 0 });
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut().catch(() => undefined);
    setUser(null);
  }, []);

  const site = useMemo(() => (route ? { user, setUser, signOut, route, go } : null), [go, route, signOut, user]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {site && user !== undefined ? (
        <SiteContext.Provider value={site}>
          <Screen route={site.route} />
        </SiteContext.Provider>
      ) : (
        <Loading />
      )}
    </div>
  );
}

function Screen({ route }: { route: Route }): ReactNode {
  if (route.name === "join") return <JoinScreen key={route.code} code={route.code} />;
  if (route.name === "album") return <AlbumScreen key={route.shareId} shareId={route.shareId} tab={route.tab} />;
  return <HomeScreen />;
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-primary" role="status" aria-live="polite">
      <Spinner size={28} />
    </div>
  );
}

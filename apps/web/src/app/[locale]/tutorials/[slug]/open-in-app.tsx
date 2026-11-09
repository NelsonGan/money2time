"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { EVENTS, trackLeaving } from "@/lib/analytics";
import { tutorialDeepLink } from "@/lib/tutorials";

/** How long to give the app before assuming nothing handled the scheme. */
const FALLBACK_DELAY_MS = 2500;

/**
 * Tries the app's custom scheme, then falls back to the download redirect.
 *
 * There is no reliable way to ask a browser whether a scheme is registered, so
 * the fallback is a timer. Two things cancel it: the page being hidden (the app
 * came to the front) and `pagehide` (the browser is leaving). It also re-checks
 * visibility when it fires, because iOS puts up an "Open in Money2Time?" prompt
 * that leaves the page visible while the user reads it, and sending them to the
 * store *and* opening the app is worse than waiting a beat longer.
 *
 * If nothing handles the scheme the page never hides, the timer fires, and the
 * user lands on the store (or, on desktop, the home page, which is where
 * /download sends anything that is not a phone).
 */
export function OpenInApp({ id }: { id: string }) {
  const t = useTranslations("tutorials");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  // A click followed by a client-side navigation would otherwise leave the
  // timer armed and yank the next page over to /download.
  useEffect(() => () => cleanup.current?.(), []);

  const open = useCallback(() => {
    cleanup.current?.();

    const cancel = () => {
      if (document.visibilityState === "hidden") cleanup.current?.();
    };
    const leave = () => cleanup.current?.();

    cleanup.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      document.removeEventListener("visibilitychange", cancel);
      window.removeEventListener("pagehide", leave);
      cleanup.current = null;
    };

    document.addEventListener("visibilitychange", cancel);
    window.addEventListener("pagehide", leave);

    timer.current = setTimeout(() => {
      cleanup.current?.();
      if (document.visibilityState === "hidden") return;
      trackLeaving(EVENTS.tutorialAppFallback, { tutorial: id });
      window.location.href = "/download";
    }, FALLBACK_DELAY_MS);

    trackLeaving(EVENTS.tutorialOpenInApp, { tutorial: id });
    window.location.href = tutorialDeepLink(id);
  }, [id]);

  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-bold text-card transition hover:bg-primary-dark"
    >
      {t("openInApp")}
    </button>
  );
}

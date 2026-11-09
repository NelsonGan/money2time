"use client";

import Script from "next/script";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { isLocale } from "@/i18n/routing";
import {
  EVENTS,
  googleAnalyticsScript,
  pageTypeOf,
  registerLocale,
  startAnalytics,
  track,
} from "@/lib/analytics";

function AnalyticsTracker() {
  const locale = useLocale();
  const pathname = usePathname();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStarted(startAnalytics()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (started && isLocale(locale)) registerLocale(locale);
  }, [locale, started]);

  useEffect(() => {
    if (!started) return;

    const timer = window.setTimeout(() => {
      track(EVENTS.viewPage, {
        pageType: pageTypeOf(pathname, window.location.hostname),
        path: pathname,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname, started]);

  const script = started ? googleAnalyticsScript() : null;
  return script ? (
    <Script
      id="money2time-google-analytics"
      src={script}
      strategy="afterInteractive"
    />
  ) : null;
}

export function Analytics() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTracker />
    </Suspense>
  );
}

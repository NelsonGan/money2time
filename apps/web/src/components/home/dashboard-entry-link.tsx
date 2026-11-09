"use client";

import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { EVENTS, trackLeaving } from "@/lib/analytics";
import { appUrl } from "@/lib/platform";

export function DashboardEntryLink({
  placement,
  className,
  children,
}: {
  placement: "home_section";
  className?: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    // Another host, so a full navigation and a beacon for the click.
    <a href={appUrl(locale)} onClick={() => trackLeaving(EVENTS.dashboardEntryClicked, { placement })} className={className}>
      {children}
    </a>
  );
}

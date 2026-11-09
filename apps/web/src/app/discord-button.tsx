"use client";

import type { ReactNode } from "react";

import { EVENTS, trackLeaving } from "@/lib/analytics";
import { DISCORD_URL } from "@/lib/app-links";

export function DiscordButton({
  location,
  className,
  children,
}: {
  location: "contact_page" | "footer";
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={DISCORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackLeaving(EVENTS.discordLinkClicked, { placement: location })
      }
      className={className}
    >
      <svg
        className="w-5 h-5 sm:w-[22px] sm:h-[22px]"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M20.32 4.37a19.8 19.8 0 00-4.89-1.52.07.07 0 00-.08.04c-.21.38-.45.86-.61 1.25a18.27 18.27 0 00-5.48 0 12.6 12.6 0 00-.62-1.25.08.08 0 00-.08-.04 19.74 19.74 0 00-4.89 1.52.07.07 0 00-.03.03C1.16 8.7.35 12.9.74 17.05a.08.08 0 00.03.06 19.9 19.9 0 005.99 3.03.08.08 0 00.09-.03c.46-.63.87-1.3 1.23-2a.08.08 0 00-.04-.11 13.1 13.1 0 01-1.87-.89.08.08 0 01-.01-.13c.13-.09.25-.19.37-.28a.08.08 0 01.08-.01c3.93 1.79 8.18 1.79 12.06 0a.08.08 0 01.08.01c.12.1.24.19.37.28a.08.08 0 010 .13 12.3 12.3 0 01-1.87.89.08.08 0 00-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 00.09.03 19.84 19.84 0 006-3.03.08.08 0 00.03-.06c.47-4.8-.79-8.97-3.32-12.65a.06.06 0 00-.03-.03zM8.02 14.57c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.98 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
      </svg>
      {children}
    </a>
  );
}

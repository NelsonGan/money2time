"use client";

import { useTranslations } from "next-intl";

import { DiscordButton } from "@/app/discord-button";
import { AppleIcon, PlayIcon } from "@/components/icons";
import { EVENTS, trackLeaving, type DownloadPlacement } from "@/lib/analytics";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";

/** `on-primary` swaps the fill so the buttons read on the rosewood band. */
type Variant = "default" | "on-primary";

const fills: Record<Variant, string> = {
  default: "bg-foreground text-surface hover:bg-foreground/90",
  "on-primary": "bg-card text-foreground hover:bg-card/90",
};

function AppleGlyph() {
  return (
    <svg
      className="w-5 h-5 sm:w-[22px] sm:h-[22px]"
      viewBox="0 0 22 26"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.52 12.76c-.03-3.12 2.55-4.62 2.67-4.7-1.45-2.12-3.72-2.41-4.53-2.45-1.93-.2-3.76 1.14-4.74 1.14-.98 0-2.49-1.11-4.1-1.08-2.11.03-4.05 1.23-5.14 3.12-2.19 3.8-.56 9.43 1.57 12.52 1.04 1.5 2.29 3.2 3.92 3.14 1.57-.06 2.17-1.02 4.07-1.02 1.9 0 2.44 1.02 4.1.99 1.69-.03 2.77-1.53 3.8-3.04 1.2-1.74 1.69-3.43 1.72-3.51-.04-.02-3.3-1.27-3.34-5.01zM13.47 3.53C14.33 2.47 14.93.99 14.77 0c-1.24.05-2.75.82-3.64 1.87-.8.93-1.5 2.41-1.31 3.83 1.38.11 2.79-.7 3.65-2.17z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg
      className="w-5 h-5 sm:w-[22px] sm:h-[22px]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M1.292 2.751A2.106 2.106 0 001 3.813v16.374c0 .394.106.762.292 1.062l.058.063L9.9 12.756v-.138L1.35 4.063l-.058-.062z"
        fill="#4285F4"
      />
      <path
        d="M13.003 15.86l-3.1-3.1v-.138l3.1-3.1.07.04 3.672 2.086c1.049.596 1.049 1.572 0 2.168L13.073 15.8l-.07.06z"
        fill="#FBBC04"
      />
      <path
        d="M13.073 15.8L9.9 12.627 1.292 21.25c.346.365.916.41 1.56.045l10.221-5.494z"
        fill="#EA4335"
      />
      <path
        d="M13.073 9.455L2.852 3.958c-.644-.362-1.214-.32-1.56.048L9.9 12.627l3.173-3.172z"
        fill="#34A853"
      />
    </svg>
  );
}

export function StoreButtons({
  location,
  variant = "default",
  className = "",
}: {
  location: Extract<DownloadPlacement, "home_hero">;
  variant?: Variant;
  className?: string;
}) {
  const t = useTranslations("storeButtons");
  const button = `inline-flex items-center gap-2.5 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${fills[variant]}`;

  return (
    <div className={`flex flex-row flex-wrap gap-3 ${className}`}>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackLeaving(EVENTS.appDownloadClicked, {
            placement: location,
            target: "app_store",
          })
        }
        className={button}
      >
        <AppleGlyph />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[9px] sm:text-[10px] font-normal -mb-0.5">
            {t("appStorePrefix")}
          </span>
          <span className="text-sm sm:text-lg">{t("appStore")}</span>
        </span>
      </a>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackLeaving(EVENTS.appDownloadClicked, {
            placement: location,
            target: "google_play",
          })
        }
        className={button}
      >
        <PlayGlyph />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[9px] sm:text-[10px] font-normal -mb-0.5">
            {t("playStorePrefix")}
          </span>
          <span className="text-sm sm:text-lg">{t("playStore")}</span>
        </span>
      </a>
    </div>
  );
}

/** Compact store links used in the footer. */
export function StoreLinks({
  location,
}: {
  location: Extract<DownloadPlacement, "footer">;
}) {
  const t = useTranslations("storeButtons");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DiscordButton
        location={location}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-[#5865F2] px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[#4752C4]"
      >
        Discord
      </DiscordButton>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackLeaving(EVENTS.appDownloadClicked, {
            placement: location,
            target: "app_store",
          })
        }
        className="card-surface inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors hover:border-primary-muted"
      >
        <AppleIcon className="h-[14px] w-[14px]" />
        {t("appStore")}
      </a>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackLeaving(EVENTS.appDownloadClicked, {
            placement: location,
            target: "google_play",
          })
        }
        className="card-surface inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors hover:border-primary-muted"
      >
        <PlayIcon className="h-[14px] w-[14px]" />
        {t("playStore")}
      </a>
    </div>
  );
}

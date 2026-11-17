"use client";

/* eslint-disable @next/next/no-img-element -- the app icon, drawn at its size */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AppleIcon, PlayIcon } from "@/components/icons";
import { EVENTS, track, trackLeaving, type DownloadPlacement } from "@/lib/analytics";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";
import { media } from "@/lib/media";
import { downloadTargetFromUserAgent, type DownloadTarget } from "@/lib/platform";

import { Icon } from "./ui";

/** The invite opened in the app (`?kind=album`: the app's Join screen reads as an album from its first frame). */
export function appInviteLink(code: string, kind: "album" | "ledger" = "album"): string {
  return `money2time://join/${encodeURIComponent(code)}${kind === "album" ? "?kind=album" : ""}`;
}

/** The stores worth showing on this device: its own, or both on a computer. */
function useStores(): DownloadTarget[] {
  const [target, setTarget] = useState<DownloadTarget>("none");
  useEffect(() => {
    // After mount, so the server's page and the first render agree.
    const timer = window.setTimeout(() => setTarget(downloadTargetFromUserAgent(navigator.userAgent)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return target === "none" ? ["app_store", "google_play"] : [target];
}

function StoreButton({ target, placement }: { target: Exclude<DownloadTarget, "none">; placement: DownloadPlacement }) {
  const t = useTranslations("storeButtons");
  const apple = target === "app_store";
  return (
    <a
      href={apple ? APP_STORE_URL : PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLeaving(EVENTS.appDownloadClicked, { placement, target })}
      className="inline-flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[16px] bg-foreground px-4 py-2.5 text-card transition-transform active:scale-[0.98]"
    >
      {apple ? <AppleIcon className="h-[22px] w-[22px] shrink-0" /> : <PlayIcon className="h-[22px] w-[22px] shrink-0" />}
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] font-medium">{t(apple ? "appStorePrefix" : "playStorePrefix")}</span>
        <span className="whitespace-nowrap text-[16px] font-bold">{t(apple ? "appStore" : "playStore")}</span>
      </span>
    </a>
  );
}

/**
 * Why and how to move to the app: the same account brings every shared album
 * along, and what was added here stays (with no account, to be chosen there).
 */
export function GetTheApp({ code, placement }: { code?: string; placement: Extract<DownloadPlacement, "album_home" | "album_joined" | "album_sheet"> }) {
  const t = useTranslations("album");
  const stores = useStores();
  return (
    // Its own width decides the layout (a page's foot, or a sheet): the stores beside the text when there is room.
    <section className="@container mt-5 rounded-[24px] border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col @2xl:flex-row @2xl:items-center @2xl:gap-8">
        <div className="flex items-center gap-3.5 @2xl:min-w-0 @2xl:flex-1">
          <img src={media("/icon.png")} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-[28%] shadow-sm" />
          <div className="min-w-0">
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em]">{t("app.title")}</h2>
            <p className="mt-0.5 text-[13.5px] leading-snug text-foreground-soft">{t("app.body")}</p>
          </div>
        </div>
        <div className={`mt-4 flex gap-2.5 @2xl:mt-0 @2xl:shrink-0 ${stores.length > 1 ? "@2xl:w-[380px]" : "@2xl:w-[190px]"}`}>
          {stores.map((target) => (
            <StoreButton key={target} target={target as Exclude<DownloadTarget, "none">} placement={placement} />
          ))}
        </div>
      </div>
      {code ? (
        <a href={appInviteLink(code)} onClick={() => track(EVENTS.albumOpenInApp, { placement: "joined" })} className="mt-3 flex items-center justify-center gap-1 text-[13.5px] font-bold text-primary hover:underline">
          {t("join.openInApp")}
          <Icon name="chevron" size={16} />
        </a>
      ) : null}
    </section>
  );
}

const BANNER_KEY = "m2t.album.appBanner";
/** A banner put away comes back after a week: the app is still the better place. */
const BANNER_QUIET_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The slim banner at the top of an album, as sites with an app show one:
 * the app is the easier place for this, and moving keeps everything. It can
 * be put away for a week.
 */
export function AppBanner({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("album");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const at = Number(window.localStorage.getItem(BANNER_KEY) ?? "0");
        setShown(!(at > 0 && Date.now() - at < BANNER_QUIET_MS));
      } catch {
        setShown(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!shown) return null;
  const dismiss = () => {
    setShown(false);
    try {
      window.localStorage.setItem(BANNER_KEY, String(Date.now()));
    } catch {
      // Storage unavailable: it shows again next time.
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-border bg-card py-2.5 pl-3 pr-2 shadow-[var(--shadow-soft)]">
      <img src={media("/icon.png")} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[28%]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold leading-tight">{t("banner.title")}</p>
        <p className="truncate text-[12.5px] text-foreground-soft">{t("banner.body")}</p>
      </div>
      <button type="button" onClick={onOpen} className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-card hover:bg-primary-dark">
        {t("banner.get")}
      </button>
      <button type="button" onClick={dismiss} aria-label={t("banner.dismiss")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:text-foreground">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

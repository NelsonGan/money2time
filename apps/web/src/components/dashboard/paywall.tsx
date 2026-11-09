"use client";

/* eslint-disable @next/next/no-img-element -- static mascot art */

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { EVENTS, track, type DashboardProFeature } from "@/lib/analytics";

import { Sheet } from "./edit/kit";
import { useDashboard, useTransfer } from "./state";
import { ClayImg } from "./ui";
import { media } from "@/lib/media";

/*
 * The one Pro paywall on the dashboard. Whatever needs Pro (a longer period,
 * another account past the free limit, a refusal from the phone) opens the
 * same sheet: Pro is bought in the app, and the phone says it has Pro each time
 * it sends its data, so a refresh from the phone is all the web has to do.
 */

const PaywallContext = createContext<(feature: DashboardProFeature) => void>(() => undefined);

/** Opens the Pro paywall, naming what asked for it (for analytics only). */
export function usePaywall() {
  return useContext(PaywallContext);
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback((feature: DashboardProFeature) => {
    track(EVENTS.dashboardProPromptViewed, { feature });
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <PaywallContext.Provider value={show}>
      {children}
      {open ? <Paywall onClose={close} /> : null}
    </PaywallContext.Provider>
  );
}

function Paywall({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dashboard.pro");
  const { link } = useDashboard();
  const receiving = useTransfer().loading !== null;
  useEffect(() => {
    if (link.pro) onClose();
  }, [link.pro, onClose]);
  return (
    <Sheet title={t("title")} onClose={onClose}>
      <div className="flex flex-col items-center pb-1 text-center">
        <img src={media("/mascots/presenting.png")} alt="" width={104} height={104} className="h-[104px] w-[104px] object-contain" />
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-extrabold text-[#8A5A0B]">
          <ClayImg name="settings/pro" size={18} />
          {t("badge")}
        </p>
        <p className="mt-3 text-[14.5px] leading-relaxed text-foreground-soft">{t("body")}</p>
        <ol className="mt-4 w-full space-y-2 rounded-2xl bg-background-subtle px-4 py-3 text-left text-[13.5px] text-foreground">
          <li className="flex gap-2.5">
            <span className="tabular font-extrabold text-primary">1</span>
            {t("stepApp")}
          </li>
          <li className="flex gap-2.5">
            <span className="tabular font-extrabold text-primary">2</span>
            {t("stepRefresh")}
          </li>
        </ol>
        <button
          type="button"
          onClick={link.refresh}
          disabled={receiving}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[14.5px] font-extrabold text-card hover:bg-primary-dark disabled:opacity-60"
        >
          <ClayImg name="ui/refresh" size={20} />
          {receiving ? t("checking") : t("checkAgain")}
        </button>
        <button type="button" onClick={onClose} className="mt-2 h-10 rounded-full px-4 text-[13.5px] font-bold text-foreground-soft hover:bg-background-subtle">
          {t("notNow")}
        </button>
      </div>
    </Sheet>
  );
}

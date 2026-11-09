import { useTranslations } from "next-intl";

import { ClayIcon } from "@/components/clay-icon";
import { DashboardEntryLink } from "@/components/home/dashboard-entry-link";
import { Section } from "@/components/home/section";
import { Mascot } from "@/components/mascot";
import type { ClayIconName } from "@/lib/icons.generated";

const POINTS: { key: "private" | "edits" | "charts"; icon: ClayIconName }[] = [
  { key: "private", icon: "status/shield-check" },
  { key: "edits", icon: "ui/pencil" },
  { key: "charts", icon: "insights/growth-analysis" },
];

/**
 * The way in to app.money2time.com from the landing page: what the Web
 * Dashboard is, that entries can be added and edited there while the phone
 * is connected, and one big button.
 */
export function DashboardEntry() {
  const t = useTranslations("home.dashboardEntry");

  return (
    <Section className="!py-10 sm:!py-14">
      <div
        data-reveal
        className="card-surface relative overflow-hidden rounded-[32px] bg-gradient-to-br from-card via-card to-primary-soft/60 px-6 py-9 sm:px-10 sm:py-11"
      >
        <div className="flex flex-wrap items-center gap-x-12 gap-y-8">
          <div className="min-w-0 flex-1 basis-[440px]">
            <p className="eyebrow">{t("eyebrow")}</p>
            <h2 className="headline mt-3 text-[clamp(28px,3.4vw,42px)]">{t("title")}</h2>
            <p className="mt-4 max-w-[600px] text-[clamp(15px,1.25vw,17px)] leading-relaxed text-foreground-soft text-pretty">
              {t("body")}
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
              {POINTS.map((point) => (
                <li key={point.key} className="flex items-center gap-2 text-[14px] font-semibold text-foreground-soft">
                  <ClayIcon name={point.icon} size={24} />
                  {t(`points.${point.key}`)}
                </li>
              ))}
            </ul>
            <DashboardEntryLink
              placement="home_section"
              className="mt-8 inline-flex h-14 items-center gap-3 rounded-full bg-primary px-8 text-[17px] font-extrabold text-card shadow-[var(--shadow-glow)] transition hover:bg-primary-dark"
            >
              <ClayIcon name="insights/market-analysis" size={28} />
              {t("cta")}
              <span aria-hidden="true">→</span>
            </DashboardEntryLink>
          </div>

          <div aria-hidden="true" className="relative mx-auto flex shrink-0 basis-[300px] items-center justify-center">
            <div className="absolute -left-2 top-4 rotate-[-6deg] rounded-2xl border border-border bg-card px-3 py-2 shadow-[var(--shadow-soft-lg)]">
              <div className="flex h-12 items-end gap-1.5">
                {[40, 64, 48, 80, 56, 92].map((h, i) => (
                  <span key={i} className={`w-2.5 rounded-t ${i % 2 ? "bg-primary" : "bg-success"}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="absolute -right-1 bottom-6 rotate-[5deg] rounded-2xl border border-border bg-card p-2.5 shadow-[var(--shadow-soft-lg)]">
              <span className="block h-12 w-12 rounded-full border-[9px] border-primary border-r-accent border-b-success" />
            </div>
            <Mascot pose="laptop" size={220} className="relative" />
          </div>
        </div>
      </div>
    </Section>
  );
}

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { CategoryIcon, ClayIcon } from "@/components/clay-icon";
import { Section, SectionHeading } from "@/components/home/section";
import { Icon } from "@/components/icons";
import type { CategoryIconName, ClayIconName } from "@/lib/icons.generated";
import { useMoney, type SceneKey } from "@/lib/money";

export function FeatureGrid() {
  const t = useTranslations("home.features");
  const money = useMoney();

  return (
    <Section id="features" tone="band">
      <div data-reveal>
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          index={0}
          icon="insights/mood-faces"
          title={t("sentiment.title")}
          body={t("sentiment.body")}
        >
          <div className="flex h-2.5 gap-1 overflow-hidden rounded-full">
            <span className="w-[63%] rounded-full bg-success" />
            <span className="w-[31%] rounded-full bg-foreground-muted/40" />
            <span className="w-[6%] rounded-full bg-error" />
          </div>
          <div className="mt-3.5 flex items-center gap-2.5">
            <ClayIcon name="sentiment/happy" size={22} />
            <span className="flex-1 text-[13px] font-medium text-foreground-soft">
              {t("sentiment.legend")}
            </span>
            <span className="tabular text-[15px] font-bold">63%</span>
          </div>
        </Card>

        <Card
          index={1}
          icon="settings/recurring"
          title={t("commitments.title")}
          body={t("commitments.body")}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="tabular font-display text-[22px] font-extrabold tracking-[-0.03em]">
              {money.sceneAmount("monthlyCommitments")}
            </span>
            <span className="text-[11px] font-bold text-foreground-muted">
              {t("commitments.lockedIn")}
            </span>
          </div>
          <div className="mt-3.5 flex h-10 items-end gap-1.5">
            {[30, 9, 15, 7, 12, 19, 36, 10].map((height, index) => (
              <span
                key={index}
                style={{ height }}
                className={`flex-1 rounded-t-[4px] ${
                  index === 6 ? "bg-primary" : "bg-primary/25"
                }`}
              />
            ))}
          </div>
        </Card>

        <Card
          index={2}
          icon="money-time/wallet-in"
          title={t("reimbursements.title")}
          body={t("reimbursements.body")}
        >
          <div className="flex flex-col gap-3">
            {(
              [
                ["employer", "work-bag", "reimbursedEmployer"],
                ["insurer", "medicine", "reimbursedInsurer"],
              ] as const satisfies readonly (readonly [
                string,
                CategoryIconName,
                SceneKey,
              ])[]
            ).map(([key, icon, scene]) => (
              <div key={key} className="flex items-center gap-2.5">
                <CategoryIcon name={icon} size={22} />
                <span className="flex-1 truncate text-[13px] font-semibold">
                  {t(`reimbursements.${key}`)}
                </span>
                <span className="tabular text-[13px] font-bold text-success">
                  {money.sceneAmount(scene)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          index={3}
          icon="insights/pie-chart"
          title={t("insights.title")}
          body={t("insights.body")}
        >
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["savingsRate", "insights/piggy-bank-coins"],
                ["incomeTrend", "insights/growth-analysis"],
                ["assets", "insights/home-savings"],
              ] as const
            ).map(([key, icon]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 shadow-soft"
              >
                <ClayIcon name={icon} size={18} />
                <span className="text-xs font-semibold text-foreground-soft">
                  {t(`insights.${key}`)}
                </span>
              </span>
            ))}
          </div>
        </Card>

        <Card
          index={4}
          icon="money-time/split-bill"
          title={t("split.title")}
          body={t("split.body")}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                {t("split.yourShare")}
              </div>
              <div className="tabular mt-1 font-display text-[22px] font-extrabold tracking-[-0.03em]">
                {money.sceneAmount("transaction")}
              </div>
            </div>
            <div className="flex">
              {(
                [
                  ["N", "bg-primary"],
                  ["P", "bg-sky"],
                  ["J", "bg-accent"],
                ] as const
              ).map(([initial, background], index) => (
                <span
                  key={initial}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-card text-[11px] font-bold text-card ${background} ${
                    index > 0 ? "-ml-2.5" : ""
                  }`}
                >
                  {initial}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card
          index={5}
          icon="money-time/coins-stack"
          title={t("modes.title")}
          body={t("modes.body")}
        >
          <div className="flex gap-2">
            <div className="flex-1 rounded-[14px] bg-primary p-3">
              <div className="text-[13px] font-bold text-card">
                {t("modes.simple")}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-card/75">
                {t("modes.simpleNote")}
              </div>
            </div>
            <div className="flex-1 rounded-[14px] bg-card p-3 shadow-soft">
              <div className="text-[13px] font-bold">{t("modes.full")}</div>
              <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">
                {t("modes.fullNote")}
              </div>
            </div>
          </div>
        </Card>

        <Card
          index={6}
          icon="settings/budget"
          title={t("budgets.title")}
          body={t("budgets.body")}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">{t("budgets.category")}</span>
            <span className="tabular text-[13px] font-bold">
              {money.sceneAmount("budgetSpent")}{" "}
              <span className="font-medium text-foreground-muted">
                {t("budgets.of", { total: money.sceneAmount("budgetTotal") })}
              </span>
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <span className="block h-full w-[78%] rounded-full bg-success" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-[12px] font-medium text-foreground-soft">
              {t("budgets.pace", { days: "6" })}
            </span>
          </div>
        </Card>

        <Card
          index={7}
          icon="insights/calendar-clock"
          title={t("calendar.title")}
          body={t("calendar.body")}
        >
          <div className="grid grid-cols-7 gap-1.5">
            {[
              "bg-error/35",
              "bg-success/35",
              "bg-error/15",
              "bg-foreground-muted/12",
              "bg-error/25",
              "bg-foreground-muted/12",
              "bg-error/45",
              "bg-foreground-muted/12",
              "bg-error/20",
              "bg-error/30",
              "bg-primary/25 ring-2 ring-primary ring-inset",
              "bg-foreground-muted/10",
              "bg-foreground-muted/10",
              "bg-foreground-muted/10",
            ].map((tone, index) => (
              <span key={index} className={`h-6 rounded-lg ${tone}`} />
            ))}
          </div>
        </Card>

        <Card
          index={8}
          icon="settings/exchange-rates"
          title={t("currency.title")}
          body={t("currency.body")}
        >
          <div className="flex items-center gap-2.5">
            <CategoryIcon name="car" size={24} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">
                {t("currency.item")}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-foreground-muted">
                {t("currency.paidIn", { currency: money.foreign.currency })}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular font-mono text-[13px]">
                {money.foreignAmount()}
              </div>
              <div className="tabular text-[11px] font-bold text-foreground-muted">
                ≈ {money.amount(money.foreign.local)}
              </div>
            </div>
          </div>
        </Card>

        <Card
          index={9}
          icon="settings/albums"
          title={t("receipts.title")}
          body={t("receipts.body")}
        >
          <div className="flex gap-2">
            {(
              ["money-time/receipt", "money-time/invoice", "entry/camera"] as const
            ).map((icon, index) => (
              <div
                key={icon}
                className="relative flex h-[62px] flex-1 items-center justify-center rounded-[14px] bg-card shadow-soft"
              >
                <ClayIcon name={icon} size={26} />
                {index === 2 ? (
                  <span className="tabular absolute bottom-1.5 right-2 text-[10px] font-bold text-foreground-muted">
                    +41
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card
          index={10}
          icon="ui/search"
          title={t("search.title")}
          body={t("search.body")}
        >
          <div className="flex h-9 items-center gap-2 rounded-full bg-card px-3 shadow-soft">
            <ClayIcon name="ui/search" size={15} />
            <span className="text-[13px] font-medium text-foreground-soft">
              {t("search.query")}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex h-7 items-center rounded-full bg-primary px-2.5 text-[11px] font-bold text-card">
              {t("search.filterCategory")}
            </span>
            <span className="inline-flex h-7 items-center rounded-full bg-card px-2.5 text-[11px] font-bold text-foreground-soft shadow-soft">
              {t("search.filterAccount")}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-[11px] font-bold text-foreground-soft shadow-soft">
              <ClayIcon name="sentiment/regret" size={13} />
              {t("search.filterSentiment")}
            </span>
          </div>
        </Card>

        <Card
          index={11}
          icon="insights/home-savings"
          title={t("assets.title")}
          body={t("assets.body")}
        >
          <div className="flex items-baseline gap-2">
            <span className="tabular font-display text-[22px] font-extrabold tracking-[-0.03em]">
              {money.sceneAmount("netWorth")}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-success">
              <Icon name="arrowRight" size={11} strokeWidth={2.6} className="-rotate-45" />
              3.2%
            </span>
          </div>
          <div className="mt-3.5 flex h-11 items-end gap-1.5">
            {[
              [16, "bg-success/25"],
              [21, "bg-success/35"],
              [19, "bg-success/35"],
              [30, "bg-success/55"],
              [36, "bg-success/75"],
              [44, "bg-success"],
            ].map(([height, tone], index) => (
              <span
                key={index}
                style={{ height: height as number }}
                className={`flex-1 rounded-t-[4px] ${tone}`}
              />
            ))}
          </div>
        </Card>
      </div>
    </Section>
  );
}

function Card({
  icon,
  title,
  body,
  index,
  children,
}: {
  icon: ClayIconName;
  title: string;
  body: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <div
      data-reveal
      style={{ "--reveal-delay": `${(index % 3) * 0.08}s` } as React.CSSProperties}
      className="card-surface card-lift flex flex-col rounded-[26px] p-6 sm:p-7"
    >
      <ClayIcon name={icon} size={46} />
      <h3 className="headline mt-5 text-[20px]">{title}</h3>
      <p className="mb-7 mt-2 text-[14px] leading-relaxed text-foreground-soft text-pretty">
        {body}
      </p>
      <div className="well mt-auto p-4">
        {children}
      </div>
    </div>
  );
}

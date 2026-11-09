import { useTranslations } from "next-intl";

import { CategoryIcon, ClayIcon } from "@/components/clay-icon";
import { Section, SectionHeading } from "@/components/home/section";
import { Icon } from "@/components/icons";
import type { CategoryIconName } from "@/lib/icons.generated";
import { useMoney } from "@/lib/money";

export function HowItWorks() {
  const t = useTranslations("home.howItWorks");
  const money = useMoney();

  const rateRows = [
    { key: "takeHome", value: money.amount(money.takeHome) },
    { key: "daysWorked", value: "5" },
    { key: "commute", value: "50" },
  ];

  return (
    <Section id="how-it-works" tone="band">
      <div data-reveal>
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Conversion
          index={0}
          icon="coffee"
          title={t("coffee.title")}
          amount={money.price("coffee")}
          time={money.priceDuration("coffee")}
          note={t("coffee.note")}
        />
        <Conversion
          index={1}
          icon="game-controller"
          title={t("impulse.title")}
          amount={money.price("impulse")}
          time={money.priceDuration("impulse")}
          note={t("impulse.note")}
        />

        <div
          data-reveal
          style={{ "--reveal-delay": "0.16s" } as React.CSSProperties}
          className="flex flex-col rounded-[26px] bg-primary p-7 text-card shadow-soft"
        >
          <div className="flex items-center gap-3">
            <ClayIcon name="money-time/alarm-clock-coin" size={40} />
            <span className="text-[15px] font-bold">{t("rate.title")}</span>
          </div>
          <div className="tabular mt-6 font-display text-[42px] font-extrabold leading-none tracking-[-0.04em]">
            {money.amount(money.perHour)}
            <span className="text-[17px] font-bold text-card/70">
              {t("rate.perHour")}
            </span>
          </div>
          <dl className="mt-6 flex flex-col gap-2.5 border-t border-card/20 pt-5">
            {rateRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <dt className="flex-1 text-[13px] text-card/75">
                  {t(`rate.${row.key}.label`)}
                </dt>
                <dd className="text-[13px] font-bold">
                  {t(`rate.${row.key}.value`, { value: row.value })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}

function Conversion({
  icon,
  title,
  amount,
  time,
  note,
  index,
}: {
  icon: CategoryIconName;
  index: number;
  title: string;
  amount: string;
  time: string;
  note: string;
}) {
  return (
    <div
      data-reveal
      style={{ "--reveal-delay": `${index * 0.08}s` } as React.CSSProperties}
      className="card-surface card-lift flex flex-col rounded-[26px] p-7"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon name={icon} size={40} />
        <span className="text-[15px] font-bold">{title}</span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tabular font-display text-[clamp(30px,3vw,42px)] font-extrabold leading-none tracking-[-0.04em] text-foreground-muted">
          {amount}
        </span>
        <Icon name="arrowRight" size={20} strokeWidth={2.4} className="text-border" />
        <span className="font-display text-[clamp(30px,3vw,42px)] font-extrabold leading-none tracking-[-0.04em] text-primary">
          {time}
        </span>
      </div>
      <p className="mt-auto pt-5 text-[15px] leading-relaxed text-foreground-soft text-pretty">
        {note}
      </p>
    </div>
  );
}

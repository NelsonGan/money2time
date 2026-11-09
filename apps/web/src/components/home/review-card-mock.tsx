import { useTranslations } from "next-intl";

import { CategoryIcon, ClayIcon } from "@/components/clay-icon";
import { Icon } from "@/components/icons";
import type { CategoryIconName } from "@/lib/icons.generated";
import { useMoney, type SceneKey } from "@/lib/money";

const CATEGORIES: {
  key: "groceries" | "eatingOut" | "transport";
  scene: SceneKey;
  icon: CategoryIconName;
  share: number;
  bar: string;
}[] = [
  { key: "groceries", scene: "weekGroceries", icon: "grocery-basket", share: 38, bar: "bg-primary" },
  { key: "eatingOut", scene: "weekEatingOut", icon: "meal", share: 26, bar: "bg-accent" },
  { key: "transport", scene: "weekTransport", icon: "car", share: 20, bar: "bg-sky" },
];

/** The "Review Spending" sheet, rebuilt in markup so every label localises. */
export function ReviewCardMock() {
  const t = useTranslations("home.review");
  const money = useMoney();
  const spentThisWeek = money.scene("weekSpend");

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3 rounded-[30px] border border-border bg-card p-4 shadow-soft-lg sm:p-5">
      <div className="flex items-center gap-3 px-1">
        <ClayIcon name="insights/time-money" size={30} />
        <span className="headline flex-1 text-[19px]">{t("mock.title")}</span>
        <Icon name="chevronDown" size={15} strokeWidth={2.4} className="text-foreground-muted" />
      </div>

      <div className="flex gap-1.5">
        {(["week", "month", "year"] as const).map((period, index) => (
          <span
            key={period}
            className={`inline-flex h-8 items-center rounded-full px-3.5 text-xs font-bold ${
              index === 0
                ? "bg-primary text-card"
                : "bg-card text-foreground-soft shadow-soft"
            }`}
          >
            {t(`mock.${period}`)}
          </span>
        ))}
      </div>

      <div className="rounded-[22px] bg-card p-5 shadow-soft">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
          {t("mock.spent")}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <span className="tabular font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">
            {money.amount(spentThisWeek)}
          </span>
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">
            −12%
          </span>
        </div>
        <div className="mt-1.5 text-xs text-foreground-soft">{t("mock.calmer")}</div>
        <div className="mt-4 flex items-center gap-2.5 rounded-[16px] bg-primary-soft px-3 py-2.5">
          <ClayIcon name="money-time/hourglass" size={20} />
          <span className="text-[13px] font-bold text-primary-dark">
            {t("chip", { hours: money.hoursLabel(spentThisWeek) })}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-4 rounded-[22px] bg-card p-5 shadow-soft">
        {CATEGORIES.map((category) => (
          <li key={category.key} className="flex items-center gap-3">
            <CategoryIcon name={category.icon} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  {t(`mock.categories.${category.key}`)}
                </span>
                <span className="tabular text-sm font-bold">
                  {money.sceneAmount(category.scene)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    style={{ width: `${category.share}%` }}
                    className={`block h-full rounded-full ${category.bar}`}
                  />
                </span>
                <span className="tabular text-[11px] font-bold text-foreground-muted">
                  {category.share}%
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

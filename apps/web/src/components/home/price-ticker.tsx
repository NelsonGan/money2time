import { useTranslations } from "next-intl";

import { CategoryIcon } from "@/components/clay-icon";
import type { CategoryIconName } from "@/lib/icons.generated";
import { useMoney, type PriceKey } from "@/lib/money";

const ENTRIES: { key: PriceKey; icon: CategoryIconName }[] = [
  { key: "coffee", icon: "coffee" },
  { key: "lunch", icon: "ramen" },
  { key: "groceries", icon: "grocery-basket" },
  { key: "fuel", icon: "gas-pump" },
  { key: "tshirt", icon: "t-shirt" },
  { key: "beers", icon: "alcohol" },
  { key: "electricity", icon: "light-bulb" },
  { key: "pizza", icon: "meal" },
  { key: "dogFood", icon: "dog" },
  { key: "cinema", icon: "clapperboard" },
  { key: "gym", icon: "dumbbell" },
  { key: "rent", icon: "house" },
  { key: "flight", icon: "plane" },
  { key: "iceCream", icon: "cupcake" },
];

export function PriceTicker() {
  const t = useTranslations("home.ticker");
  const money = useMoney();

  return (
    <div
      aria-hidden
      className="overflow-hidden border-y border-border bg-card [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]"
    >
      <div className="animate-ticker flex h-[68px] w-max items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {ENTRIES.map((entry) => (
              <div
                key={`${copy}-${entry.key}`}
                className="flex shrink-0 items-center gap-2.5 px-5"
              >
                <CategoryIcon name={entry.icon} size={26} />
                <span className="whitespace-nowrap text-[13px] font-semibold">
                  {t(entry.key)}
                </span>
                <span className="tabular whitespace-nowrap font-mono text-[13px] text-foreground-muted">
                  {money.price(entry.key)}
                </span>
                <span className="whitespace-nowrap rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  {money.priceDuration(entry.key)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

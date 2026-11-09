import { useTranslations } from "next-intl";

import HomeScreenshotCarousel from "@/app/home-screenshot-carousel";
import { StoreButtons } from "@/app/store-buttons";
import { ClayIcon } from "@/components/clay-icon";
import { MascotFlipbook } from "@/components/mascot-flipbook";
import type { Locale } from "@/i18n/routing";
import type { ClayIconName } from "@/lib/icons.generated";

const BADGES: { key: "onDevice" | "noBank" | "quick"; icon: ClayIconName }[] = [
  { key: "onDevice", icon: "settings/app-lock" },
  { key: "noBank", icon: "money-time/bank" },
  { key: "quick", icon: "entry/quick-timer" },
];

export function Hero({ locale }: { locale: Locale }) {
  const t = useTranslations("home.hero");

  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-28 sm:px-8 sm:pt-32 lg:pb-20 lg:pt-36">
      <div className="relative mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-12 gap-y-10">
        <div className="min-w-0 flex-1 basis-[420px]">
          <MascotFlipbook
            sequence="save"
            size={92}
            className="animate-rise mb-4 -ml-2"
          />

          <h1 className="display animate-rise text-[clamp(40px,5.6vw,68px)]">
            {t("title")}
          </h1>

          <p className="animate-rise mt-6 max-w-[520px] text-[clamp(17px,1.4vw,20px)] leading-[1.6] text-foreground-soft text-pretty [animation-delay:0.08s]">
            {t("subtitle")}
          </p>

          <StoreButtons
            location="home_hero"
            className="animate-rise mt-9 [animation-delay:0.16s]"
          />

          <ul className="animate-rise mt-10 flex flex-wrap items-center gap-x-7 gap-y-4 [animation-delay:0.24s]">
            {BADGES.map((badge) => (
              <li
                key={badge.key}
                className="flex items-center gap-2 text-[13px] font-semibold text-foreground-soft"
              >
                <ClayIcon name={badge.icon} size={26} />
                {t(`badges.${badge.key}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-rise min-w-0 flex-1 basis-[380px] [animation-delay:0.3s]">
          <HomeScreenshotCarousel locale={locale} />
        </div>
      </div>
    </section>
  );
}

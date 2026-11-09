import { useTranslations } from "next-intl";

import { ClayIcon } from "@/components/clay-icon";
import { Section } from "@/components/home/section";
import { Icon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import type { ClayIconName } from "@/lib/icons.generated";

const CARDS: { key: "onDevice" | "import"; icon: ClayIconName }[] = [
  { key: "onDevice", icon: "settings/app-lock" },
  { key: "import", icon: "settings/data-management" },
];

export function PrivacySection() {
  const t = useTranslations("home.privacy");

  return (
    <Section id="privacy">
      <div className="flex flex-wrap items-start gap-x-16 gap-y-10">
        <div className="min-w-0 flex-1 basis-[420px]" data-reveal>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 className="headline mt-3 max-w-[480px] text-[clamp(30px,3.6vw,46px)]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-[520px] text-[17px] leading-relaxed text-foreground-soft text-pretty">
            {t("body")}
          </p>
          <Link
            href="/privacy"
            className="mt-7 inline-flex items-center gap-2 py-0.5 text-[15px] font-bold text-primary transition-colors hover:text-primary-dark"
          >
            {t("link")}
            <Icon name="arrowRight" size={17} strokeWidth={2.2} />
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-4">
          {CARDS.map((card, index) => (
            <div
              key={card.key}
              data-reveal
              style={{ "--reveal-delay": `${index * 0.1}s` } as React.CSSProperties}
              className="card-surface card-lift flex gap-4 rounded-[24px] p-6"
            >
              <ClayIcon name={card.icon} size={44} className="mt-0.5" />
              <div className="min-w-0">
                <div className="headline text-[19px]">{t(`${card.key}.title`)}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-soft">
                  {t(`${card.key}.body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

import { useTranslations } from "next-intl";

import { ReviewCardMock } from "@/components/home/review-card-mock";
import { Section } from "@/components/home/section";
import { Icon } from "@/components/icons";

const POINTS = ["one", "two", "three"] as const;

export function ReviewSection() {
  const t = useTranslations("home.review");

  return (
    <Section tone="band">
      <div className="flex flex-wrap items-center gap-x-16 gap-y-12">
        <div data-reveal className="min-w-0 flex-1 basis-[420px] lg:max-w-[520px]">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 className="headline mt-3 text-[clamp(30px,3.6vw,46px)]">
            {t("title")}
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-foreground-soft text-pretty">
            {t("body")}
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Icon name="check" size={13} strokeWidth={2.8} />
                </span>
                <span className="text-[15px] font-medium leading-relaxed">
                  {t(`points.${point}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          data-reveal
          style={{ "--reveal-delay": "0.12s" } as React.CSSProperties}
          className="flex flex-1 basis-[320px] justify-center"
        >
          <ReviewCardMock />
        </div>
      </div>
    </Section>
  );
}

import Image from "next/image";
import { useTranslations } from "next-intl";

import { Section } from "@/components/home/section";
import { Mascot } from "@/components/mascot";
import { resizedMedia } from "@/lib/media";

export function DeveloperSection() {
  const t = useTranslations("home.why");

  return (
    <Section tone="band">
      <div className="flex flex-wrap items-start gap-x-16 gap-y-12">
        <div data-reveal className="flex flex-1 basis-[240px] flex-col items-center gap-7">
          <div className="book-cover w-[min(250px,62vw)]">
            <Image
              src={resizedMedia("/book-cover.jpg", 520)}
              alt={t("bookAlt")}
              width={520}
              height={780}
              loading="lazy"
              className="h-auto w-full"
            />
          </div>
          <blockquote className="max-w-[280px] border-l-[3px] border-primary py-1 pl-4">
            <p className="text-[15px] font-medium leading-relaxed text-pretty">
              &ldquo;{t("quote")}&rdquo;
            </p>
            <footer className="mt-2 text-[13px] font-semibold text-foreground-muted">
              {t("quoteAuthor")}
            </footer>
          </blockquote>
        </div>

        <div
          data-reveal
          style={{ "--reveal-delay": "0.1s" } as React.CSSProperties}
          className="min-w-0 flex-1 basis-[440px]"
        >
          <div className="flex items-center gap-3">
            <Mascot pose="love" size={44} className="animate-wiggle" />
            <p className="eyebrow">{t("eyebrow")}</p>
          </div>
          <h2 className="headline mt-3 text-[clamp(30px,3.6vw,46px)]">{t("title")}</h2>

          <div className="mt-6 flex max-w-[620px] flex-col gap-4 text-[clamp(15px,1.25vw,17px)] leading-[1.7]">
            <p>
              {t.rich("paragraph1", {
                book: (chunks) => (
                  <em className="font-semibold not-italic text-primary">{chunks}</em>
                ),
              })}
            </p>
            <p className="text-foreground-soft">
              {t.rich("paragraph2", {
                cost: (chunks) => <span className="highlight-underline">{chunks}</span>,
                time: (chunks) => <span className="highlight-underline">{chunks}</span>,
              })}
            </p>
            <p className="text-foreground-soft">{t("paragraph3")}</p>
            <p className="font-bold">{t("paragraph4")}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

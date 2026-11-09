import { useFormatter, useTranslations } from "next-intl";

import { LaurelStat } from "@/components/home/laurel-stat";
import {
  SOCIAL_PROOF,
  TESTIMONIALS,
} from "@/components/home/testimonials-data";
import { Section, SectionHeading } from "@/components/home/section";
import { AppleIcon, PlayIcon, StarIcon } from "@/components/icons";

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5 text-accent">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon key={star} filled={star <= rating} width={size} height={size} />
      ))}
    </div>
  );
}

export function Testimonials() {
  const t = useTranslations("home.testimonials");
  const ts = useTranslations("storeButtons");
  const format = useFormatter();

  if (TESTIMONIALS.length === 0) {
    return null;
  }

  return (
    <Section tone="band">
      <div data-reveal>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          aside={
            SOCIAL_PROOF.users || SOCIAL_PROOF.rating ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-5 sm:gap-x-9">
                {SOCIAL_PROOF.users ? (
                  <LaurelStat
                    value={format.number(SOCIAL_PROOF.users, {
                      notation: "compact",
                      maximumFractionDigits: 0,
                    })}
                  >
                    <span className="max-w-[14ch] text-center text-[11px] font-bold uppercase leading-[1.15] tracking-[0.1em] text-foreground-soft sm:text-[12px]">
                      {t("usersChoice")}
                    </span>
                  </LaurelStat>
                ) : null}

                {SOCIAL_PROOF.rating ? (
                  <LaurelStat
                    value={format.number(SOCIAL_PROOF.rating, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })}
                  >
                    <Stars rating={Math.round(SOCIAL_PROOF.rating)} size={13} />
                  </LaurelStat>
                ) : null}
              </div>
            ) : undefined
          }
        />
      </div>

      {/* A column wall, so reviews of very different lengths still tile evenly. */}
      <div className="mt-12 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
        {TESTIMONIALS.map((testimonial, index) => (
          <figure
            key={`${testimonial.author}-${testimonial.date}`}
            data-reveal
            style={{ "--reveal-delay": `${(index % 3) * 0.07}s` } as React.CSSProperties}
            className="card-surface card-lift break-inside-avoid rounded-[24px] p-6"
          >
            <div className="flex items-center gap-2.5">
              <Stars rating={testimonial.rating} />
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-foreground-muted">
                {testimonial.store === "appStore" ? (
                  <AppleIcon className="h-3 w-3" />
                ) : (
                  <PlayIcon className="h-3 w-3" />
                )}
                {ts(testimonial.store)}
              </span>
            </div>

            {testimonial.title ? (
              <p className="mt-3.5 text-[16px] font-bold tracking-[-0.01em]">
                {testimonial.title}
              </p>
            ) : null}

            <blockquote
              className={`text-[14px] leading-relaxed text-foreground-soft text-pretty ${
                testimonial.title ? "mt-1.5" : "mt-3.5"
              }`}
            >
              {testimonial.quote}
            </blockquote>

            <figcaption className="mt-4 flex items-baseline gap-2 border-t border-border/50 pt-3.5">
              <span className="truncate text-[13px] font-bold">
                {testimonial.author}
              </span>
              <time
                dateTime={testimonial.date}
                className="ml-auto shrink-0 text-[12px] text-foreground-muted"
              >
                {format.dateTime(new Date(testimonial.date), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

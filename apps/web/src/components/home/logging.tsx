"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ClayIcon } from "@/components/clay-icon";
import { DeviceFrame } from "@/components/home/device-frame";
import {
  LOGGING_METHODS,
  LOGGING_VIDEOS,
  type LoggingMethod,
} from "@/components/home/logging-videos";
import { Section, SectionHeading } from "@/components/home/section";
import { Icon } from "@/components/icons";
import type { ClayIconName } from "@/lib/icons.generated";

/** The three run as a loop, so the section plays itself through. */
function nextMethod(current: LoggingMethod): LoggingMethod {
  const index = LOGGING_METHODS.indexOf(current);
  return LOGGING_METHODS[(index + 1) % LOGGING_METHODS.length];
}

const ICONS: Record<LoggingMethod, ClayIconName> = {
  receiptScan: "insights/receipt-scan",
  backTap: "entry/press-button",
  applePay: "money-time/card",
};

export function Logging() {
  const t = useTranslations("home.logging");
  const [active, setActive] = useState<LoggingMethod>("receiptScan");
  const video = LOGGING_VIDEOS[active];

  return (
    <Section id="logging">
      <div data-reveal>
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} body={t("body")} />
      </div>

      <div className="mt-12 flex flex-wrap items-start gap-x-16 gap-y-10 lg:items-center">
        <div data-reveal className="flex min-w-0 flex-1 basis-[400px] flex-col gap-3">
          {LOGGING_METHODS.map((method, index) => {
            const selected = method === active;

            return (
              <div
                key={method}
                className={`overflow-hidden rounded-[24px] border transition-all duration-300 ${
                  selected
                    ? "border-border bg-card shadow-soft"
                    : "border-border/60 bg-transparent hover:bg-card"
                }`}
              >
                <button
                  type="button"
                  id={`logging-method-${method}`}
                  aria-expanded={selected}
                  aria-controls={`logging-panel-${method}`}
                  onClick={() => setActive(method)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <ClayIcon name={ICONS[method]} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
                      {String(index + 1).padStart(2, "0")} · {t(`${method}.tab`)}
                    </span>
                    <span className="headline mt-1 block text-[20px]">
                      {t(`${method}.title`)}
                    </span>
                  </span>
                </button>

                <div
                  role="region"
                  id={`logging-panel-${method}`}
                  aria-labelledby={`logging-method-${method}`}
                  hidden={!selected}
                  className="px-5 pb-5 sm:pl-[76px]"
                >
                  <p className="text-[15px] leading-relaxed text-foreground-soft text-pretty">
                    {t(`${method}.body`)}
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {(["one", "two"] as const).map((point) => (
                      <li key={point} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                          <Icon name="check" size={12} strokeWidth={2.8} />
                        </span>
                        <span className="text-sm font-medium leading-relaxed">
                          {t(`${method}.points.${point}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <div
          data-reveal
          style={{ "--reveal-delay": "0.12s" } as React.CSSProperties}
          className="flex flex-1 basis-[280px] justify-center"
        >
          <DeviceFrame
            className="w-[min(288px,68vw)]"
            screenClassName="bg-[#16241F]"
            /* The clips are filmed on a real phone and carry their own status
               bar, so the drawn notch would sit on top of one. */
            notch={!video}
          >
            {video ? (
              <video
                key={video.src}
                src={video.src}
                poster={video.poster}
                aria-label={t(`${active}.title`)}
                autoPlay
                muted
                playsInline
                preload="metadata"
                /* No loop: each clip hands over to the next method instead. */
                onEnded={() => setActive(nextMethod(active))}
                className="h-full w-full object-cover"
              />
            ) : (
              <VideoPlaceholder label={t("videoPlaceholder")} />
            )}
          </DeviceFrame>
        </div>
      </div>
    </Section>
  );
}

function VideoPlaceholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_62%)]">
      {(
        [
          "left-[8%] top-[15%] rounded-tl-lg border-l-2 border-t-2",
          "right-[8%] top-[15%] rounded-tr-lg border-r-2 border-t-2",
          "bottom-[15%] left-[8%] rounded-bl-lg border-b-2 border-l-2",
          "bottom-[15%] right-[8%] rounded-br-lg border-b-2 border-r-2",
        ] as const
      ).map((corner) => (
        <div
          key={corner}
          aria-hidden
          className={`absolute aspect-square w-[9%] border-white/30 ${corner}`}
        />
      ))}
      <ClayIcon name="entry/camera" size={54} className="relative" />
      <p className="relative px-10 text-center text-[13px] font-semibold text-white/70">
        {label}
      </p>
    </div>
  );
}

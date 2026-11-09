"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  SCREENSHOT_HEIGHT,
  SCREENSHOT_WIDTH,
  SCREENSHOTS,
  screenshotLocale,
} from "@/app/home-screenshots";
import type { Locale } from "@/i18n/routing";
import { EVENTS, track } from "@/lib/analytics";
import { responsiveMedia } from "@/lib/media";

export default function HomeScreenshotCarousel({ locale }: { locale: Locale }) {
  const t = useTranslations("screenshotGallery");
  const screenshotSet = screenshotLocale(locale);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotationVersion, setRotationVersion] = useState(0);
  const gestureStartXRef = useRef<number | null>(null);
  const swipeThreshold = 30;

  const advanceSlide = useEffectEvent(() => {
    setActiveIndex((currentIndex) => (currentIndex + 1) % SCREENSHOTS.length);
  });

  const moveToSlide = (nextIndex: number, method: "swipe" | "tap" | "dot") => {
    if (nextIndex === activeIndex) return;
    setActiveIndex(nextIndex);
    setRotationVersion((currentVersion) => currentVersion + 1);
    track(EVENTS.carouselSlideChanged, {
      method,
      screenshot: SCREENSHOTS[nextIndex].key,
      index: nextIndex,
    });
  };

  const showPreviousSlide = (method: "swipe" | "tap") => {
    moveToSlide(
      (activeIndex - 1 + SCREENSHOTS.length) % SCREENSHOTS.length,
      method,
    );
  };

  const showNextSlide = (method: "swipe" | "tap") => {
    moveToSlide((activeIndex + 1) % SCREENSHOTS.length, method);
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      return;
    }

    const intervalId = window.setInterval(() => {
      advanceSlide();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [rotationVersion]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    gestureStartXRef.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureStartXRef.current === null) {
      return;
    }

    const deltaX = event.clientX - gestureStartXRef.current;
    gestureStartXRef.current = null;

    if (Math.abs(deltaX) >= swipeThreshold) {
      if (deltaX < 0) {
        showNextSlide("swipe");
        return;
      }

      showPreviousSlide("swipe");
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const tappedLeftSide = event.clientX - bounds.left < bounds.width / 2;

    if (tappedLeftSide) {
      showPreviousSlide("tap");
      return;
    }

    showNextSlide("tap");
  };

  const handlePointerCancel = () => {
    gestureStartXRef.current = null;
  };

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <div
        className="w-full max-w-[560px] overflow-hidden pt-6 pb-14 cursor-pointer select-none [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
        role="group"
        aria-label={t("ariaLabel")}
      >
        <div
          className="relative mx-auto w-[68%] sm:w-[60%]"
          style={{ aspectRatio: `${SCREENSHOT_WIDTH} / ${SCREENSHOT_HEIGHT}` }}
        >
          {SCREENSHOTS.map((screenshot, index) => {
            const position =
              (index - activeIndex + SCREENSHOTS.length) % SCREENSHOTS.length;
            const isActive = position === 0;
            const isNext = position === 1;
            const isPrevious = position === SCREENSHOTS.length - 1;
            const transform = isActive
              ? "translateX(0) scale(1)"
              : isNext
                ? "translateX(40%) scale(0.84)"
                : isPrevious
                  ? "translateX(-40%) scale(0.84)"
                  : position <= SCREENSHOTS.length / 2
                    ? "translateX(120%) scale(0.8)"
                    : "translateX(-120%) scale(0.8)";

            return (
              <div
                key={screenshot.file}
                className={`absolute inset-0 transition-all duration-500 ${
                  isActive
                    ? "z-20 opacity-100"
                    : isNext || isPrevious
                      ? "z-10 opacity-55"
                      : "z-0 opacity-0"
                }`}
                style={{ transform }}
                aria-hidden={!isActive}
              >
                <div className="relative h-full overflow-hidden rounded-[48px] border border-border/60 shadow-[0_18px_40px_rgba(26,46,42,0.12)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- resized at the edge, see responsiveMedia */}
                  <img
                    {...responsiveMedia(`/screenshots/${screenshotSet}/${screenshot.file}`, 340, 90)}
                    alt={t(`alts.${screenshot.key}`)}
                    width={SCREENSHOT_WIDTH}
                    height={SCREENSHOT_HEIGHT}
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    decoding="async"
                    sizes="340px"
                    className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-[filter] duration-500 ${
                      isActive ? "" : "blur-[2px]"
                    }`}
                    draggable={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center">
        {SCREENSHOTS.map((screenshot, index) => (
          <button
            key={screenshot.file}
            type="button"
            aria-label={t(`alts.${screenshot.key}`)}
            aria-current={index === activeIndex}
            onClick={() => moveToSlide(index, "dot")}
            className="group flex h-6 w-6 items-center justify-center"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? "w-6 bg-primary"
                  : "w-2 bg-border group-hover:bg-foreground-muted"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Wordmark } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { EVENTS, trackLeaving } from "@/lib/analytics";
import { downloadTargetFromUserAgent } from "@/lib/platform";

const SECTIONS = ["howItWorks", "logging", "features"] as const;

const HREFS: Record<(typeof SECTIONS)[number], string> = {
  howItWorks: "#how-it-works",
  logging: "#logging",
  features: "#features",
};

/**
 * `withSectionLinks` is on for the landing page, where the anchors resolve.
 * Sub-pages get the same bar without them.
 */
export function Header({
  withSectionLinks = false,
}: {
  withSectionLinks?: boolean;
}) {
  const t = useTranslations("home.nav");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const trackDownload = (placement: "header_desktop" | "header_mobile") => {
    const target = downloadTargetFromUserAgent(window.navigator.userAgent);
    trackLeaving(EVENTS.appDownloadClicked, {
      placement,
      target,
    });
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-border/60 bg-background/85 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Money2Time" className="shrink-0">
          <Wordmark className="text-[18px] sm:text-[21px]" />
        </Link>

        {withSectionLinks ? (
          <nav className="hidden flex-1 items-center gap-7 pl-4 lg:flex">
            {SECTIONS.map((section) => (
              <a
                key={section}
                href={HREFS[section]}
                className="text-[15px] font-semibold text-foreground-soft transition-colors hover:text-foreground"
              >
                {t(section)}
              </a>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {withSectionLinks ? (
            // A Route Handler that redirects off-site by user agent, so it has
            // to be a real navigation rather than a client-side transition.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/download"
              onClick={() => trackDownload("header_desktop")}
              className="hidden h-11 items-center rounded-full bg-primary px-5 text-[15px] font-bold text-card transition hover:bg-primary-dark sm:inline-flex"
            >
              {t("download")}
            </a>
          ) : null}
          {withSectionLinks ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? t("closeMenu") : t("openMenu")}
              className="card-surface inline-flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                width={20}
                height={20}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                {open ? (
                  <path d="m6 6 12 12M18 6 6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {withSectionLinks && open ? (
        <nav className="border-t border-border/60 bg-background/95 px-5 pb-5 pt-2 backdrop-blur-xl lg:hidden">
          {SECTIONS.map((section) => (
            <a
              key={section}
              href={HREFS[section]}
              onClick={() => setOpen(false)}
              className="block border-b border-border/40 py-3.5 text-[17px] font-bold text-foreground last:border-0"
            >
              {t(section)}
            </a>
          ))}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/download"
            onClick={() => {
              trackDownload("header_mobile");
              setOpen(false);
            }}
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-bold text-card sm:hidden"
          >
            {t("download")}
          </a>
        </nav>
      ) : null}
    </header>
  );
}

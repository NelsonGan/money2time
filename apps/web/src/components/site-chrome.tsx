import { getLocale, getTranslations } from "next-intl/server";

import { StoreLinks } from "@/app/store-buttons";
import { Wordmark } from "@/components/brand";
import { Link } from "@/i18n/navigation";
import { appUrl } from "@/lib/platform";

export { Header } from "./site-header";

export async function Footer({ includeTerms = true }: { includeTerms?: boolean }) {
  const t = await getTranslations("common.footer");
  const locale = await getLocale();

  const links = [
    { href: "/tutorials", label: t("tutorials") },
    { href: appUrl(locale), label: t("dashboard") },
    { href: "/cost-in-hours", label: t("costInHours") },
    { href: "/contact", label: t("contact") },
    { href: "/privacy", label: t("privacy") },
    { href: "/data-deletion", label: t("dataDeletion") },
    ...(includeTerms ? [{ href: "/terms", label: t("terms") }] : []),
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          <Link href="/" aria-label="Money2Time">
            <Wordmark className="text-[19px]" />
          </Link>

          <nav className="flex basis-full flex-wrap items-center gap-x-7 gap-y-3 sm:flex-1 sm:basis-auto">
            {links.map((link) =>
              // The dashboard is on its own host: a plain link, not a localised one.
              link.href.startsWith("https://") ? (
                <a
                  key={link.href}
                  href={link.href}
                  className="py-0.5 text-sm font-semibold text-foreground-soft transition-colors hover:text-primary"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="py-0.5 text-sm font-semibold text-foreground-soft transition-colors hover:text-primary"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          <StoreLinks location="footer" />
        </div>

        <p className="mt-8 border-t border-border/50 pt-6 text-sm text-foreground-muted">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}

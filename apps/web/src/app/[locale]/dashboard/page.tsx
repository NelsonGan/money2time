import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardApp } from "@/components/dashboard/dashboard-app";
import { isLocale } from "@/i18n/routing";
import { APP_ORIGIN } from "@/lib/platform";
import { pageOpenGraph, pageTwitter, SITE_METADATA_BASE } from "@/lib/seo";

/**
 * Served at app.money2time.com, which `src/proxy.ts` rewrites to this route;
 * /dashboard on the marketing host redirects there.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.dashboard" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: { canonical: APP_ORIGIN },
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: { ...pageOpenGraph({ description, locale, path: "", title }), url: APP_ORIGIN },
    // A dashboard that is empty until a phone links it has nothing for a
    // search result to show, so it stays out of the index (and the sitemap)
    // while still passing links on.
    robots: { index: false, follow: true },
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DashboardApp />;
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Footer, Header } from "@/components/site-chrome";
import { isLocale, type Locale } from "@/i18n/routing";
import {
  breadcrumbLd,
  jsonLd,
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
} from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/statements-import">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.statementsImport" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates("/statements-import", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      locale,
      path: "/statements-import",
      title,
    }),
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function StatementsImport({
  params,
}: PageProps<"/[locale]/statements-import">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("statementsImport");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbLd({
              locale: locale as Locale,
              name: t("title"),
              path: "/statements-import",
            }),
          ),
        }}
      />
      <Header />

      <main className="pt-32 pb-24 max-w-3xl mx-auto px-6">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
          {t("title")}
        </h1>
        <p className="text-foreground-muted text-[15px] mb-10">
          {t("intro")}
        </p>

        <div className="mx-auto w-full max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden border border-border/60 bg-black">
          <iframe
            src="https://www.youtube.com/embed/3XC6Zjwl7eM"
            title={t("videoTitle")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      </main>

      <Footer />
    </>
  );
}

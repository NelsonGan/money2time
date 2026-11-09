import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Footer, Header } from "@/components/site-chrome";
import { isLocale, type Locale, routing } from "@/i18n/routing";
import {
  breadcrumbLd,
  jsonLd,
  localizedUrl,
  pageAlternates,
  pageImage,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
} from "@/lib/seo";
import { TUTORIALS } from "@/lib/tutorials";

import { TutorialBrowser } from "./tutorial-browser";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/tutorials">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.tutorials" });
  const title = t("title");
  const description = t("description");
  const image = pageImage("/tutorials", locale, title);

  return {
    alternates: pageAlternates("/tutorials", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      image,
      locale,
      path: "/tutorials",
      title,
    }),
    title,
    twitter: pageTwitter({ description, image, locale, title }),
  };
}

export default async function Tutorials({ params }: PageProps<"/[locale]/tutorials">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tutorials");

  // An ItemList tells a crawler these are one collection rather than a set of
  // unrelated pages, which is what earns the sitelinks under a "how do I ..."
  // query.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("title"),
    itemListElement: TUTORIALS.map((tutorial, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: tutorial.title,
      url: localizedUrl(`/tutorials/${tutorial.id}`, locale as Locale),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd([
            breadcrumbLd({ locale: locale as Locale, name: t("title"), path: "/tutorials" }),
            itemListLd,
          ]),
        }}
      />
      <Header />

      <main className="mx-auto w-full max-w-[900px] px-5 pt-32 pb-24 sm:px-8">
        <p className="eyebrow mb-3">{t("eyebrow")}</p>
        <h1 className="headline text-4xl sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-foreground-soft">
          {t("intro")}
        </p>

        <div className="mt-10">
          <TutorialBrowser />
        </div>
      </main>

      <Footer />
    </>
  );
}

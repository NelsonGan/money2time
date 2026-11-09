import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardEntry } from "@/components/home/dashboard-entry";
import { DeveloperSection } from "@/components/home/developer-section";
import { FeatureGrid } from "@/components/home/feature-grid";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { Logging } from "@/components/home/logging";
import { PriceTicker } from "@/components/home/price-ticker";
import { Testimonials } from "@/components/home/testimonials";
import { ScrollReveal } from "@/components/scroll-reveal";
import { Footer, Header } from "@/components/site-chrome";
import { isLocale, type Locale } from "@/i18n/routing";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";
import { marketFor } from "@/lib/money";
import {
  htmlLang,
  jsonLd,
  localizedUrl,
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_ALTERNATE_NAMES,
  SITE_METADATA_BASE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import { media } from "@/lib/media";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.home" });
  const title = t("title");
  const description = t("description");
  const openGraphDescription = t("openGraphDescription");

  return {
    alternates: pageAlternates("", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: {
      ...pageOpenGraph({
        description: openGraphDescription,
        locale,
        path: "",
        title,
      }),
    },
    title,
    twitter: pageTwitter({ description: openGraphDescription, locale, title }),
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const metadataT = await getTranslations({ locale, namespace: "metadata.home" });
  const appDescription = metadataT("description");
  const homeUrl = localizedUrl("", locale as Locale);
  const organizationId = `${SITE_URL}/#organization`;

  // One graph per locale, cross-referenced by `@id` so a crawler reads the
  // nodes as one entity rather than three things that share a name. The
  // publisher is the same everywhere and keeps a site-wide id; the app and
  // site nodes carry a localised description, so their ids are scoped to the
  // page rather than describing 32 different things at once.
  const jsonLdGraph = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${homeUrl}/#app`,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      applicationCategory: "FinanceApplication",
      operatingSystem: "iOS, Android",
      description: appDescription,
      inLanguage: htmlLang(locale as Locale),
      image: media("/icon.png"),
      url: homeUrl,
      downloadUrl: [APP_STORE_URL, PLAY_STORE_URL],
      publisher: { "@id": organizationId },
      offers: {
        "@type": "Offer",
        price: "0",
        // Free either way, but quoting the visitor's own currency keeps the
        // offer consistent with every price rendered on the page.
        priceCurrency: marketFor(locale).currency,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      url: SITE_URL,
      logo: media("/icon.png"),
      sameAs: [APP_STORE_URL, PLAY_STORE_URL],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${homeUrl}/#website`,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      url: homeUrl,
      inLanguage: htmlLang(locale as Locale),
      publisher: { "@id": organizationId },
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(jsonLdGraph) }}
      />
      <ScrollReveal />
      <Header withSectionLinks />
      <main>
        <Hero locale={locale as Locale} />
        <DashboardEntry />
        <PriceTicker />
        <HowItWorks />
        <Logging />
        <FeatureGrid />
        <Testimonials />
        <DeveloperSection />
      </main>
      <Footer />
    </>
  );
}

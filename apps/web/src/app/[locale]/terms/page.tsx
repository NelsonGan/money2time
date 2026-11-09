import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Footer, Header } from "@/components/site-chrome";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { CONTACT_EMAIL } from "@/lib/contact";
import {
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
} from "@/lib/seo";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  lists?: string[][];
  subsections?: Array<{
    title: string;
    paragraphs?: string[];
    lists?: string[][];
  }>;
};

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.terms" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates("/terms", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      locale,
      path: "/terms",
      title,
    }),
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function TermsOfUse({
  params,
}: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("terms");
  const sections = t.raw("sections") as LegalSection[];
  const privacyPolicyLabel = t("privacyPolicyLabel");

  return (
    <>
      <Header />

      <main className="pt-32 pb-24 max-w-3xl mx-auto px-6">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
          {t("title")}
        </h1>
        <p className="text-foreground-muted text-sm mb-12">
          {t("lastUpdated")}
        </p>

        <div className="prose-m2t space-y-10 text-foreground-soft text-[15px] leading-relaxed">
          {sections.map((section) => (
            <Section
              key={section.title}
              privacyPolicyLabel={privacyPolicyLabel}
              section={section}
            />
          ))}

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">
              {t("contact.title")}
            </h2>
            <div className="space-y-3">
              <p>{t("contact.body")}</p>
              <p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary font-semibold hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Section({
  privacyPolicyLabel,
  section,
}: {
  privacyPolicyLabel: string;
  section: LegalSection;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-foreground mb-3">
        {section.title}
      </h2>
      <div className="space-y-3">
        {section.paragraphs?.map((paragraph) => {
          if (paragraph.includes("{privacyPolicy}")) {
            const [prefix, suffix] = paragraph.split("{privacyPolicy}");
            return (
              <p key={paragraph}>
                {prefix}
                <Link
                  href="/privacy"
                  className="text-primary font-semibold hover:underline"
                >
                  {privacyPolicyLabel}
                </Link>
                {suffix}
              </p>
            );
          }

          return <p key={paragraph}>{paragraph}</p>;
        })}
        {section.lists?.map((items) => (
          <ul key={items.join("|")}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ))}
        {section.subsections?.map((subsection) => (
          <div key={subsection.title} className="mt-4">
            <h3 className="text-base font-semibold text-foreground mb-2">
              {subsection.title}
            </h3>
            <div className="space-y-2">
              {subsection.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {subsection.lists?.map((items) => (
                <ul key={items.join("|")}>
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

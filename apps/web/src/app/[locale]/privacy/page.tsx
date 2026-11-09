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
  subsections?: LegalSubsection[];
  table?: {
    headers: string[];
    rows: string[][];
  };
};

type LegalSubsection = {
  title: string;
  paragraphs?: string[];
  lists?: string[][];
};

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.privacy" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates("/privacy", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      locale,
      path: "/privacy",
      title,
    }),
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function PrivacyPolicy({
  params,
}: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");
  const sections = t.raw("sections") as LegalSection[];
  const websiteAnalytics = t.raw("websiteAnalytics") as LegalSubsection;

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
          {sections.map((section, index) => (
            <Section
              key={section.title}
              section={section}
              extraSubsection={index === 2 ? websiteAnalytics : undefined}
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
              <p>
                {t("contact.formPrefix")}{" "}
                <Link
                  href="/contact"
                  className="text-primary font-semibold hover:underline"
                >
                  {t("contact.formLink")}
                </Link>{" "}
                {t("contact.formSuffix")}
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
  section,
  extraSubsection,
}: {
  section: LegalSection;
  extraSubsection?: LegalSubsection;
}) {
  const subsections = [
    ...(section.subsections ?? []),
    ...(extraSubsection ? [extraSubsection] : []),
  ];

  return (
    <section>
      <h2 className="text-xl font-bold text-foreground mb-3">
        {section.title}
      </h2>
      <div className="space-y-3">
        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {section.lists?.map((items) => (
          <ul key={items.join("|")}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ))}
        {subsections.map((subsection) => (
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
        {section.table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-border">
                  {section.table.headers.map((header) => (
                    <th
                      key={header}
                      className="text-left py-2 pr-4 font-semibold text-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr key={row.join("|")} className="border-b border-border/40">
                    {row.map((cell) => (
                      <td key={cell} className="py-2 pr-4">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

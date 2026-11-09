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

type DeletionSection = {
  title: string;
  paragraphs?: string[];
  lists?: string[][];
  subsections?: Array<{
    title: string;
    paragraphs?: string[];
    lists?: string[][];
  }>;
  table?: {
    headers: string[];
    rows: string[][];
  };
};

const DELETION_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Data Deletion Request",
)}`;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/data-deletion">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({
    locale,
    namespace: "metadata.dataDeletion",
  });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates("/data-deletion", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      locale,
      path: "/data-deletion",
      title,
    }),
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function DataDeletion({
  params,
}: PageProps<"/[locale]/data-deletion">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dataDeletion");
  const sections = t.raw("sections") as DeletionSection[];

  return (
    <>
      <Header />

      <main className="pt-32 pb-24 max-w-3xl mx-auto px-6">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
          {t("title")}
        </h1>
        <p className="text-foreground-muted text-sm mb-8">
          {t("lastUpdated")}
        </p>

        <div className="prose-m2t space-y-10 text-foreground-soft text-[15px] leading-relaxed">
          <p>{t("intro")}</p>

          {sections.map((section) => (
            <Section key={section.title} section={section} />
          ))}

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">
              {t("contact.title")}
            </h2>
            <div className="space-y-3">
              <p>{t("contact.body")}</p>
              <p>
                <a
                  href={DELETION_MAILTO}
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

function Section({ section }: { section: DeletionSection }) {
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
          <ol
            key={items.join("|")}
            className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-foreground-muted"
          >
            {items.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
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
                <ol
                  key={items.join("|")}
                  className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-foreground-muted"
                >
                  {items.map((item) => (
                    <li key={item} className="pl-1">
                      {item}
                    </li>
                  ))}
                </ol>
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
                      <td key={cell} className="py-2 pr-4 align-top">
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

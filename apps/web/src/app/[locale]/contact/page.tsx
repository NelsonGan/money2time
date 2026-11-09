import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DiscordButton } from "@/app/discord-button";
import { Mascot } from "@/components/mascot";
import { Footer, Header } from "@/components/site-chrome";
import { isLocale } from "@/i18n/routing";
import {
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
} from "@/lib/seo";
import { ContactForm } from "./contact-form";

export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.contact" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates("/contact", locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description,
      locale,
      path: "/contact",
      title,
    }),
    title,
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function ContactPage({
  params,
}: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact.page");

  return (
    <>
      <Header />

      <main className="pt-28 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <section className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <Mascot
                  pose="waving"
                  className="w-16 h-16 sm:w-24 sm:h-24 animate-wiggle"
                />
                <h1 className="max-w-xl text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                  {t("title")}
                </h1>
              </div>

              <p className="max-w-2xl text-base leading-7 text-foreground-soft sm:text-lg">
                {t("intro")}
              </p>
            </div>

            <div className="card-surface rounded-[36px] p-6 sm:p-8">
              <div className="border-b border-border/60 pb-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground-muted">
                    {t("formLabel")}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <ContactForm />
              </div>
            </div>

            <div className="card-surface flex flex-col items-center gap-4 rounded-[36px] p-6 text-center sm:p-8">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                  {t("discordTitle")}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-foreground-soft sm:text-base">
                  {t("discordBody")}
                </p>
              </div>
              <DiscordButton
                location="contact_page"
                className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#5865F2] px-6 py-3 text-base font-bold text-white transition hover:bg-[#4752C4]"
              >
                {t("discordCta")}
              </DiscordButton>
            </div>
          </section>
        </div>
      </main>

      <Footer includeTerms={false} />
    </>
  );
}

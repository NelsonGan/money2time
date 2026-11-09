import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { HoursComparison } from "@/components/compare/hours-comparison";
import { Section } from "@/components/home/section";
import { Footer, Header } from "@/components/site-chrome";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/routing";
import { BIG_MAC_DATE, BIG_MAC_SOURCE, BIG_MAC_SOURCE_URL } from "@/lib/bigmac.generated";
import {
  ELECTRICITY_DATE,
  ENERGY_SOURCE,
  ENERGY_SOURCE_URL,
  PETROL_DATE,
} from "@/lib/energy.generated";
import { countryForLocale, countryNamer, flagFor } from "@/lib/countries";
import { currencyOptions } from "@/lib/money";
import {
  breadcrumbLd,
  jsonLd,
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
} from "@/lib/seo";
import {
  COMPARABLE_MARKETS,
  comparableMarket,
  type ComparableMarket,
  HOURS_PER_WEEK,
  MARKETS_BY_EFFORT,
} from "@/lib/wages";

const PATH = "/cost-in-hours";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/cost-in-hours">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.costInHours" });
  const title = t("title");
  const description = t("description");

  return {
    alternates: pageAlternates(PATH, locale),
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({
      description: t("openGraphDescription"),
      locale,
      path: PATH,
      title,
    }),
    title,
    twitter: pageTwitter({
      description: t("openGraphDescription"),
      locale,
      title,
    }),
  };
}

export default async function CostInHours({
  params,
}: PageProps<"/[locale]/cost-in-hours">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("costInHours");
  const units = await getTranslations("home.units");
  const format = await getFormatter();

  const base = comparableMarket(countryForLocale(locale).code) as ComparableMarket;
  /** A page comparing a country with itself teaches nothing. */
  const initialCompare = base.country.code === "US" ? "GB" : "US";

  const nameOf = countryNamer(locale);
  const duration = (minutes: number) =>
    minutes < 60
      ? units("min", { value: format.number(Math.round(minutes)) })
      : units("hours", {
          value: format.number(minutes / 60, { maximumFractionDigits: 1 }),
        });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbLd({
              locale: locale as Locale,
              name: t("title"),
              path: PATH,
            }),
          ),
        }}
      />
      <Header />

      <main>
        <Section className="pt-32">
          <div className="max-w-[720px]">
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="display mt-3 text-[clamp(34px,4.6vw,54px)]">
              {t("title")}
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-foreground-soft text-pretty">
              {t("intro")}
            </p>
          </div>

          <div className="mt-10">
            <HoursComparison
              baseCode={base.country.code}
              initialCompareCode={initialCompare}
            />
          </div>
        </Section>

        <Section tone="band">
          <div className="max-w-[720px]">
            <h2 className="headline text-[clamp(26px,3vw,38px)]">
              {t("allMarkets.title")}
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-foreground-soft text-pretty">
              {t("allMarkets.intro")}
            </p>
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-border/70 bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">{t("allMarkets.caption")}</caption>
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.08em] text-foreground-muted">
                  <th scope="col" className="px-4 py-3 font-bold sm:px-5">
                    {t("allMarkets.country")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold sm:px-5">
                    {t("allMarkets.pay")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold sm:px-5">
                    {t("allMarkets.basis")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold sm:px-5">
                    {t("allMarkets.hourly")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold sm:px-5">
                    {t("metrics.bigMacPrice")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold sm:px-5">
                    {t("allMarkets.effort")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {MARKETS_BY_EFFORT.map((row) => {
                  const amount = (value: number) =>
                    format.number(value, currencyOptions(row.country, value));
                  /** The visitor's own country, called out where they can find it. */
                  const isBase = row.country.code === base.country.code;

                  return (
                    <tr
                      key={row.country.code}
                      aria-current={isBase ? "true" : undefined}
                      className={`border-b border-border/40 last:border-0 ${
                        isBase ? "bg-primary/[0.07]" : ""
                      }`}
                    >
                      <th scope="row" className="px-4 py-3 text-sm font-semibold sm:px-5">
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true">{flagFor(row.country.code)}</span>
                          <span className={isBase ? "text-primary" : undefined}>
                            {nameOf(row.country.code)}
                          </span>
                          {isBase ? (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
                              {t("allMarkets.youAreHere")}
                            </span>
                          ) : null}
                        </span>
                      </th>
                      <td className="px-4 py-3 sm:px-5">
                        <span className="block font-mono text-[13px] tabular">
                          {amount(row.wage.amount)}
                        </span>
                        <span className="block text-[11px] text-foreground-muted">
                          {t(`periods.${row.wage.period}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] leading-snug text-foreground-soft sm:px-5">
                        {t(`measures.${row.wage.measure}`)}
                        <span className="block text-foreground-muted">
                          {t(`scopes.${row.wage.scope}`)} · {row.wage.year}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] tabular sm:px-5">
                        {amount(row.hourly)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] tabular sm:px-5">
                        {row.bigMac ? amount(row.bigMac) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono text-[13px] tabular sm:px-5 ${
                          isBase ? "font-semibold text-primary" : ""
                        }`}
                      >
                        {row.minutesPerBigMac ? duration(row.minutesPerBigMac) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section>
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="headline text-[clamp(26px,3vw,38px)]">
                {t("notes.title")}
              </h2>
              <dl className="mt-6 space-y-5 text-[15px] leading-relaxed text-foreground-soft">
                {(["method", "basket", "comparability", "grossPay"] as const).map(
                  (note) => (
                    <div key={note}>
                      <dt className="font-bold text-foreground">
                        {t(`notes.${note}.title`)}
                      </dt>
                      <dd className="mt-1 text-pretty">
                        {t(`notes.${note}.body`, { hours: HOURS_PER_WEEK })}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </div>

            <div>
              <h2 className="headline text-[clamp(26px,3vw,38px)]">
                {t("sources.title")}
              </h2>
              <p className="mt-6 text-[14px] leading-relaxed text-foreground-soft">
                {t("sources.bigMac")}{" "}
                <a
                  href={BIG_MAC_SOURCE_URL}
                  rel="nofollow noopener"
                  target="_blank"
                  className="underline decoration-border underline-offset-2 hover:text-primary"
                >
                  {BIG_MAC_SOURCE}
                </a>
                , {BIG_MAC_DATE}.
              </p>

              <p className="mt-3 text-[14px] leading-relaxed text-foreground-soft">
                {t("sources.energy")}{" "}
                <a
                  href={ENERGY_SOURCE_URL}
                  rel="nofollow noopener"
                  target="_blank"
                  className="underline decoration-border underline-offset-2 hover:text-primary"
                >
                  {ENERGY_SOURCE}
                </a>
                , {PETROL_DATE} / {ELECTRICITY_DATE}.
              </p>

              <p className="mt-5 text-[14px] font-bold">{t("sources.wages")}</p>
              <ul className="mt-3 space-y-3 text-[14px] leading-relaxed text-foreground-soft">
                {COMPARABLE_MARKETS.map(({ country: row, wage }) => (
                  <li key={row.code} className="flex gap-3">
                    <span aria-hidden="true" className="shrink-0">
                      {flagFor(row.code)}
                    </span>
                    <span className="min-w-0">
                      <a
                        href={wage.sourceUrl}
                        rel="nofollow noopener"
                        target="_blank"
                        className="underline decoration-border underline-offset-2 hover:text-primary"
                      >
                        {wage.source}
                      </a>
                      <span className="text-foreground-muted"> — {wage.year}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-8 text-[15px] leading-relaxed text-foreground-soft text-pretty">
                {t("cta.body")}
              </p>
              <Link
                href="/"
                className="btn btn-primary mt-5 inline-flex"
              >
                {t("cta.link")}
              </Link>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}

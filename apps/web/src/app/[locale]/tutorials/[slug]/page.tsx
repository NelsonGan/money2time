import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ClayIcon } from "@/components/clay-icon";
import { Footer, Header } from "@/components/site-chrome";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale, routing } from "@/i18n/routing";
import {
  jsonLd,
  localizedUrl,
  pageAlternates,
  pageOpenGraph,
  pageTwitter,
  SITE_METADATA_BASE,
  SITE_NAME,
  tutorialImage,
} from "@/lib/seo";
import { media, responsiveMedia } from "@/lib/media";
import {
  getTutorial,
  TUTORIALS,
  tutorialIcon,
  tutorialImagePath,
  tutorialNeighbours,
} from "@/lib/tutorials";

import { OpenInApp } from "./open-in-app";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    TUTORIALS.map((tutorial) => ({ locale, slug: tutorial.id })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/tutorials/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const tutorial = getTutorial(slug);
  if (!isLocale(locale) || !tutorial) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "metadata.tutorials" });
  const path = `/tutorials/${tutorial.id}` as const;
  const title = t("detailTitle", { title: tutorial.title });
  const description = tutorial.summary;
  const image = tutorialImage(tutorial);

  return {
    alternates: pageAlternates(path, locale),
    description,
    keywords: tutorial.keywords,
    metadataBase: SITE_METADATA_BASE,
    openGraph: pageOpenGraph({ description, image, locale, path, title }),
    title,
    twitter: pageTwitter({ description, image, locale, title }),
  };
}

export default async function TutorialDetail({
  params,
}: PageProps<"/[locale]/tutorials/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const tutorial = getTutorial(slug);
  if (!tutorial) {
    notFound();
  }

  const t = await getTranslations("tutorials");
  const path = `/tutorials/${tutorial.id}` as const;
  const { previous, next } = tutorialNeighbours(tutorial.id);

  // HowTo is the schema type for a numbered set of steps with pictures, which
  // is exactly what this page is, and it is what earns the step carousel in
  // search results.
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: tutorial.title,
    description: tutorial.summary,
    // No `totalTime`: it would be a guess, and a made-up duration in structured
    // data is worse than an absent one.
    step: tutorial.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      url: `${localizedUrl(path, locale as Locale)}#step-${index + 1}`,
      ...(step.image
        ? { image: media(tutorialImagePath(step.image)) }
        : {}),
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: localizedUrl("", locale as Locale) },
      {
        "@type": "ListItem",
        position: 2,
        name: t("title"),
        item: localizedUrl("/tutorials", locale as Locale),
      },
      { "@type": "ListItem", position: 3, name: tutorial.title, item: localizedUrl(path, locale as Locale) },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([breadcrumb, howToLd]) }}
      />
      <Header />

      <main className="mx-auto w-full max-w-[760px] px-5 pt-32 pb-24 sm:px-8">
        <Link
          href="/tutorials"
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-foreground-soft transition-colors hover:text-primary"
        >
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
          {t("title")}
        </Link>

        <header className="mt-6 flex gap-4">
          <ClayIcon name={tutorialIcon(tutorial.id)} size={52} className="mt-1" />
          <div className="min-w-0">
            <h1 className="headline text-3xl sm:text-4xl">{tutorial.title}</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-foreground-soft">
              {tutorial.summary}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-primary">
              {t("stepCount", { count: tutorial.steps.length })}
              {tutorial.pro ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold tracking-wide text-card">
                  {t("badgePro")}
                </span>
              ) : null}
              {tutorial.platform === "ios" ? (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-primary">
                  {t("badgeIos")}
                </span>
              ) : null}
            </p>
          </div>
        </header>

        <div className="mt-8">
          <OpenInApp id={tutorial.id} />
        </div>

        <ol className="mt-12 flex flex-col gap-12">
          {tutorial.steps.map((step, index) => (
            <li key={`${tutorial.id}-${index}`} id={`step-${index + 1}`} className="scroll-mt-28">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
                {step.image ? (
                  <div className="card-surface mx-auto w-full max-w-[260px] shrink-0 overflow-hidden rounded-[26px] sm:mx-0 sm:w-[260px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- resized at the edge, see responsiveMedia */}
                    <img
                      {...responsiveMedia(tutorialImagePath(step.image), 260, 90)}
                      alt={step.title}
                      width={820}
                      height={1783}
                      loading="lazy"
                      decoding="async"
                      sizes="260px"
                      className="block h-auto w-full"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1 sm:pt-4">
                  <p className="text-[13px] font-bold tracking-[0.14em] text-foreground-muted uppercase">
                    {t("stepCounter", { current: index + 1, total: tutorial.steps.length })}
                  </p>
                  <h2 className="mt-2 text-[22px] font-extrabold tracking-tight">{step.title}</h2>
                  <p className="mt-2 text-[16px] leading-relaxed text-foreground-soft">
                    {step.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <nav className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/tutorials/${previous.id}`}
              className="card-surface card-lift rounded-[var(--radius-card)] p-5"
            >
              <span className="block text-[12px] font-bold tracking-[0.14em] text-foreground-muted uppercase">
                {t("previous")}
              </span>
              <span className="mt-1 block text-[16px] font-bold tracking-tight">
                {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/tutorials/${next.id}`}
              className="card-surface card-lift rounded-[var(--radius-card)] p-5 sm:text-right"
            >
              <span className="block text-[12px] font-bold tracking-[0.14em] text-foreground-muted uppercase">
                {t("next")}
              </span>
              <span className="mt-1 block text-[16px] font-bold tracking-tight">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </main>

      <Footer />
    </>
  );
}

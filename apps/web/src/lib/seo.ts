import type { Metadata } from "next";

import { routing, type Locale } from "@/i18n/routing";

export const SITE_URL = "https://money2time.com";
export const SITE_NAME = "Money2Time";
export const SITE_METADATA_BASE = new URL(SITE_URL);

/**
 * The wordmark sets the "2" as a subscript, which is a typographic choice
 * rather than a spelling. Search engines and screen readers only ever see
 * `SITE_NAME`, so these are the other ways people write the brand — they go
 * into structured data so a query for any of them resolves to this entity.
 */
export const SITE_ALTERNATE_NAMES = ["Money₂Time", "Money 2 Time", "Money to Time"];

export type SeoPath = "" | `/${string}`;

/**
 * `og:locale` takes a `language_TERRITORY` tag, not the BCP-47 hyphenated
 * form used for routing, and it has no notion of a language without a
 * country. Every locale therefore names the market it is written for — which
 * for the language-only locales is the country most of their readers are in.
 */
const OG_LOCALES: Record<Locale, string> = {
  da: "da_DK",
  de: "de_DE",
  en: "en_US",
  "en-au": "en_AU",
  "en-ca": "en_CA",
  "en-gb": "en_GB",
  "en-in": "en_IN",
  "en-my": "en_MY",
  "en-nz": "en_NZ",
  "en-ph": "en_PH",
  "en-sg": "en_SG",
  "en-za": "en_ZA",
  es: "es_ES",
  fil: "fil_PH",
  fr: "fr_FR",
  hi: "hi_IN",
  id: "id_ID",
  it: "it_IT",
  ja: "ja_JP",
  ko: "ko_KR",
  ms: "ms_MY",
  nb: "nb_NO",
  nl: "nl_NL",
  pl: "pl_PL",
  pt: "pt_BR",
  ru: "ru_RU",
  sv: "sv_SE",
  th: "th_TH",
  tr: "tr_TR",
  uk: "uk_UA",
  vi: "vi_VN",
  zh: "zh_CN",
};

export function ogLocale(locale: Locale) {
  return OG_LOCALES[locale];
}

/**
 * Locales are lowercase in URLs, but the canonical BCP-47 form uppercases the
 * region. Both are valid in `lang`, and this is the one every other tag on
 * the page (`og:locale`, hreflang) is normalised against.
 */
export function htmlLang(locale: Locale) {
  const [language, region] = locale.split("-");
  return region ? `${language}-${region.toUpperCase()}` : language;
}

export function localizedUrl(path: SeoPath, locale: Locale) {
  const normalizedPath = path === "/" ? "" : path;

  if (locale === routing.defaultLocale) {
    return `${SITE_URL}${normalizedPath}`;
  }

  return `${SITE_URL}/${locale}${normalizedPath}`;
}

export function localizedPath(path: SeoPath, locale: Locale) {
  const normalizedPath = path === "/" ? "" : path;

  if (locale === routing.defaultLocale) {
    return normalizedPath || "/";
  }

  return `/${locale}${normalizedPath}`;
}

export function localeAlternates(path: SeoPath) {
  return {
    ...Object.fromEntries(
      routing.locales.map((locale) => [locale, localizedUrl(path, locale)]),
    ),
    "x-default": localizedUrl(path, routing.defaultLocale),
  };
}

export function pageAlternates(path: SeoPath, locale: Locale) {
  return {
    canonical: localizedUrl(path, locale),
    languages: localeAlternates(path),
  };
}

/**
 * The picture a preview card shows. `path` is the page whose
 * `opengraph-image` route draws it and `locale` the copy that route is
 * rendered in — which is not always the page's own. The tutorial catalog is
 * written once, in English, so all 32 locales share the default locale's
 * image rather than 32 identical copies of it.
 */
export type SeoImage = { alt: string; locale: Locale; path: SeoPath };

export function siteImage(locale: Locale): SeoImage {
  return { alt: `${SITE_NAME} app preview`, locale, path: "" };
}

/** For a page that draws its own image, in its own locale. */
export function pageImage(path: SeoPath, locale: Locale, alt: string): SeoImage {
  return { alt, locale, path };
}

export function tutorialImage(tutorial: { id: string; title: string }): SeoImage {
  return {
    alt: `${tutorial.title} — a ${SITE_NAME} tutorial`,
    locale: routing.defaultLocale,
    path: `/tutorials/${tutorial.id}`,
  };
}

function imageUrl(image: SeoImage, convention: "opengraph" | "twitter") {
  return localizedUrl(`${image.path}/${convention}-image`, image.locale);
}

export function pageOpenGraph({
  description,
  image,
  locale,
  path,
  title,
}: {
  description: string;
  image?: SeoImage;
  locale: Locale;
  path: SeoPath;
  title: string;
}): NonNullable<Metadata["openGraph"]> {
  const card = image ?? siteImage(locale);

  return {
    description,
    images: [
      {
        alt: card.alt,
        height: 630,
        url: imageUrl(card, "opengraph"),
        width: 1200,
      },
    ],
    locale: ogLocale(locale),
    siteName: SITE_NAME,
    title,
    type: "website",
    url: localizedUrl(path, locale),
  };
}

export function pageTwitter({
  description,
  image,
  locale,
  title,
}: {
  description: string;
  image?: SeoImage;
  locale: Locale;
  title: string;
}): NonNullable<Metadata["twitter"]> {
  const card = image ?? siteImage(locale);

  return {
    card: "summary_large_image",
    description,
    images: [imageUrl(card, "twitter")],
    title,
  };
}

/**
 * The trail above a subpage. The home page is its own root and does not get
 * one — a single-item breadcrumb tells a crawler nothing it did not know.
 */
export function breadcrumbLd({
  locale,
  name,
  path,
}: {
  locale: Locale;
  name: string;
  path: SeoPath;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: SITE_NAME,
        item: localizedUrl("", locale),
      },
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: localizedUrl(path, locale),
      },
    ],
  };
}

/**
 * Several nodes go out as one `@graph` object, never a bare array: scripts
 * injected into the page that read `["@context"]` off each block throw on an
 * array, and those errors land in our error tracking.
 */
export function jsonLd(data: object | object[]) {
  const ld = Array.isArray(data)
    ? {
        "@context": "https://schema.org",
        "@graph": data.map((node) =>
          Object.fromEntries(
            Object.entries(node).filter(([key]) => key !== "@context"),
          ),
        ),
      }
    : data;
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}

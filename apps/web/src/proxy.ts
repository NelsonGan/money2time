import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isLocale, routing, type Locale } from "./i18n/routing";
import { APP_ORIGIN, isAppHost, isProductionHost } from "./lib/platform";

/*
 * next-intl is typed against the `next` package it lists as a peer, which npm
 * installs alongside; the site runs on vinext, whose `NextRequest` and
 * `NextResponse` are the ones `next/server` resolves to here, and at runtime
 * the same objects.
 */
const handleI18nRouting = createMiddleware(routing) as unknown as (
  request: NextRequest,
) => NextResponse;

const countryLocaleMap: Record<string, Locale> = {
  AD: "es",
  AE: "en",
  AR: "es",
  AT: "de",
  AU: "en-au",
  BE: "fr",
  BN: "ms",
  BR: "pt",
  BY: "ru",
  CA: "en-ca",
  CH: "de",
  CL: "es",
  CN: "zh",
  CO: "es",
  CZ: "en",
  DE: "de",
  DK: "da",
  ES: "es",
  FI: "sv",
  FR: "fr",
  GB: "en-gb",
  HK: "zh",
  ID: "id",
  IE: "en",
  IN: "en-in",
  IT: "it",
  JP: "ja",
  KR: "ko",
  KZ: "ru",
  LI: "de",
  LU: "de",
  MO: "zh",
  MX: "es",
  MY: "en-my",
  NL: "nl",
  NO: "nb",
  NZ: "en-nz",
  PH: "en-ph",
  PL: "pl",
  PT: "pt",
  RU: "ru",
  SE: "sv",
  SG: "en-sg",
  TH: "th",
  TR: "tr",
  TW: "zh",
  UA: "uk",
  US: "en",
  VN: "vi",
  ZA: "en-za",
};

/**
 * Countries where we lead with English even though a local-language locale
 * exists, mapped to the English market they should land in.
 */
const englishFirstCountries: Record<string, Locale> = {
  MY: "en-my",
  SG: "en-sg",
};

function pathnameLocale(pathname: string) {
  const segment = pathname.split("/")[1];
  return segment && isLocale(segment) ? segment : undefined;
}

/** Cloudflare's IP geolocation; `XX` and `T1` (Tor) name no country. */
function countryFromRequest(request: NextRequest) {
  const country = request.headers.get("cf-ipcountry")?.toUpperCase();
  return country && country !== "XX" && country !== "T1" ? country : undefined;
}

function localeFromAcceptLanguage(request: NextRequest) {
  const header = request.headers.get("accept-language");
  if (!header) {
    return undefined;
  }

  const preferences = header
    .split(",")
    .map((part) => {
      const [language, quality] = part.trim().split(";q=");
      return {
        language: language.toLowerCase(),
        quality: quality ? Number.parseFloat(quality) : 1,
      };
    })
    .filter(({ language, quality }) => language && !Number.isNaN(quality))
    .sort((a, b) => b.quality - a.quality);

  for (const { language } of preferences) {
    const exactLocale = routing.locales.find(
      (locale) => locale.toLowerCase() === language,
    );

    if (exactLocale) {
      return exactLocale;
    }

    const baseLanguage = language.split("-")[0];
    if (isLocale(baseLanguage)) {
      return baseLanguage;
    }
  }

  return undefined;
}

/**
 * The browser's language wins, except when the country points at a regional
 * variant of that same language: someone in Britain running a US-English
 * browser still wants prices in pounds.
 */
function preferredLocale(browser: Locale | undefined, country: Locale | undefined) {
  if (!browser) {
    return country;
  }

  if (country && country !== browser && country.split("-")[0] === browser.split("-")[0]) {
    return country;
  }

  return browser;
}

function localizedPathname(pathname: string, locale: Locale) {
  if (locale === routing.defaultLocale) {
    return pathname;
  }

  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

function internalLocalizedPathname(pathname: string, locale: Locale) {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/** `/dashboard` or `/<locale>/dashboard` on the marketing host. */
const DASHBOARD_PATH = /^\/(?:([a-z]{2,3}(?:-[a-z]{2})?)\/)?dashboard\/?$/;

/**
 * The path as the router will see it. Routing decodes percent escapes, so
 * `/%64ashboard` renders the dashboard: matching the raw path would let it
 * through on www, without the app host's CSP and with analytics recording on.
 */
export function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * app.money2time.com serves only the dashboard, at whatever path, in the
 * visitor's language: a locale in the path, then their saved choice, then
 * the same browser-and-country guess the marketing site makes.
 */
function appHostResponse(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const saved = request.cookies.get("NEXT_LOCALE")?.value;
  const country = countryFromRequest(request);
  const locale =
    pathnameLocale(pathname) ??
    (saved && isLocale(saved) ? saved : undefined) ??
    (country ? englishFirstCountries[country] : undefined) ??
    preferredLocale(localeFromAcceptLanguage(request), country ? countryLocaleMap[country] : undefined) ??
    routing.defaultLocale;
  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname = `/${locale}/dashboard`;
  return NextResponse.rewrite(nextUrl);
}

/**
 * `www` serves the site and the bare domain only redirects to it. The
 * canonicals, sitemap and hreflang alternates name the apex (`SITE_URL`);
 * Google resolved that pair long ago, and AGENTS.md explains why it is left
 * alone. Here rather than in `next.config.ts` because vinext's config
 * redirects drop the query string when the destination is another host, and
 * an apex link with UTM tags has to keep them.
 */
const APEX_HOST = "money2time.com";
const WWW_ORIGIN = "https://www.money2time.com";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? request.nextUrl.host).split(":")[0];

  if (host === APEX_HOST) {
    return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, WWW_ORIGIN), 308);
  }

  if (isAppHost(host)) {
    // The marketing site's robots.txt and sitemap are not this host's: it has
    // one page, and that page says noindex itself.
    if (pathname === "/robots.txt") {
      return new NextResponse("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain" } });
    }
    if (pathname === "/sitemap.xml") return new NextResponse("Not found", { status: 404 });
    return appHostResponse(request);
  }
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return NextResponse.next();

  // The dashboard is served only on its own host; send it there.
  const dashboard = decodedPath(pathname).match(DASHBOARD_PATH);
  if (dashboard && isProductionHost(host)) {
    const locale = dashboard[1] && isLocale(dashboard[1]) ? dashboard[1] : undefined;
    const target = new URL(locale && locale !== routing.defaultLocale ? `/${locale}` : "/", APP_ORIGIN);
    return NextResponse.redirect(target, 308);
  }

  if (pathnameLocale(pathname) || request.cookies.has("NEXT_LOCALE")) {
    return handleI18nRouting(request);
  }

  const browserLocale = localeFromAcceptLanguage(request);
  const country = countryFromRequest(request);
  const forcedCountryLocale = country ? englishFirstCountries[country] : undefined;
  const countryLocale = country ? countryLocaleMap[country] : undefined;
  const locale = forcedCountryLocale ?? preferredLocale(browserLocale, countryLocale);

  if (forcedCountryLocale) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = internalLocalizedPathname(pathname, forcedCountryLocale);

    const response = NextResponse.rewrite(nextUrl);
    response.cookies.set("NEXT_LOCALE", forcedCountryLocale, {
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  if (locale) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = localizedPathname(pathname, locale);

    if (nextUrl.pathname !== pathname) {
      const response = NextResponse.redirect(nextUrl);
      response.cookies.set("NEXT_LOCALE", locale, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // robots.txt and the sitemap are matched only so the app host can answer
  // them differently; the marketing host passes them straight through.
  matcher: [
    "/((?!api|download$|_next|.*\\..*).*)",
    "/robots.txt",
    "/sitemap.xml",
    // Every path on the apex, files and `/download` included, to redirect it.
    { source: "/:path*", has: [{ type: "host", value: "money2time\\.com" }] },
  ],
};

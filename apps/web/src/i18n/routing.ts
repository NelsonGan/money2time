import { defineRouting } from "next-intl/routing";

/**
 * Regional English variants exist so each market sees its own currency and
 * spelling; they are labelled by country code because the language is the
 * same and only the country tells them apart.
 */
export const localeLabels = {
  da: "Dansk",
  de: "Deutsch",
  en: "English (US)",
  "en-au": "English (AU)",
  "en-ca": "English (CA)",
  "en-gb": "English (UK)",
  "en-in": "English (IN)",
  "en-my": "English (MY)",
  "en-nz": "English (NZ)",
  "en-ph": "English (PH)",
  "en-sg": "English (SG)",
  "en-za": "English (ZA)",
  es: "Español",
  fil: "Filipino",
  fr: "Français",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ms: "Bahasa Melayu",
  nb: "Norsk",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português (BR)",
  ru: "Русский",
  sv: "Svenska",
  th: "ภาษาไทย",
  tr: "Türkçe",
  uk: "Українська",
  vi: "Tiếng Việt",
  zh: "中文",
} as const;

export const localeFlags: Record<keyof typeof localeLabels, string> = {
  da: "🇩🇰",
  de: "🇩🇪",
  en: "🇺🇸",
  "en-au": "🇦🇺",
  "en-ca": "🇨🇦",
  "en-gb": "🇬🇧",
  "en-in": "🇮🇳",
  "en-my": "🇲🇾",
  "en-nz": "🇳🇿",
  "en-ph": "🇵🇭",
  "en-sg": "🇸🇬",
  "en-za": "🇿🇦",
  es: "🇪🇸",
  fil: "🇵🇭",
  fr: "🇫🇷",
  hi: "🇮🇳",
  id: "🇮🇩",
  it: "🇮🇹",
  ja: "🇯🇵",
  ko: "🇰🇷",
  ms: "🇲🇾",
  nb: "🇳🇴",
  nl: "🇳🇱",
  pl: "🇵🇱",
  pt: "🇧🇷",
  ru: "🇷🇺",
  sv: "🇸🇪",
  th: "🇹🇭",
  tr: "🇹🇷",
  uk: "🇺🇦",
  vi: "🇻🇳",
  zh: "🇨🇳",
};

export const routing = defineRouting({
  /*
   * Every page already lists its alternates in the head, against the
   * canonical host (`pageAlternates()` in `src/lib/seo.ts`). The middleware's
   * `Link` header would repeat them against whichever host served the request,
   * and on a prerendered page that is the build's own server, `127.0.0.1`.
   */
  alternateLinks: false,
  defaultLocale: "en",
  localePrefix: "as-needed",
  locales: Object.keys(localeLabels) as Array<keyof typeof localeLabels>,
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: string): value is Locale {
  return routing.locales.includes(value as Locale);
}

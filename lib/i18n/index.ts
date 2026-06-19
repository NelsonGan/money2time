import { getLocales } from 'expo-localization';
import { I18n as I18nJs } from 'i18n-js';

import da from './locales/da';
import de from './locales/de';
import en from './locales/en';
import es from './locales/es';
import fil from './locales/fil';
import fr from './locales/fr';
import hi from './locales/hi';
import id from './locales/id';
import it from './locales/it';
import ja from './locales/ja';
import ko from './locales/ko';
import ms from './locales/ms';
import nb from './locales/nb';
import nl from './locales/nl';
import pl from './locales/pl';
import pt from './locales/pt';
import ru from './locales/ru';
import sv from './locales/sv';
import th from './locales/th';
import tr from './locales/tr';
import uk from './locales/uk';
import vi from './locales/vi';
import zh from './locales/zh';

const TRANSLATIONS = {
  da,
  de,
  en,
  es,
  fil,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  ms,
  nb,
  nl,
  pl,
  pt,
  ru,
  sv,
  th,
  tr,
  uk,
  vi,
  zh,
} as const;
const I18n = new I18nJs(TRANSLATIONS);

I18n.enableFallback = true;
I18n.defaultLocale = 'en';

const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[];
const LOCALE_LABELS: Record<string, string> = {
  da: 'Dansk',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fil: 'Filipino',
  fr: 'Français',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ms: 'Bahasa Melayu',
  nb: 'Norsk',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  sv: 'Svenska',
  th: 'ภาษาไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  zh: '中文',
};

// Maps device language codes that differ from our locale keys to the right key.
// e.g. iOS reports 'tl' (Tagalog) for Filipino, and 'no' for generic Norwegian.
// Android API <21 reports BCP47 'in' for Indonesian (correct tag is 'id').
const LOCALE_ALIASES: Record<string, string> = {
  tl: 'fil',
  no: 'nb',
  in: 'id',
};

function normalizeLocale(input: string | null | undefined) {
  if (!input) return 'en';
  const lower = input.toLowerCase();
  const base = lower.split('-')[0] ?? lower;
  const resolved = LOCALE_ALIASES[base] ?? base;
  return SUPPORTED_LOCALES.includes(resolved as (typeof SUPPORTED_LOCALES)[number])
    ? resolved
    : 'en';
}

function getLocaleLabel(locale: string) {
  return LOCALE_LABELS[locale] ?? locale;
}

function getDeviceLocale() {
  const locale = getLocales()[0];
  return normalizeLocale(locale?.languageTag ?? locale?.languageCode ?? 'en');
}

/** Device ISO 3166-1 alpha-2 region code (e.g. "US", "MY"), or null. */
function getDeviceRegionCode(): string | null {
  return getLocales()[0]?.regionCode ?? null;
}

function setAppLocale(locale: string) {
  I18n.locale = normalizeLocale(locale);
}

/**
 * Returns SUPPORTED_LOCALES sorted for the language picker:
 *   1. currentLocale  (user's active locale)
 *   2. 'en'           (always second, unless it IS the current locale)
 *   3. the rest in their default alphabetical order
 */
function orderedLocales(currentLocale: string): string[] {
  const pinned: string[] = [];
  if (SUPPORTED_LOCALES.includes(currentLocale as (typeof SUPPORTED_LOCALES)[number])) {
    pinned.push(currentLocale);
  }
  if (currentLocale !== 'en') {
    pinned.push('en');
  }
  const rest = (SUPPORTED_LOCALES as readonly string[]).filter((l) => !pinned.includes(l));
  return [...pinned, ...rest];
}

setAppLocale(getDeviceLocale());

export {
  getDeviceLocale,
  getDeviceRegionCode,
  getLocaleLabel,
  I18n,
  LOCALE_LABELS,
  orderedLocales,
  setAppLocale,
  SUPPORTED_LOCALES,
};

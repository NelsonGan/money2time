import { getLocales } from 'expo-localization';
import { I18n as I18nJs } from 'i18n-js';

import en from './locales/en';

type Translations = typeof en;

// Every locale but English is read from its module the first time it is
// asked for. Each one is about 3,000 strings, and building all 24 on launch
// (then merging them into i18n-js) took a visible share of module evaluation
// for 23 languages the person is not reading. `require` inside the function is
// what defers it: Metro evaluates a module on its first `require`.
/* eslint-disable @typescript-eslint/no-require-imports -- deferred on purpose */
const LOCALE_LOADERS: Record<string, () => Translations> = {
  da: () => (require('./locales/da') as { default: Translations }).default,
  de: () => (require('./locales/de') as { default: Translations }).default,
  en: () => en,
  es: () => (require('./locales/es') as { default: Translations }).default,
  fil: () => (require('./locales/fil') as { default: Translations }).default,
  fr: () => (require('./locales/fr') as { default: Translations }).default,
  hi: () => (require('./locales/hi') as { default: Translations }).default,
  id: () => (require('./locales/id') as { default: Translations }).default,
  it: () => (require('./locales/it') as { default: Translations }).default,
  ja: () => (require('./locales/ja') as { default: Translations }).default,
  ko: () => (require('./locales/ko') as { default: Translations }).default,
  ms: () => (require('./locales/ms') as { default: Translations }).default,
  nb: () => (require('./locales/nb') as { default: Translations }).default,
  nl: () => (require('./locales/nl') as { default: Translations }).default,
  pl: () => (require('./locales/pl') as { default: Translations }).default,
  pt: () => (require('./locales/pt') as { default: Translations }).default,
  ru: () => (require('./locales/ru') as { default: Translations }).default,
  sv: () => (require('./locales/sv') as { default: Translations }).default,
  th: () => (require('./locales/th') as { default: Translations }).default,
  tr: () => (require('./locales/tr') as { default: Translations }).default,
  uk: () => (require('./locales/uk') as { default: Translations }).default,
  vi: () => (require('./locales/vi') as { default: Translations }).default,
  zh: () => (require('./locales/zh') as { default: Translations }).default,
  'zh-Hant': () => (require('./locales/zh-Hant') as { default: Translations }).default,
};
/* eslint-enable @typescript-eslint/no-require-imports */
// English is always there: it is the fallback for a key a locale lacks.
const I18n = new I18nJs({ en });
const loadedLocales = new Set(['en']);

I18n.enableFallback = true;
// Placeholders are `{{name}}` or `%{name}` with a plain name. The i18n-js
// default also takes `%{{name}}`, Turkish's "%20" style, as a placeholder
// named `{name` and renders `[missing "%{{name}}" value]`.
I18n.placeholder = /(?:\{\{|%\{)([\w.]+)\}\}?/gm;
I18n.defaultLocale = 'en';

const SUPPORTED_LOCALES = Object.keys(LOCALE_LOADERS);

/** Hand i18n-js a supported locale's strings, once. */
function loadLocale(locale: string) {
  if (loadedLocales.has(locale)) return;
  const load = LOCALE_LOADERS[locale];
  if (!load) return;
  loadedLocales.add(locale);
  I18n.store({ [locale]: load() });
}

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
  zh: '简体中文',
  'zh-Hant': '繁體中文',
};

// Maps device language codes that differ from our locale keys to the right key.
// e.g. iOS reports 'tl' (Tagalog) for Filipino, and 'no' for generic Norwegian.
// Android API <21 reports BCP47 'in' for Indonesian (correct tag is 'id').
const LOCALE_ALIASES: Record<string, string> = {
  tl: 'fil',
  no: 'nb',
  in: 'id',
};

function normalizeLocale(input: string | null | undefined, regionCode?: string | null) {
  if (!input) return 'en';
  const parts = input.toLowerCase().replace(/_/g, '-').split('-');
  const base = parts[0];
  if (base === 'zh') {
    const hasTraditionalScript = parts.includes('hant');
    const hasSimplifiedScript = parts.includes('hans');
    const region = parts.find((part) => ['tw', 'hk', 'mo', 'cn', 'sg'].includes(part));
    const traditionalRegion = ['tw', 'hk', 'mo'].includes(
      region ?? regionCode?.toLowerCase() ?? '',
    );
    return hasTraditionalScript || (!hasSimplifiedScript && traditionalRegion) ? 'zh-Hant' : 'zh';
  }
  const resolved = LOCALE_ALIASES[base] ?? base;
  return SUPPORTED_LOCALES.includes(resolved) ? resolved : 'en';
}

function getLocaleLabel(locale: string) {
  return LOCALE_LABELS[locale] ?? locale;
}

function getDeviceLocale() {
  const locale = getLocales()[0];
  return normalizeLocale(locale?.languageTag ?? locale?.languageCode ?? 'en', locale?.regionCode);
}

/** Device ISO 3166-1 alpha-2 region code (e.g. "US", "MY"), or null. */
function getDeviceRegionCode(): string | null {
  return getLocales()[0]?.regionCode ?? null;
}

function setAppLocale(locale: string) {
  const next = normalizeLocale(locale);
  // i18n-js falls back from `zh-Hant` to `zh` before English, so the base
  // language has to be there too.
  const base = next.split('-')[0];
  if (base && base !== next) loadLocale(base);
  loadLocale(next);
  I18n.locale = next;
}

/**
 * Returns SUPPORTED_LOCALES sorted for the language picker:
 *   1. currentLocale  (user's active locale)
 *   2. 'en'           (always second, unless it IS the current locale)
 *   3. the rest in their default alphabetical order
 */
function orderedLocales(currentLocale: string): string[] {
  const pinned: string[] = [];
  if (SUPPORTED_LOCALES.includes(currentLocale)) {
    pinned.push(currentLocale);
  }
  if (currentLocale !== 'en') {
    pinned.push('en');
  }
  const rest = SUPPORTED_LOCALES.filter((l) => !pinned.includes(l));
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

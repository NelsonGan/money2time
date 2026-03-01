import { getLocales } from 'expo-localization';
import { I18n as I18nJs } from 'i18n-js';

import en from './locales/en';
import zh from './locales/zh';

const TRANSLATIONS = { en, zh } as const;
const I18n = new I18nJs(TRANSLATIONS);

I18n.enableFallback = true;
I18n.defaultLocale = 'en';

const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[];
const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

function normalizeLocale(input: string | null | undefined) {
  if (!input) return 'en';
  const lower = input.toLowerCase();
  const base = lower.split('-')[0] ?? lower;
  return SUPPORTED_LOCALES.includes(base as (typeof SUPPORTED_LOCALES)[number]) ? base : 'en';
}

function getLocaleLabel(locale: string) {
  return LOCALE_LABELS[locale] ?? locale;
}

function getDeviceLocale() {
  const locale = getLocales()[0];
  return normalizeLocale(locale?.languageTag ?? locale?.languageCode ?? 'en');
}

function setAppLocale(locale: string) {
  I18n.locale = normalizeLocale(locale);
}

setAppLocale(getDeviceLocale());

export { getDeviceLocale, getLocaleLabel, I18n, LOCALE_LABELS, setAppLocale, SUPPORTED_LOCALES };

import { I18n as I18nJs } from 'i18n-js';
import { getLocales } from 'expo-localization';

import en from './locales/en';

const TRANSLATIONS = { en } as const;
const I18n = new I18nJs(TRANSLATIONS);

I18n.enableFallback = true;
I18n.defaultLocale = 'en';

const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[];

function normalizeLocale(input: string | null | undefined) {
  if (!input) return 'en';
  const lower = input.toLowerCase();
  const base = lower.split('-')[0] ?? lower;
  return SUPPORTED_LOCALES.includes(base as (typeof SUPPORTED_LOCALES)[number]) ? base : 'en';
}

function getDeviceLocale() {
  const locale = getLocales()[0];
  return normalizeLocale(locale?.languageTag ?? locale?.languageCode ?? 'en');
}

function setAppLocale(locale: string) {
  I18n.locale = normalizeLocale(locale);
}

setAppLocale(getDeviceLocale());

export { I18n, SUPPORTED_LOCALES, getDeviceLocale, setAppLocale };

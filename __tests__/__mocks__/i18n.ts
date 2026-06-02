type Translations = Record<string, string>;

const translations: Translations = {
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
  'common.hour_unit': 'h',
  'common.minute_unit': 'm',
  'errors.generic_operation_failed': 'Operation failed',
  'errors.recurring_fallback_name': 'Recurring rule',
};

export const I18n = {
  locale: 'en',
  defaultLocale: 'en',
  t(key: string, options?: Record<string, unknown>): string {
    const template = translations[key];
    if (!template) return key;
    if (!options) return template;
    return Object.entries(options).reduce(
      (acc, [name, value]) => acc.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
      template,
    );
  },
};

export const SUPPORTED_LOCALES = [
  'da',
  'de',
  'en',
  'es',
  'fil',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'ms',
  'nb',
  'nl',
  'pl',
  'pt',
  'ru',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
  'zh',
];
export const LOCALE_LABELS: Record<string, string> = {
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
export function getDeviceLocale() {
  return 'en';
}
export function getLocaleLabel(locale: string) {
  return LOCALE_LABELS[locale] ?? locale;
}
export function setAppLocale(locale: string) {
  I18n.locale = locale;
}
export function orderedLocales(currentLocale: string): string[] {
  const pinned: string[] = [];
  if (SUPPORTED_LOCALES.includes(currentLocale)) {
    pinned.push(currentLocale);
  }
  if (currentLocale !== 'en') {
    pinned.push('en');
  }
  return [...pinned, ...SUPPORTED_LOCALES.filter((locale) => !pinned.includes(locale))];
}

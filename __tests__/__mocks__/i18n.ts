type Translations = Record<string, string>;

const translations: Translations = {
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
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

export const SUPPORTED_LOCALES = ['en', 'zh'];
export const LOCALE_LABELS: Record<string, string> = { en: 'English', zh: '中文' };
export function getDeviceLocale() {
  return 'en';
}
export function getLocaleLabel(locale: string) {
  return LOCALE_LABELS[locale] ?? locale;
}
export function setAppLocale(locale: string) {
  I18n.locale = locale;
}

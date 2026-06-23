import type { FeatureAnnouncement } from '../featureAnnouncements';

export const multiCurrencyAnnouncement: FeatureAnnouncement = {
  id: 'multi_currency_2026_06',
  i18nKey: 'multi_currency_update',
  announcementNumber: 5,
  releaseDate: '2026-06-23',
  pages: [
    { key: 'currency', accent: 'sky', visual: 'multiCurrency' },
    { key: 'redesign', accent: 'lavender', visual: 'redesign' },
    { key: 'app_lock', accent: 'primary', visual: 'appLock' },
  ],
};

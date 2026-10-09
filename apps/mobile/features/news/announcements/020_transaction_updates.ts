import type { FeatureAnnouncement } from '../featureAnnouncements';

export const transactionUpdatesAnnouncement: FeatureAnnouncement = {
  id: 'transaction_updates_2026_10',
  i18nKey: 'transaction_updates',
  announcementNumber: 20,
  releaseDate: '2026-10-02',
  pages: [
    {
      key: 'androidScreenshot',
      accent: 'primary',
      visual: 'androidScreenshot',
      platform: 'android',
    },
    { key: 'accountLabels', accent: 'sky', visual: 'accountLabels' },
    { key: 'amountSearch', accent: 'lavender', visual: 'amountSearch' },
  ],
};

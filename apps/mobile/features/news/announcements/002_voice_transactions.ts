import type { FeatureAnnouncement } from '../featureAnnouncements';

export const voiceTransactionsAnnouncement: FeatureAnnouncement = {
  id: 'voice_transactions_2026_06',
  i18nKey: 'voice_transactions',
  announcementNumber: 2,
  releaseDate: '2026-06-11',
  requiresCapability: 'voice',
  pages: [
    {
      key: 'say_it',
      accent: 'primary',
      visual: 'voice',
    },
  ],
};

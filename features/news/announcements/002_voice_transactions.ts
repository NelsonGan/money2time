import type { FeatureAnnouncement } from '../featureAnnouncements';

export const voiceTransactionsAnnouncement: FeatureAnnouncement = {
  id: 'voice_transactions_2026_06',
  announcementNumber: 2,
  title: 'Add Transactions by Voice',
  summary: 'Hold + and say it. "uber 30" becomes a logged expense.',
  releaseDate: '2026-06-11',
  requiresCapability: 'voice',
  pages: [
    {
      eyebrow: 'New',
      title: 'Just say it',
      body: 'Hold the + button and say it, like "uber 30" or "coffee 4.50". We pick up the amount and category for you, all on your phone.',
      accent: 'primary',
      visual: 'voice',
      cta: 'enableVoice',
      ctaLabel: 'Enable voice input',
    },
  ],
};

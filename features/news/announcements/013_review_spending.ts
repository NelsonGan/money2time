import type { FeatureAnnouncement } from '../featureAnnouncements';

export const reviewSpendingAnnouncement: FeatureAnnouncement = {
  id: 'review_spending_2026_08',
  i18nKey: 'review_spending',
  announcementNumber: 13,
  releaseDate: '2026-08-18',
  pages: [
    {
      key: 'recap',
      accent: 'primary',
      visual: 'review',
      cta: 'openReview',
    },
  ],
};

export default reviewSpendingAnnouncement;

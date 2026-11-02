import type { FeatureAnnouncement } from '../featureAnnouncements';

export const autoReviewInsightsInstalmentsAnnouncement: FeatureAnnouncement = {
  id: 'auto_review_insights_instalments_2026_11',
  i18nKey: 'auto_review_insights_instalments',
  announcementNumber: 23,
  releaseDate: '2026-11-03',
  pages: [
    {
      key: 'autoReview',
      accent: 'sky',
      visual: 'autoReview',
      cta: 'openNotificationReview',
    },
    { key: 'insights', accent: 'lavender', visual: 'insightsRedesign', cta: 'openInsights' },
    { key: 'instalments', accent: 'warning', visual: 'instalmentPlans', cta: 'openInstalments' },
  ],
};

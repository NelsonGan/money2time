import type { FeatureAnnouncement } from '../featureAnnouncements';

export const savingsGoalsAnnouncement: FeatureAnnouncement = {
  id: 'savings_goals_2026_07',
  i18nKey: 'savings_goals',
  announcementNumber: 10,
  releaseDate: '2026-07-25',
  pages: [
    { key: 'intro', accent: 'primary', visual: 'goals' },
    { key: 'more', accent: 'sky', visual: 'monthExport' },
  ],
};

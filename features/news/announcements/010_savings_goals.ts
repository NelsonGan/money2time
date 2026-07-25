import type { FeatureAnnouncement } from '../featureAnnouncements';

export const savingsGoalsAnnouncement: FeatureAnnouncement = {
  id: 'savings_goals_2026_07',
  i18nKey: 'savings_goals',
  announcementNumber: 10,
  releaseDate: '2026-07-25',
  // The savings-ring widget preview is the closest existing visual; hidePro
  // because goals themselves are not a Pro-only feature. (The modal has no
  // "no visual" branch — an unset visual falls back to the monthly widget.)
  pages: [{ key: 'intro', accent: 'primary', visual: 'savings', hidePro: true }],
};

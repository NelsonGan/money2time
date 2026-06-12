import type { FeatureAnnouncement } from '../featureAnnouncements';

export const homeWidgetsAnnouncement: FeatureAnnouncement = {
  id: 'home_widgets_2026_06',
  i18nKey: 'home_widgets',
  announcementNumber: 1,
  releaseDate: '2026-06-04',
  pages: [
    { key: 'overview', accent: 'primary', visual: 'monthly' },
    { key: 'quick_log', accent: 'primary', visual: 'quickAdd' },
    { key: 'week', accent: 'error', visual: 'weekly' },
    { key: 'month', accent: 'lavender', visual: 'calendar' },
    { key: 'savings', accent: 'success', visual: 'savings' },
    { key: 'trend', accent: 'success', visual: 'savingsHistory' },
  ],
};

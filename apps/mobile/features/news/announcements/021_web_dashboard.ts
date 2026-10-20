import type { FeatureAnnouncement } from '../featureAnnouncements';

export const webDashboardAnnouncement: FeatureAnnouncement = {
  id: 'web_dashboard_2026_10',
  i18nKey: 'web_dashboard',
  announcementNumber: 21,
  releaseDate: '2026-10-20',
  pages: [
    { key: 'webDashboard', accent: 'primary', visual: 'webDashboard', cta: 'openWebDashboard' },
    {
      key: 'notificationReview',
      accent: 'sky',
      visual: 'notificationReview',
      cta: 'openAutoLog',
    },
    { key: 'fasterScans', accent: 'success', visual: 'fasterScans' },
    { key: 'cardDesigns', accent: 'lavender', visual: 'cardDesigns', cta: 'openAccounts' },
    { key: 'bottomBar', accent: 'warning', visual: 'bottomBar', cta: 'openBottomBar' },
  ],
};

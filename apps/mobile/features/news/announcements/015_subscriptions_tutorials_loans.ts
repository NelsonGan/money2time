import type { FeatureAnnouncement } from '../featureAnnouncements';

export const subscriptionsTutorialsLoansAnnouncement: FeatureAnnouncement = {
  id: 'subscriptions_tutorials_loans_2026_08',
  i18nKey: 'subscriptions_tutorials_loans',
  announcementNumber: 15,
  releaseDate: '2026-08-28',
  pages: [
    {
      key: 'subscriptionLogos',
      accent: 'primary',
      visual: 'subscriptionLogos',
      cta: 'openRecurring',
    },
    {
      key: 'forecast',
      accent: 'sky',
      visual: 'recurringForecast',
      cta: 'openRecurring',
    },
    {
      key: 'tutorials',
      accent: 'lavender',
      visual: 'tutorials',
      cta: 'openTutorials',
    },
    {
      key: 'loanInstalments',
      accent: 'warning',
      visual: 'loanInstalment',
      cta: 'openAccounts',
    },
  ],
};

export default subscriptionsTutorialsLoansAnnouncement;

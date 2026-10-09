import type { FeatureAnnouncement } from '../featureAnnouncements';

export const proTrialAccountsAnnouncement: FeatureAnnouncement = {
  id: 'pro_trial_accounts_2026_09',
  i18nKey: 'pro_trial_accounts',
  announcementNumber: 18,
  releaseDate: '2026-09-15',
  pages: [
    {
      key: 'trial',
      accent: 'primary',
      visual: 'freeTrial',
      cta: 'openProPaywall',
    },
    {
      key: 'accounts',
      accent: 'success',
      visual: 'freeAccounts',
      cta: 'openAccounts',
    },
  ],
};

export default proTrialAccountsAnnouncement;

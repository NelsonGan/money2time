import type { FeatureAnnouncement } from '../featureAnnouncements';

export const loansWorkdaysFxMascotsAnnouncement: FeatureAnnouncement = {
  id: 'loans_workdays_fx_mascots_2026_08',
  i18nKey: 'loans_workdays_fx_mascots',
  announcementNumber: 14,
  releaseDate: '2026-08-23',
  pages: [
    {
      key: 'loans',
      accent: 'warning',
      visual: 'loanAccount',
      cta: 'openAccounts',
    },
    {
      key: 'workdays',
      accent: 'sky',
      visual: 'workingDays',
      cta: 'openHourlyValueSettings',
    },
    {
      key: 'exchangeRate',
      accent: 'success',
      visual: 'transactionFx',
      cta: 'openAddTransaction',
    },
    {
      key: 'mascots',
      accent: 'lavender',
      visual: 'mascots',
    },
  ],
};

export default loansWorkdaysFxMascotsAnnouncement;

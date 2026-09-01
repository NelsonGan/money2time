import type { FeatureAnnouncement } from '../featureAnnouncements';

export const monthCycleLiveEarningsAnnouncement: FeatureAnnouncement = {
  id: 'month_cycle_live_earnings_2026_09',
  i18nKey: 'month_cycle_live_earnings',
  announcementNumber: 16,
  releaseDate: '2026-09-01',
  pages: [
    {
      key: 'monthCycle',
      accent: 'sky',
      visual: 'monthCycle',
      cta: 'openFirstDayOfMonth',
    },
    {
      // A Live Activity is an iOS surface, so the page is dropped on Android
      // rather than gating the whole announcement, which would hide the three
      // pages that do apply there.
      key: 'liveEarnings',
      accent: 'primary',
      visual: 'liveEarnings',
      cta: 'openLiveEarnings',
      platform: 'ios',
    },
    {
      key: 'appIcon',
      accent: 'lavender',
      visual: 'appIcon',
      cta: 'openAppIcon',
    },
    {
      key: 'loanInterest',
      accent: 'warning',
      visual: 'loanInterest',
      cta: 'openAccounts',
    },
  ],
};

export default monthCycleLiveEarningsAnnouncement;

import type { FeatureAnnouncement } from '../featureAnnouncements';

export const cloudSyncLedgersAnnouncement: FeatureAnnouncement = {
  id: 'cloud_sync_ledgers_2026_10',
  i18nKey: 'cloud_sync_ledgers',
  announcementNumber: 22,
  releaseDate: '2026-10-29',
  pages: [
    { key: 'cloudSync', accent: 'primary', visual: 'cloudSync', cta: 'openCloudSync' },
    { key: 'ledgers', accent: 'sky', visual: 'ledgers', cta: 'openLedgers' },
    { key: 'sharedLedgers', accent: 'success', visual: 'sharedLedgers', cta: 'openLedgers' },
  ],
};

import type { FeatureAnnouncement } from '../featureAnnouncements';

// Cloud Sync and shared ledgers open to everyone (the allow list is gone),
// with the Household insights page shared ledgers bring. Announcement 22 kept
// to ledgers while these were allow-listed.
export const cloudSyncSharedLedgersAnnouncement: FeatureAnnouncement = {
  id: 'cloud_sync_shared_ledgers_2026_11',
  i18nKey: 'cloud_sync_shared_ledgers',
  announcementNumber: 24,
  releaseDate: '2026-11-04',
  pages: [
    { key: 'cloudSync', accent: 'primary', visual: 'cloudSync', cta: 'openCloudSync' },
    { key: 'sharedLedgers', accent: 'success', visual: 'sharedLedgers', cta: 'openLedgers' },
    { key: 'household', accent: 'lavender', visual: 'householdInsights' },
  ],
};

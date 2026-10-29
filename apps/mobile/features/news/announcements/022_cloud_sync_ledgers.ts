import type { FeatureAnnouncement } from '../featureAnnouncements';

// Ledgers only: Cloud Sync and shared ledgers are behind the `cloud_sync`
// allow-list flag (see useCloudSyncEnabled), so the announcement leaves them
// out. It keeps its id, so a phone that already showed it won't show it again.
export const cloudSyncLedgersAnnouncement: FeatureAnnouncement = {
  id: 'cloud_sync_ledgers_2026_10',
  i18nKey: 'cloud_sync_ledgers',
  announcementNumber: 22,
  releaseDate: '2026-10-29',
  pages: [{ key: 'ledgers', accent: 'sky', visual: 'ledgers', cta: 'openLedgers' }],
};

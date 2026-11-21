import type { FeatureAnnouncement } from '../featureAnnouncements';

// Free receipt scans raised to 20 per calendar month (#776) and transaction
// location tagging with the Spending map (#779).
export const freeScansLocationsAnnouncement: FeatureAnnouncement = {
  id: 'free_scans_locations_2026_11',
  i18nKey: 'free_scans_locations',
  announcementNumber: 27,
  releaseDate: '2026-11-21',
  pages: [
    { key: 'freeScans', accent: 'success', visual: 'freeScans', cta: 'openScanReceipt' },
    { key: 'locations', accent: 'primary', visual: 'locationTagging', cta: 'openLocations' },
  ],
};

import type { FeatureAnnouncement } from '../featureAnnouncements';

// Transaction location tagging with the Spending map (#779). It also announced
// 20 free receipt scans a month (#776) until free scans went back to a
// lifetime 20 on 2026-11-27; the id stays so it does not show again to anyone
// who already saw it.
export const locationTaggingAnnouncement: FeatureAnnouncement = {
  id: 'free_scans_locations_2026_11',
  i18nKey: 'location_tagging',
  announcementNumber: 27,
  releaseDate: '2026-11-21',
  pages: [{ key: 'locations', accent: 'primary', visual: 'locationTagging', cta: 'openLocations' }],
};

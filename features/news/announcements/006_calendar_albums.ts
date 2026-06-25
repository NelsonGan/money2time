import type { FeatureAnnouncement } from '../featureAnnouncements';

export const calendarAlbumsAnnouncement: FeatureAnnouncement = {
  id: 'calendar_albums_2026_06',
  i18nKey: 'calendar_albums_update',
  announcementNumber: 6,
  releaseDate: '2026-06-25',
  pages: [
    { key: 'calendar', accent: 'primary', visual: 'calendar', hidePro: true },
    { key: 'albums', accent: 'success', visual: 'albums' },
  ],
};

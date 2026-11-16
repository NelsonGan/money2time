import type { FeatureAnnouncement } from '../featureAnnouncements';

// The 1.8.0 release: splitting a bill a friend paid (#722), splitting by
// percentage, shares or adjustment (#748) and album icons (#755).
export const splitBillsAlbumIconsAnnouncement: FeatureAnnouncement = {
  id: 'split_bills_album_icons_2026_11',
  i18nKey: 'split_bills_album_icons',
  announcementNumber: 26,
  releaseDate: '2026-11-16',
  pages: [
    { key: 'friendPaid', accent: 'success', visual: 'splitFriendPaid', cta: 'openSettleUp' },
    { key: 'splitMethods', accent: 'primary', visual: 'splitMethods', cta: 'openAddTransaction' },
    { key: 'albumIcons', accent: 'lavender', visual: 'albumIcons', cta: 'openAlbums' },
  ],
};

import type { FeatureAnnouncement } from '../featureAnnouncements';

export const receiptSplitAnnouncement: FeatureAnnouncement = {
  id: 'receipt_split_2026_07',
  i18nKey: 'receipt_split_update',
  announcementNumber: 8,
  releaseDate: '2026-07-14',
  pages: [
    { key: 'split', accent: 'primary', visual: 'receiptSplit' },
    {
      key: 'selector',
      accent: 'primary',
      visual: 'addSplitSelector',
      cta: 'openQuickEntrySettings',
    },
  ],
};

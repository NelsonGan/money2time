import type { FeatureAnnouncement } from '../featureAnnouncements';

export const automationsAnnouncement: FeatureAnnouncement = {
  id: 'automations_2026_07',
  i18nKey: 'automations_update',
  announcementNumber: 9,
  releaseDate: '2026-07-18',
  // The three automations ride iOS Shortcuts, so this announcement is fully
  // scoped to devices that can run them: the auto-popup is gated here, and the
  // News list drops it too (see NewsScreen). Android never sees it.
  requiresCapability: 'autoLog',
  pages: [{ key: 'auto', accent: 'primary', visual: 'autoLog', cta: 'openAutoLog' }],
};

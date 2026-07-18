import type { FeatureAnnouncement } from '../featureAnnouncements';

export const automationsAnnouncement: FeatureAnnouncement = {
  id: 'automations_2026_07',
  i18nKey: 'automations_update',
  announcementNumber: 9,
  releaseDate: '2026-07-18',
  // The three automations ride iOS Shortcuts, so the auto-popup only fires on
  // devices that can actually run them. Still listed in News for everyone —
  // the copy says iOS only.
  requiresCapability: 'autoLog',
  pages: [{ key: 'auto', accent: 'primary', visual: 'autoLog', cta: 'openAutoLog' }],
};

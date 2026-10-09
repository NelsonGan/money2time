import type { FeatureAnnouncement } from '../featureAnnouncements';

export const googleDriveBackupAnnouncement: FeatureAnnouncement = {
  id: 'google_drive_backup_2026_07',
  i18nKey: 'google_drive_backup',
  announcementNumber: 11,
  releaseDate: '2026-07-27',
  pages: [
    {
      key: 'backup',
      accent: 'primary',
      visual: 'backup',
      cta: 'openAutoBackup',
      // Data is device-local, so walking past this page without a cloud target
      // is the one dismissal worth interrupting (same warning as onboarding).
      confirmDismiss: 'backup',
    },
  ],
};

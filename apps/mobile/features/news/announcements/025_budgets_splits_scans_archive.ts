import type { FeatureAnnouncement } from '../featureAnnouncements';

// Four features that shipped in November 2026 without an announcement: weekly
// and yearly budgets (#608), split bills paid back in parts (#682), scanning
// several receipts from the album (#689) and archived accounts (#678).
export const budgetsSplitsScansArchiveAnnouncement: FeatureAnnouncement = {
  id: 'budgets_splits_scans_archive_2026_11',
  i18nKey: 'budgets_splits_scans_archive',
  announcementNumber: 25,
  releaseDate: '2026-11-09',
  pages: [
    { key: 'budgets', accent: 'primary', visual: 'periodBudgets', cta: 'openBudget' },
    {
      key: 'partPayments',
      accent: 'success',
      visual: 'splitPartPayments',
      cta: 'openSettleUp',
    },
    { key: 'batchScan', accent: 'sky', visual: 'batchScan', cta: 'openScanReceipt' },
    { key: 'archive', accent: 'lavender', visual: 'archiveAccounts', cta: 'openAccounts' },
  ],
};

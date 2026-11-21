import { I18n } from '~/lib/i18n';
import type { ImportResult } from '~/services/dataManagementService';

/**
 * The body of a successful restore's alert: `successKey`'s message, or the
 * still-syncing one, then how many photos the backup's target no longer had.
 */
export function restoreResultMessage(result: ImportResult, successKey: string): string {
  const message = I18n.t(result.syncPending ? 'backup_restore.sync_pending' : successKey);
  const missing = result.missingPhotos ?? 0;
  return missing > 0
    ? `${message}\n\n${I18n.t('backup_restore.photos_missing', { count: missing })}`
    : message;
}

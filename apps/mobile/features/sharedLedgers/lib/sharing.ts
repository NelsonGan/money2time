// Shared-ledger limits and messages. The Worker enforces the same limits
// (apps/cloudflare/workers/cloud-sync/src/ledgers.ts).

import { errorMessage } from '~/features/cloudSync/lib/messages';
import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import { I18n } from '~/lib/i18n';

/** Ledgers one Pro user can share at a time: each is a cloud database of its own. */
export const MAX_SHARED_LEDGERS = 2;
/** People in one shared ledger besides its owner. */
export const MAX_MEMBERS = 5;

/** The message for an error from a sharing action or (`join`) the join screen. */
export function sharingErrorMessage(error: unknown, context: 'share' | 'join' = 'share'): string {
  if (error instanceof CloudSyncApiError) {
    switch (error.code) {
      case 'limit_reached':
        return I18n.t('shared_ledgers.limit_reached', { max: MAX_SHARED_LEDGERS });
      case 'full':
        return context === 'join'
          ? I18n.t('shared_ledgers.join_full')
          : I18n.t('shared_ledgers.full', { max: MAX_MEMBERS });
      case 'not_found':
        return I18n.t('shared_ledgers.join_invalid');
      case 'ledger_paused':
        return I18n.t('shared_ledgers.join_paused');
      case 'own_ledger':
        return I18n.t('shared_ledgers.join_own');
      case 'unsent_changes':
        return I18n.t('shared_ledgers.leave_unsent');
      case 'not_pro':
        return I18n.t('cloud_sync.not_pro_body');
      default:
        break;
    }
  }
  return errorMessage(error);
}

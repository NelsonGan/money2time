import { Alert } from 'react-native';

import { runAskingIfUnsent } from '~/features/cloudSync/lib/unsentPrompt';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/** "Leave <ledger>?" for a member, then `onLeave` on Leave. */
export function confirmLeaveLedger(name: string, ownerName: string, onLeave: () => void) {
  void triggerHaptic('warning');
  Alert.alert(
    I18n.t('shared_ledgers.leave_title', { name }),
    I18n.t('shared_ledgers.leave_message', { owner: ownerName }),
    [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      { text: I18n.t('shared_ledgers.leave'), style: 'destructive', onPress: onLeave },
    ],
  );
}

/**
 * Leaves, asking first while the ledger holds entries not sent yet: they go
 * with it. Resolves false when the user stays.
 */
export function leaveAskingFirst(
  leave: (opts?: { force?: boolean }) => Promise<void>,
  name: string,
): Promise<boolean> {
  return runAskingIfUnsent(leave, {
    title: I18n.t('shared_ledgers.leave_title', { name }),
    message: I18n.t('shared_ledgers.leave_unsent'),
    anyway: I18n.t('shared_ledgers.leave_anyway'),
  });
}

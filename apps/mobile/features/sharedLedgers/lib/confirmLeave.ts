import { Alert } from 'react-native';

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

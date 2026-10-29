// Sign out and Leave refuse while a ledger shared with the user holds entries
// not sent yet (`unsent_changes`): the ledger, and those entries, would leave
// the phone. The user decides.

import { Alert } from 'react-native';

import { CloudSyncApiError } from '../services/cloudSyncApi';

/**
 * Runs `action`; when it refuses over unsent entries, asks with `prompt` and
 * runs it again with `force` if the user goes ahead. Resolves false when the
 * user stops.
 */
export async function runAskingIfUnsent(
  action: (opts?: { force?: boolean }) => Promise<void>,
  prompt: { title: string; message: string; anyway: string; cancel: string },
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    if (!(error instanceof CloudSyncApiError && error.code === 'unsent_changes')) throw error;
  }
  const anyway = await new Promise<boolean>((resolve) =>
    Alert.alert(
      prompt.title,
      prompt.message,
      [
        { text: prompt.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: prompt.anyway, style: 'destructive', onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    ),
  );
  if (anyway) await action({ force: true });
  return anyway;
}

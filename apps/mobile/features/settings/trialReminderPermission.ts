import { Alert, Linking } from 'react-native';

import { I18n } from '~/lib/i18n';
import { getPermissionState, requestPermissions } from '~/services/notifications';
import { runAfterInteractions } from '~/utils/interactions';

import { TRIAL_REMINDER_LEAD_DAYS, trialReminderPermissionStep } from './lib/trialTimeline';

/**
 * After a free trial starts, make sure the phone may show the reminder before
 * the first charge (README › Trial-aware paywall › Trial timeline and
 * reminder). A member who never answered, or one Android still lets the app
 * ask again, gets the system prompt straight away: the paywall's timeline has
 * just promised the reminder. A member who refused for good (iOS asks only
 * once) gets one alert offering Settings. Resolves once the member has
 * answered, so the caller can show its next prompt without stacking.
 */
export async function ensureTrialReminderPermission(): Promise<void> {
  const step = trialReminderPermissionStep(await getPermissionState());
  if (step === 'none') return;
  // Let the paywall finish closing first: a dialog raised during a modal's
  // dismiss can be lost or leave the screen untouchable on iOS.
  await new Promise<void>((resolve) => {
    runAfterInteractions(() => setTimeout(resolve, 400));
  });
  if (step === 'ask') {
    await requestPermissions();
    return;
  }
  const openSettings = await new Promise<boolean>((resolve) => {
    Alert.alert(
      I18n.t('pro.trial_reminder_settings_title'),
      I18n.t('pro.trial_reminder_settings_body', { count: TRIAL_REMINDER_LEAD_DAYS }),
      [
        { text: I18n.t('pro.not_now'), style: 'cancel', onPress: () => resolve(false) },
        { text: I18n.t('notifications.open_settings'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  // Coming back from Settings refreshes the Pro status, and that sync
  // schedules the reminder once notifications are allowed.
  if (openSettings) await Linking.openSettings();
}

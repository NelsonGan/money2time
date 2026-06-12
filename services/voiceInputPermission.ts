import { Alert, Linking } from 'react-native';

import { I18n } from '~/lib/i18n';

import { getSpeechPermissions, requestSpeechPermissions } from './speechRecognition';

/**
 * Ensure microphone + speech-recognition permission for voice input, prompting
 * the user if it hasn't been asked yet. When permission is denied, shows the
 * standard "open Settings" alert.
 *
 * @returns true when permission is granted and voice input may be enabled.
 */
export async function ensureVoiceInputPermission(): Promise<boolean> {
  const current = await getSpeechPermissions();
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    const requested = await requestSpeechPermissions();
    granted = requested.granted;
  }
  if (!granted) {
    Alert.alert(
      I18n.t('settings.quick_entry.voice.permission_denied_title'),
      I18n.t('settings.quick_entry.voice.permission_denied_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('settings.quick_entry.voice.open_settings'),
          onPress: () => void Linking.openSettings(),
        },
      ],
    );
  }
  return granted;
}

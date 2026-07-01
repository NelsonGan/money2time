import { Linking, Platform } from 'react-native';

/**
 * Opens the platform's native subscription-management screen so the user can
 * cancel or change their subscription. There is no in-app API for this — both
 * stores require the user to manage subscriptions in their account settings.
 */
export function openStoreSubscriptions() {
  if (Platform.OS === 'ios') {
    void Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    void Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}

import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import {
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { I18n } from '~/lib/i18n';

import { CLOUD_SYNC_ART } from '../components/art';
import { SignInGate, useSignedIn } from '../components/SignInGate';

/**
 * Settings > profile card > Sign in: the account sign-in on its own, for
 * everyone, Pro or not. Goes back to Settings once signed in (after a Pro
 * user's choice between this phone and the cloud copy).
 */
export function SignInScreen({ onBack }: { onBack: () => void }) {
  const signedIn = useSignedIn();
  const bottomNavInset = useSettingsBottomNavInset();

  // Once: `onBack` is a new function on every render of the stack.
  const leftRef = useRef(false);
  useEffect(() => {
    if (!signedIn || leftRef.current) return;
    leftRef.current = true;
    onBack();
  }, [signedIn, onBack]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('settings.account_sign_in')}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
        // The email form's button stays above the keyboard on small phones.
        automaticallyAdjustKeyboardInsets
      >
        <SignInGate prompt={I18n.t('settings.account_sign_in_prompt')} art={CLOUD_SYNC_ART} />
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingTop: 4,
  },
});

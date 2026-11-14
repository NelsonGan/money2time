import { ChevronRight, CircleUserRound, Cloud } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { useCloudSync } from '../CloudSyncContext';
import { AccountActions } from '../components/AccountActions';
import { CLOUD_SYNC_ART } from '../components/art';
import { AccountFaq } from '../components/CloudSyncFaq';
import { SignInGate } from '../components/SignInGate';
import { profileSyncState } from '../lib/profileStatus';

/**
 * Settings > profile card > Account: the one place the account is managed.
 * Signed out, the sign-in options (a sign-in leaves Cloud Sync off). Signed
 * in, the email, a link to Cloud Sync, Sign out and Delete account. Signing
 * in or out here goes back to Settings, whose profile card shows the change.
 */
export function AccountScreen({
  onBack,
  onOpenCloudSync,
}: {
  onBack: () => void;
  onOpenCloudSync: () => void;
}) {
  const sync = useCloudSync();
  const bottomNavInset = useSettingsBottomNavInset();
  const hasAccount = sync.user !== null && sync.status !== 'signedOut';

  // Once, on the change: `onBack` is a new function on every render of the stack.
  const openedWithRef = useRef(hasAccount);
  const leftRef = useRef(false);
  useEffect(() => {
    if (hasAccount === openedWithRef.current || leftRef.current) return;
    leftRef.current = true;
    onBack();
  }, [hasAccount, onBack]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t(hasAccount ? 'settings.account_title' : 'settings.account_sign_in')}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
        // The email form's button stays above the keyboard on small phones.
        automaticallyAdjustKeyboardInsets
      >
        {hasAccount ? (
          <SignedInAccount onOpenCloudSync={onOpenCloudSync} />
        ) : (
          <SignInGate prompt={I18n.t('settings.account_sign_in_prompt')} art={CLOUD_SYNC_ART} />
        )}
        <AccountFaq />
      </ScrollView>
    </SettingsPageLayout>
  );
}

function SignedInAccount({ onOpenCloudSync }: { onOpenCloudSync: () => void }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const state = profileSyncState(sync);
  const syncStatus = state?.statusKey ? I18n.t(`cloud_sync.${state.statusKey}`) : null;

  return (
    <View className="gap-4 pt-2">
      <Card className="px-4 py-0">
        <View style={styles.row}>
          <CircleUserRound size={20} color={colors.textSoft} />
          <Text
            {...REPLAY_PRIVATE}
            variant="body"
            numberOfLines={1}
            ellipsizeMode="middle"
            className="flex-1"
          >
            {sync.user?.email ?? ''}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            syncStatus
              ? I18n.t('cloud_sync.profile_a11y_label', { status: syncStatus })
              : I18n.t('cloud_sync.tile_label')
          }
          testID="account-cloud-sync"
          onPress={() => {
            void triggerHaptic('selection');
            onOpenCloudSync();
          }}
          style={styles.row}
          className="active:opacity-70"
        >
          <Cloud size={20} color={colors.textSoft} />
          <Text variant="body" className="flex-1">
            {I18n.t('cloud_sync.tile_label')}
          </Text>
          {syncStatus ? (
            <Text variant="body" tone="muted">
              {syncStatus}
            </Text>
          ) : null}
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </Card>
      <AccountActions />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  divider: { height: StyleSheet.hairlineWidth },
});

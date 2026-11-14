import { ChevronRight, CircleUserRound } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';

import { useCloudSync, useCloudSyncEnabled } from '../CloudSyncContext';
import { useConfirmSignOut } from './AccountActions';

/**
 * The account line at the foot of the Settings profile card: who is signed in
 * with a quiet Sign out, or a Sign in link. Hidden in builds without Cloud Sync
 * and while the session loads, so it never flashes the wrong state.
 */
export function ProfileAccountRow({ onSignIn }: { onSignIn: () => void }) {
  const enabled = useCloudSyncEnabled();
  const { status, user } = useCloudSync();
  const signOut = useConfirmSignOut();
  const colors = useThemeColors();

  if (!enabled || status === 'unavailable' || status === 'loading') return null;

  if (status === 'signedOut') {
    return (
      <Footer>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('settings.account_sign_in')}
          testID="settings-profile-sign-in"
          hitSlop={8}
          onPress={() => {
            void triggerHaptic('selection');
            onSignIn();
          }}
          className="flex-1 flex-row items-center gap-2.5 active:opacity-70"
        >
          <CircleUserRound size={18} color={colors.textMuted} />
          <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
            {I18n.t('settings.account_signed_out')}
          </Text>
          <Text variant="caption" style={{ color: colors.primary, fontFamily: FONT.bold }}>
            {I18n.t('settings.account_sign_in')}
          </Text>
          <ChevronRight size={15} color={colors.primary} strokeWidth={2.4} />
        </Pressable>
      </Footer>
    );
  }

  return (
    <Footer>
      <View
        className="flex-1 flex-row items-center gap-2.5"
        accessible
        accessibilityLabel={
          user?.email ? I18n.t('settings.account_signed_in_a11y', { email: user.email }) : undefined
        }
      >
        <CircleUserRound size={18} color={colors.textMuted} />
        {user?.email ? (
          <Text
            {...REPLAY_PRIVATE}
            variant="caption"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="middle"
            className="flex-1"
          >
            {user.email}
          </Text>
        ) : (
          <View className="flex-1" />
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={I18n.t('cloud_sync.sign_out')}
        accessibilityState={{ busy: signOut.busy }}
        testID="settings-profile-sign-out"
        hitSlop={8}
        disabled={signOut.busy}
        onPress={() => {
          void triggerHaptic('selection');
          signOut.confirm();
        }}
        className="ml-3 min-h-[20px] justify-center active:opacity-70"
      >
        {signOut.busy ? (
          <LoadingDots size="tiny" color={colors.textMuted} />
        ) : (
          <Text variant="caption" tone="muted" style={{ fontFamily: FONT.semibold }}>
            {I18n.t('cloud_sync.sign_out')}
          </Text>
        )}
      </Pressable>
    </Footer>
  );
}

/** A hairline, then the row, closing the card. */
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <>
      <View className="mt-4 h-px bg-border/40" />
      <View className="-mb-1 mt-3.5 flex-row items-center">{children}</View>
    </>
  );
}

import * as AppleAuthentication from 'expo-apple-authentication';
import { Mail } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { usePro } from '~/context/ProContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import { useCloudSync } from '../CloudSyncContext';
import { errorMessage, kindMessage } from '../lib/messages';
import { NATIVE_PROVIDERS, type NativeProvider } from '../services/nativeSignIn';
import { CLOUD_SYNC_ART } from './art';
import { EmailSignInForm } from './EmailSignInForm';
import { GoogleGIcon } from './GoogleGIcon';

/** The sign-in options. Cloud Sync is Pro: a free user tapping one gets the paywall. */
export function SignedOutView({
  onOpenProPaywall,
}: {
  onOpenProPaywall: (source: string) => void;
}) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const { isPro, isStatusKnown } = usePro();
  const [available, setAvailable] = useState<Record<NativeProvider, boolean>>({
    apple: false,
    google: false,
  });
  const [busy, setBusy] = useState<NativeProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      NATIVE_PROVIDERS.apple.isAvailable(),
      NATIVE_PROVIDERS.google.isAvailable(),
    ]).then(([apple, google]) => {
      if (!cancelled) setAvailable({ apple, google });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Unknown Pro status (still loading) lets the sign-in through: the Worker
  // checks Pro again before anything syncs.
  const needsPro = isStatusKnown && !isPro;
  const openPaywall = () => onOpenProPaywall('cloud_sync');

  const signIn = async (provider: NativeProvider) => {
    if (needsPro) {
      openPaywall();
      return;
    }
    setError(null);
    setBusy(provider);
    try {
      await sync.signInWithNative(provider);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (emailMode) return <EmailSignInForm onCancel={() => setEmailMode(false)} />;

  const shownError = error ?? (sync.lastError ? kindMessage(sync.lastError) : null);

  return (
    <View>
      <Hero />

      <View className="mt-10 gap-3">
        {available.apple ? (
          // Apple's own button, as its guidelines ask.
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              resolvedTheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={18}
            style={[styles.button, busy !== null && styles.dimmed]}
            onPress={() => {
              if (!busy) void signIn('apple');
            }}
          />
        ) : null}
        {available.google ? (
          <ProviderButton
            label={I18n.t('cloud_sync.continue_google')}
            icon={<GoogleGIcon size={20} />}
            loading={busy === 'google'}
            disabled={busy !== null}
            onPress={() => void signIn('google')}
          />
        ) : null}
        <ProviderButton
          label={I18n.t('cloud_sync.continue_email')}
          icon={<Mail size={20} color={colors.text} />}
          disabled={busy !== null}
          onPress={() => {
            if (needsPro) {
              openPaywall();
              return;
            }
            setError(null);
            setEmailMode(true);
          }}
        />
      </View>

      {shownError ? (
        <Text variant="caption" tone="error" className="mt-4 text-center">
          {shownError}
        </Text>
      ) : null}
    </View>
  );
}

function Hero() {
  return (
    <View className="items-center gap-2 pt-1">
      <Image source={CLOUD_SYNC_ART} style={styles.hero} resizeMode="contain" accessible={false} />
      <Text variant="title" className="mt-1 text-center">
        {I18n.t('cloud_sync.hero_title')}
      </Text>
    </View>
  );
}

function ProviderButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        triggerHaptic('selection');
        onPress();
      }}
      // A plain style array: NativeWind's Pressable drops function styles.
      style={[
        styles.button,
        styles.outline,
        { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.14) },
        disabled && styles.dimmed,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.text} /> : icon}
      <Text variant="bodyStrong">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { width: 280, height: 140 },
  button: { height: 54, width: '100%' },
  outline: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dimmed: { opacity: 0.6 },
});

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
import { AppleLogoIcon } from './AppleLogoIcon';
import { CLOUD_SYNC_ART } from './art';
import { EmailSignInForm } from './EmailSignInForm';
import { GoogleGIcon } from './GoogleGIcon';

/**
 * The sign-in options. Cloud Sync is Pro: a free user tapping one gets the
 * paywall, except when signing in to join a shared ledger (`allowWithoutPro`).
 */
export function SignedOutView({ hideHero = false }: { hideHero?: boolean }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
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

  // Anyone can sign in, Pro or not: Pro bought on another phone that signed
  // in to the same account unlocks this one (services/accountPro.ts), and a
  // free account shows Get Pro after the sign-in.
  const signIn = async (provider: NativeProvider) => {
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
      {hideHero ? null : <Hero showProHint={isStatusKnown && !isPro} />}

      <View className={hideHero ? 'mt-2 gap-3' : 'mt-10 gap-3'}>
        {available.apple ? (
          <ProviderButton
            apple
            label={I18n.t('cloud_sync.continue_apple')}
            loading={busy === 'apple'}
            disabled={busy !== null}
            onPress={() => void signIn('apple')}
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

function Hero({ showProHint }: { showProHint: boolean }) {
  return (
    <View className="items-center gap-2 pt-1">
      <Image source={CLOUD_SYNC_ART} style={styles.hero} resizeMode="contain" accessible={false} />
      <Text variant="title" className="mt-1 text-center">
        {I18n.t('cloud_sync.hero_title')}
      </Text>
      {showProHint ? (
        <Text variant="body" tone="muted" className="px-4 text-center">
          {I18n.t('cloud_sync.hero_body')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Continue with Apple is a custom button built to Apple's rules (Human
 * Interface Guidelines > Sign in with Apple): black in light mode and white in
 * dark, the logo and title in the other colour. Apple's own button sizes its
 * title from the button's height, larger than the other options' titles; this
 * one matches them. Its title is already in the system font: it shows on iOS
 * only, where the app's font is the system font.
 */
const APPLE_BUTTON = {
  light: { fill: '#000000', ink: '#FFFFFF' },
  dark: { fill: '#FFFFFF', ink: '#000000' },
} as const;

/** One sign-in option: outlined, or Apple's black or white one with `apple`. */
function ProviderButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  apple = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
} & ({ apple: true; icon?: undefined } | { apple?: false; icon: React.ReactNode })) {
  const colors = useThemeColors();
  const appleColors = APPLE_BUTTON[useResolvedTheme()];
  const [pressed, setPressed] = useState(false);
  const foreground = apple ? appleColors.ink : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        triggerHaptic('selection');
        onPress();
      }}
      // A plain style array: NativeWind's Pressable drops function styles.
      style={[
        styles.button,
        apple
          ? { backgroundColor: appleColors.fill }
          : [
              styles.outline,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.14) },
            ],
        pressed && styles.pressed,
        disabled && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : apple ? (
        <AppleLogoIcon color={foreground} />
      ) : (
        icon
      )}
      <Text variant="bodyStrong" style={apple ? { color: foreground } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { width: 280, height: 140 },
  button: {
    height: 54,
    width: '100%',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  outline: { borderWidth: 1 },
  pressed: { opacity: 0.8 },
  dimmed: { opacity: 0.6 },
});

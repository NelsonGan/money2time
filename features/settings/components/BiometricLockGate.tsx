import { Lock } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { Button, Text, ThemeModal } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { authenticateWithBiometrics, getBiometricLabel } from '~/services/biometricAuth';

/**
 * Full-screen biometric gate. When the Pro-only "App Lock" setting is on, the
 * app is covered by an opaque overlay that requires biometric/device auth to
 * dismiss — on launch and whenever the app returns from the background.
 *
 * Rendered through a Modal so it sits above every other native layer (including
 * any open RN Modal/sheet) and captures the Android hardware back button while
 * locked. Never locks when the setting is off; if the user is no longer Pro the
 * setting is turned off automatically so a lapsed subscriber is never locked out.
 */
export function BiometricLockGate({
  onLockStateChange,
}: {
  /** Reports whether the lock overlay is currently covering the app. Lets the
   * root suppress other modals (e.g. the feature announcement) while locked —
   * two simultaneously-presented native modals freeze touch input on iOS. */
  onLockStateChange?: (locked: boolean) => void;
} = {}) {
  const themeColors = useThemeColors();
  const { settings, updateSettings } = useApp();
  const { isPro, isLoading } = usePro();
  const enabled = settings.biometricLockEnabled;
  const delaySeconds = settings.biometricLockDelaySeconds;

  // Locked from the persisted intent so a Pro user's app is covered instantly
  // on cold start, before the (async) RevenueCat state resolves.
  const [locked, setLocked] = useState(enabled);
  const [label, setLabel] = useState('Biometrics');
  // Bumped each time the overlay should (re)prompt — covers returning to the
  // foreground while already locked, where `locked` doesn't change.
  const [promptToken, setPromptToken] = useState(0);
  // Tracks a genuine background trip. The OS biometric sheet only sends the app
  // to `inactive` (iOS) and never to `background`, so gating re-lock on this flag
  // avoids re-locking the instant a successful unlock returns to `active`.
  const wentToBackgroundRef = useRef(false);
  const backgroundedAtRef = useRef(0);
  const authingRef = useRef(false);
  // Read inside the AppState listener via a ref so changing the delay doesn't
  // resubscribe the listener.
  const delayMsRef = useRef(delaySeconds * 1000);
  useEffect(() => {
    delayMsRef.current = delaySeconds * 1000;
  }, [delaySeconds]);

  // Turn the feature off if the subscription has lapsed (confirmed, not loading).
  useEffect(() => {
    if (!isLoading && !isPro && enabled) {
      updateSettings({ biometricLockEnabled: false });
    }
  }, [enabled, isLoading, isPro, updateSettings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await getBiometricLabel();
      if (!cancelled) setLabel(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-lock when the app returns from a real background trip, but only once the
  // configured grace period has elapsed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        wentToBackgroundRef.current = true;
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next === 'active' && wentToBackgroundRef.current) {
        wentToBackgroundRef.current = false;
        // Skip the foreground event produced by the auth sheet itself (belt and
        // suspenders for platforms where the prompt briefly backgrounds the app).
        if (authingRef.current) return;
        if (!enabled) return;
        const awayMs = Date.now() - backgroundedAtRef.current;
        const shouldLock = delayMsRef.current <= 0 || awayMs >= delayMsRef.current;
        if (shouldLock) {
          setLocked(true);
          setPromptToken((token) => token + 1);
        }
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Clear any active lock the moment the feature is disabled.
  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  const runAuth = useCallback(async () => {
    if (authingRef.current) return;
    authingRef.current = true;
    try {
      const ok = await authenticateWithBiometrics(I18n.t('settings.app_lock.unlock_prompt'));
      if (ok) setLocked(false);
    } finally {
      authingRef.current = false;
    }
  }, []);

  const visible = enabled && locked;

  // Surface the overlay's presented state so the root can avoid co-presenting
  // another native modal on top of it.
  useEffect(() => {
    onLockStateChange?.(visible);
  }, [visible, onLockStateChange]);

  // Auto-prompt whenever the overlay is shown (and on each re-foreground while
  // locked). The short delay lets the OS settle on resume so the Face ID /
  // fingerprint sheet reliably appears.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void runAuth(), 300);
    return () => clearTimeout(timer);
  }, [visible, promptToken, runAuth]);

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      // Swallow the Android hardware back button so the user cannot navigate
      // underneath the lock.
      onRequestClose={() => {}}
    >
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: themeColors.background }}
      >
        <View
          style={{ backgroundColor: `${themeColors.primary}14` }}
          className="h-20 w-20 items-center justify-center rounded-full"
        >
          <Lock size={34} color={themeColors.primary} />
        </View>
        <Text variant="heading" className="mt-6 text-center">
          {I18n.t('settings.app_lock.locked_title')}
        </Text>
        <Text variant="friendly" tone="muted" className="mt-2 text-center">
          {I18n.t('settings.app_lock.locked_subtitle', { method: label })}
        </Text>
        <Button className="mt-8 w-full" onPress={() => void runAuth()}>
          <Text>{I18n.t('settings.app_lock.unlock_action')}</Text>
        </Button>
      </View>
    </ThemeModal>
  );
}

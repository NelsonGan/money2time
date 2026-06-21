import { Check, Fingerprint, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import {
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import {
  authenticateWithBiometrics,
  getBiometricAvailability,
  getBiometricLabel,
} from '~/services/biometricAuth';
import { triggerHaptic } from '~/services/haptics';

const TOAST_DURATION_MS = 3200;

interface AppLockScreenProps {
  onBack: () => void;
}

// Grace period (seconds) before the app re-locks after going to the background.
const DELAY_OPTIONS: { seconds: number; labelKey: string }[] = [
  { seconds: 0, labelKey: 'settings.app_lock.delay_immediately' },
  { seconds: 60, labelKey: 'settings.app_lock.delay_1m' },
  { seconds: 300, labelKey: 'settings.app_lock.delay_5m' },
  { seconds: 900, labelKey: 'settings.app_lock.delay_15m' },
  { seconds: 3600, labelKey: 'settings.app_lock.delay_1h' },
];

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: {
    height: 1,
    marginLeft: 16,
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});

export function AppLockScreen({ onBack }: AppLockScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const { settings, updateSettings } = useApp();
  const { isPro } = usePro();

  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextLabel = await getBiometricLabel();
      if (!cancelled) setBiometricLabel(nextLabel);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const enabled = settings.biometricLockEnabled;

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (busy) return;

      if (!next) {
        void triggerHaptic('selection');
        updateSettings({ biometricLockEnabled: false });
        return;
      }

      if (!isPro) {
        return;
      }

      setBusy(true);
      try {
        // Re-check against the OS at toggle time so the decision is never made
        // from a stale probe (e.g. the user enrolled/removed a biometric, or
        // tapped before the initial async check resolved).
        const current = await getBiometricAvailability();
        if (!current.available) {
          void triggerHaptic('warning');
          showToast(
            current.hardwareWithoutEnrollment
              ? I18n.t('settings.app_lock.not_enrolled_message')
              : I18n.t('settings.app_lock.no_hardware_message'),
          );
          return;
        }

        const ok = await authenticateWithBiometrics(I18n.t('settings.app_lock.enable_prompt'));
        if (ok) {
          void triggerHaptic('success');
          updateSettings({ biometricLockEnabled: true });
        } else {
          void triggerHaptic('warning');
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, isPro, showToast, updateSettings],
  );

  const delaySeconds = settings.biometricLockDelaySeconds;
  const handleSelectDelay = useCallback(
    (seconds: number) => {
      if (seconds === delaySeconds) return;
      void triggerHaptic('selection');
      updateSettings({ biometricLockDelaySeconds: seconds });
    },
    [delaySeconds, updateSettings],
  );

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('settings.app_lock.title')}
            subtitle={I18n.t('settings.app_lock.subtitle')}
          />

          <View className="mt-4">
            <View style={styles.card} className="bg-card border border-border/30">
              <View style={styles.row}>
                <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                  <Fingerprint size={18} color={themeColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground" numberOfLines={1}>
                    {I18n.t('settings.app_lock.toggle_label')}
                  </Text>
                  <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                    {I18n.t('settings.app_lock.toggle_subtitle', { method: biometricLabel })}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  disabled={busy || !isPro}
                  onValueChange={(v) => void handleToggle(v)}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                />
              </View>
            </View>
          </View>

          {enabled ? (
            <>
              <View className="mt-3 flex-row items-center gap-2 px-1">
                <ShieldCheck size={15} color={themeColors.primary} />
                <Text variant="caption" tone="muted" className="flex-1">
                  {I18n.t('settings.app_lock.enabled_hint', { method: biometricLabel })}
                </Text>
              </View>

              <View className="mt-6">
                <Text variant="caption" tone="muted" className="mb-2 px-1">
                  {I18n.t('settings.app_lock.delay_section')}
                </Text>
                <View style={styles.card} className="bg-card border border-border/30">
                  {DELAY_OPTIONS.map((option, index) => {
                    const selected = option.seconds === delaySeconds;
                    return (
                      <Pressable
                        key={option.seconds}
                        onPress={() => handleSelectDelay(option.seconds)}
                        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      >
                        {index > 0 ? (
                          <View
                            style={[styles.rowDivider, { backgroundColor: themeColors.border }]}
                          />
                        ) : null}
                        <View style={styles.optionRow}>
                          <Text
                            variant="body"
                            className={selected ? 'text-foreground' : 'text-muted-foreground'}
                          >
                            {I18n.t(option.labelKey)}
                          </Text>
                          {selected ? <Check size={18} color={themeColors.primary} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" tone="muted" className="mt-2 px-1">
                  {I18n.t('settings.app_lock.delay_hint')}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {toast ? (
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="none"
          style={[
            styles.toast,
            {
              // Sit below the header's back-button row so it never covers it.
              top: 64,
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Text variant="caption" className="text-foreground">
            {toast}
          </Text>
        </Animated.View>
      ) : null}
    </SettingsPageLayout>
  );
}

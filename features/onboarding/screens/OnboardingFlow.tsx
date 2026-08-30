import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text, ThemeModal } from '~/components/ui';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import { WageCalculatorFlowScreen } from '~/features/settings/screens';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n, setAppLocale } from '~/lib/i18n';
import { AnalyticsEvents, setUserProperties, trackEvent } from '~/services/analytics';
import {
  ensureGoogleSession,
  isGoogleDriveConfigured,
  isTargetAvailable,
  signInWithGoogle,
} from '~/services/autoBackup';
import { triggerHaptic } from '~/services/haptics';
import { requestPermissions } from '~/services/notifications';
import { type WageConfig } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';
import { monthKeyFromDateLocal } from '~/utils/formatters';

import { OnboardingBackupStep } from './OnboardingBackupStep';
import { OnboardingFeaturesStep } from './OnboardingFeaturesStep';
import { OnboardingNotificationsStep } from './OnboardingNotificationsStep';
import { OnboardingPreferencesStep } from './OnboardingPreferencesStep';
import { type AcquisitionSource, OnboardingSourceStep } from './OnboardingSourceStep';
import { OnboardingValuePropStep } from './OnboardingValuePropStep';
import { OnboardingWageStep } from './OnboardingWageStep';

type OnboardingStepId =
  | 'welcome'
  | 'basics'
  | 'wage'
  | 'backup'
  | 'source'
  | 'notifications'
  | 'features';

function withColorAlpha(hex: string, alpha: number) {
  const sanitized = hex.replace('#', '');

  if (sanitized.length !== 6) return hex;

  const red = parseInt(sanitized.slice(0, 2), 16);
  const green = parseInt(sanitized.slice(2, 4), 16);
  const blue = parseInt(sanitized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const {
    settings,
    accounts,
    categories,
    currentMonthWage,
    completeOnboarding,
    updateSettings,
    updateWageConfigForMonth,
  } = useApp();
  const themeColors = useThemeColors();

  const [step, setStep] = useState<OnboardingStepId>('welcome');
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  const [showWageCalculator, setShowWageCalculator] = useState(false);

  const wageIsSet = (currentMonthWage?.wageAmount ?? 0) > 0;

  const currentMonth = useMemo(() => monthKeyFromDateLocal(new Date()), []);

  const stepOrder: OnboardingStepId[] = [
    'welcome',
    'basics',
    'wage',
    'backup',
    'source',
    'notifications',
    'features',
  ];
  const visualStep = Math.max(1, stepOrder.indexOf(step) + 1);
  const totalVisualSteps = stepOrder.length;

  const prefillConfig: WageConfig =
    currentMonthWage && currentMonthWage.wageAmount > 0
      ? {
          wageType: currentMonthWage.wageType,
          wageAmount: currentMonthWage.wageAmount,
          hoursWorkedPerWeek: currentMonthWage.hoursWorkedPerWeek,
          workdaysPerWeek: currentMonthWage.workdaysPerWeek,
          commuteMinutesPerWorkday: currentMonthWage.commuteMinutesPerWorkday,
        }
      : {
          ...DEFAULT_WAGE_CONFIG,
        };

  const handleEnableBackup = useCallback(async () => {
    const target = Platform.OS === 'ios' ? 'icloud' : 'googleDrive';
    try {
      // Whether the destination is ready to receive a backup right now.
      let readyToBackUp = true;

      if (target === 'icloud') {
        // iCloud sign-in is a system-level action the app can't trigger, so we
        // never block onboarding on it. Turn backup on regardless; the
        // foreground auto-backup trigger in AppContext runs the first backup as
        // soon as iCloud Drive becomes available.
        readyToBackUp = await isTargetAvailable('icloud');
      } else {
        if (!isGoogleDriveConfigured()) {
          Alert.alert(
            I18n.t('auto_backup.google_drive_unconfigured_title'),
            I18n.t('auto_backup.google_drive_unconfigured_message'),
          );
          return;
        }
        // Google sign-in IS app-triggerable, so prompt for it inline. Bail only
        // if the user cancels or it errors out.
        if (!(await ensureGoogleSession())) {
          const result = await signInWithGoogle();
          if (!result.ok) {
            if (result.reason !== 'cancelled') {
              Alert.alert(
                I18n.t('auto_backup.google_drive_sign_in_failed_title'),
                result.message ?? '',
              );
            }
            return;
          }
        }
      }

      updateSettings({ autoBackupEnabled: true, autoBackupTarget: target });
      void triggerHaptic('success');
      void trackEvent(AnalyticsEvents.ONBOARDING_BACKUP_ENABLED, {
        target,
        pending: !readyToBackUp,
      });

      // Deliberately no immediate backup here. This step runs before any data
      // exists, so forcing one would upload an empty snapshot and stamp
      // lastAutoBackupAt — suppressing the real first backup for a day. The
      // due-based auto-backup in AppContext picks it up once onboarding leaves
      // the user with data, then follows the daily cadence.
      if (!readyToBackUp) {
        // iCloud not signed in yet — let the user know backup is on and will
        // start once they enable iCloud Drive, then advance anyway.
        Alert.alert(
          I18n.t('onboarding.backup.icloud_pending_title'),
          I18n.t('onboarding.backup.icloud_pending_message'),
        );
      }
      setStep('source');
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [updateSettings]);

  const handleSkipBackup = useCallback(() => {
    void trackEvent(AnalyticsEvents.ONBOARDING_BACKUP_SKIPPED, {
      target: Platform.OS === 'ios' ? 'icloud' : 'googleDrive',
    });
    setStep('source');
  }, []);

  const handleSourceContinue = useCallback(() => {
    if (!acquisitionSource) return;
    void trackEvent(AnalyticsEvents.ONBOARDING_SOURCE_SELECTED, { source: acquisitionSource });
    // Stamp the answer on the Mixpanel user profile so cohorts can be broken
    // down by acquisition channel.
    void setUserProperties({ acquisition_source: acquisitionSource });
    setStep('notifications');
  }, [acquisitionSource]);

  const handleFinish = useCallback(() => {
    try {
      const result = completeOnboarding({
        userMode: 'power',
        seedPowerDefaults: accounts.length === 0 && categories.length === 0,
      });

      if (result.createdCategories > 0 || result.createdAccounts > 0) {
        void triggerHaptic('success');
      } else {
        void triggerHaptic('selection');
      }
      onComplete();
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [accounts.length, categories.length, completeOnboarding, onComplete]);

  const renderProgressHeader = () => (
    <View
      className="px-5 pt-3 pb-2"
      accessibilityLabel={I18n.t('onboarding.flow.step_a11y', {
        step: visualStep,
        total: totalVisualSteps,
      })}
      accessibilityRole="header"
    >
      <Text variant="caption" tone="muted" className="text-center">
        {I18n.t('onboarding.progress_step_of', { step: visualStep, total: totalVisualSteps })}
      </Text>
      <View className="mt-1.5 flex-row items-center gap-2">
        {Array.from({ length: totalVisualSteps }, (_, index) => index + 1).map((i) => (
          <View
            key={i}
            className="flex-1 rounded-full"
            style={[
              styles.progressSegment,
              {
                backgroundColor:
                  visualStep >= i
                    ? themeColors.primary
                    : withColorAlpha(themeColors.backgroundSubtle, 0.45),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TabletContentContainer style={{ flex: 1 }}>
        {renderProgressHeader()}

        {step === 'welcome' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-welcome">
            <OnboardingValuePropStep
              currencySymbol={settings.currencySymbol}
              onGetStarted={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STARTED);
                setStep('basics');
              }}
            />
          </Animated.View>
        )}

        {step === 'basics' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-basics">
            <OnboardingPreferencesStep
              locale={settings.locale}
              currencyCode={settings.currencyCode}
              currencySymbol={settings.currencySymbol}
              themeColor={settings.themeColor}
              onLocaleChange={(locale) => {
                setAppLocale(locale);
                updateSettings({ locale });
              }}
              onCurrencyChange={({ code, symbol }) => {
                updateSettings({ currencyCode: code, currencySymbol: symbol });
              }}
              onThemeColorChange={(themeColor) => {
                updateSettings({ themeColor });
              }}
              onBack={() => setStep('welcome')}
              onContinue={() => setStep('wage')}
            />
          </Animated.View>
        )}

        {step === 'wage' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-wage">
            <OnboardingWageStep
              settings={settings}
              currentMonthWage={currentMonthWage}
              wageIsSet={wageIsSet}
              onBack={() => setStep('basics')}
              onContinue={() => setStep('backup')}
              onOpenWageCalculator={() => {
                void triggerHaptic('selection');
                setShowWageCalculator(true);
              }}
            />
          </Animated.View>
        )}

        {step === 'backup' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-backup">
            <OnboardingBackupStep
              onEnable={() => {
                void handleEnableBackup();
              }}
              onSkip={handleSkipBackup}
              onBack={() => setStep('wage')}
            />
          </Animated.View>
        )}

        {step === 'source' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-source">
            <OnboardingSourceStep
              selected={acquisitionSource}
              onSelect={setAcquisitionSource}
              onBack={() => setStep('backup')}
              onContinue={handleSourceContinue}
            />
          </Animated.View>
        )}

        {step === 'notifications' && (
          <Animated.View
            entering={FadeIn.duration(350)}
            className="flex-1"
            key="step-notifications"
          >
            <OnboardingNotificationsStep
              onEnable={async () => {
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_ENABLED);
                await requestPermissions();
                setStep('features');
              }}
              onSkip={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_SKIPPED);
                setStep('features');
              }}
              onBack={() => setStep('source')}
            />
          </Animated.View>
        )}

        {step === 'features' && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-features">
            <OnboardingFeaturesStep
              onBack={() => setStep('notifications')}
              onFinish={handleFinish}
            />
          </Animated.View>
        )}

        {/* Wage Calculator Modal */}
        <ThemeModal
          visible={showWageCalculator}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowWageCalculator(false)}
        >
          <WageCalculatorFlowScreen
            initialConfig={prefillConfig}
            settings={settings}
            monthLabel={currentMonth}
            onCancel={() => setShowWageCalculator(false)}
            onComplete={(config) => {
              updateWageConfigForMonth(currentMonth, config);
              setShowWageCalculator(false);
              void triggerHaptic('success');
            }}
          />
        </ThemeModal>
      </TabletContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressSegment: {
    height: 6,
  },
});

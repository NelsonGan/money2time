import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import { OnboardingTopBar } from '~/features/onboarding/components/OnboardingTopBar';
import {
  resolveStarterCountry,
  starterAccountSeeds,
  type StarterSelection,
} from '~/features/onboarding/lib/starterAccounts';
import { wageConfigOf } from '~/features/settings/lib/wageMonths';
import { getDeviceRegionCode, I18n, setAppLocale } from '~/lib/i18n';
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
import { financialMonthKeyForDate, monthCycleOf } from '~/utils/financialMonth';

import { initialStarterSelections, OnboardingAccountsStep } from './OnboardingAccountsStep';
import { OnboardingAutomationsStep } from './OnboardingAutomationsStep';
import { OnboardingBackupStep } from './OnboardingBackupStep';
import { OnboardingIncomeStep } from './OnboardingIncomeStep';
import { OnboardingNotificationsStep } from './OnboardingNotificationsStep';
import { OnboardingPreferencesStep } from './OnboardingPreferencesStep';
import { type AcquisitionSource, OnboardingSourceStep } from './OnboardingSourceStep';
import { OnboardingWelcomeStep } from './OnboardingWelcomeStep';

const STEP_ORDER = [
  'welcome',
  'basics',
  'wage',
  'accounts',
  'automations',
  'backup',
  'source',
  'notifications',
] as const;

type OnboardingStepId = (typeof STEP_ORDER)[number];

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

  const [step, setStep] = useState<OnboardingStepId>('welcome');
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  // The financial month, the one `currentMonthWage` and Settings › Hourly
  // value read: with a cycle starting on the 25th, the 20th belongs to the
  // month before.
  const monthCycle = monthCycleOf(settings);
  const currentMonth = useMemo(
    () => financialMonthKeyForDate(new Date(), monthCycle),
    [monthCycle],
  );

  // The income step edits a draft; it is saved when the user continues, never
  // on each keystroke.
  const [wageDraft, setWageDraft] = useState<WageConfig>(() =>
    currentMonthWage && currentMonthWage.wageAmount > 0
      ? wageConfigOf(currentMonthWage)
      : { ...DEFAULT_WAGE_CONFIG },
  );
  const savedHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  // The accounts step's picks, kept here so going back and forth keeps them.
  // After a skip, onboarding ends with the starter set instead.
  const [starterSelections, setStarterSelections] =
    useState<StarterSelection[]>(initialStarterSelections);
  const [starterAccountsSkipped, setStarterAccountsSkipped] = useState(false);
  // The step opens on the user's own country, which follows the currency
  // picked in basics until the flag picks another one.
  const [pickedStarterCountry, setPickedStarterCountry] = useState<string | null>(null);
  const ownCountry = useMemo(
    () =>
      resolveStarterCountry({
        currencyCode: settings.currencyCode,
        regionCode: getDeviceRegionCode(),
      }),
    [settings.currencyCode],
  );
  const starterCountry = pickedStarterCountry ?? ownCountry;
  // The logo pickers open on the country the step ended on, so a country
  // browsed before onboarding does not outlive it.
  const leaveAccountsStep = () => {
    if (settings.accountLogoCountry !== starterCountry) {
      updateSettings({ accountLogoCountry: starterCountry });
    }
    setStep('automations');
  };

  // The welcome page has no top bar, so the bar counts the steps after it.
  const stepIndex = STEP_ORDER.indexOf(step);
  const goBack = useCallback(() => {
    const previous = STEP_ORDER[STEP_ORDER.indexOf(step) - 1];
    if (previous) setStep(previous);
  }, [step]);

  // Android's back button and back gesture go to the previous step, as the
  // chevron does; they used to close the app mid-setup. On the welcome page
  // they still leave the app.
  useEffect(() => {
    if (step === 'welcome') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, step]);

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
    // Stamp the answer on the PostHog person profile so cohorts can be broken
    // down by acquisition channel.
    void setUserProperties({ acquisition_source: acquisitionSource });
    setStep('notifications');
  }, [acquisitionSource]);

  // Enable awaits the permission prompt, so a quick second tap would finish
  // onboarding (and send its events) twice.
  const enablingRef = useRef(false);
  const finishingRef = useRef(false);
  const handleFinish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      const result = completeOnboarding({
        seedDefaultAccounts: accounts.length === 0 && categories.length === 0,
        // Like the starter set, picks are only created for someone without
        // accounts: a replay from Settings never adds to what is there.
        starterAccounts:
          starterAccountsSkipped || accounts.length > 0
            ? undefined
            : starterAccountSeeds(starterSelections, {
                cash: I18n.t('onboarding.accounts.cash'),
                card: (name) => I18n.t('onboarding.accounts.card_name', { name }),
              }),
      });

      if (result.createdCategories > 0 || result.createdAccounts > 0) {
        void triggerHaptic('success');
      } else {
        void triggerHaptic('selection');
      }
      onComplete();
    } catch (error) {
      finishingRef.current = false;
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [
    accounts.length,
    categories.length,
    completeOnboarding,
    onComplete,
    starterAccountsSkipped,
    starterSelections,
  ]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TabletContentContainer style={{ flex: 1 }}>
        {/* The welcome page keeps the bar's height empty, so its title sits
            where every later step's does. */}
        {step === 'welcome' ? (
          <View className="h-12" />
        ) : (
          <OnboardingTopBar step={stepIndex} total={STEP_ORDER.length - 1} onBack={goBack} />
        )}

        <Animated.View entering={FadeIn.duration(300)} className="flex-1" key={`step-${step}`}>
          {step === 'welcome' && (
            <OnboardingWelcomeStep
              currencyCode={settings.currencyCode}
              currencySymbol={settings.currencySymbol}
              onGetStarted={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STARTED);
                setStep('basics');
              }}
            />
          )}

          {step === 'basics' && (
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
              onBack={goBack}
              onContinue={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'basics',
                  currency_code: settings.currencyCode,
                });
                setStep('wage');
              }}
            />
          )}

          {step === 'wage' && (
            <OnboardingIncomeStep
              config={wageDraft}
              currencySymbol={settings.currencySymbol}
              onChange={setWageDraft}
              onBack={goBack}
              onContinue={() => {
                updateWageConfigForMonth(currentMonth, wageDraft);
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'wage',
                  wage_set: true,
                  wage_type: wageDraft.wageType,
                });
                setStep('accounts');
              }}
              onSkip={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'wage',
                  wage_set: savedHourlyRate > 0,
                });
                setStep('accounts');
              }}
            />
          )}

          {step === 'accounts' && (
            <OnboardingAccountsStep
              country={starterCountry}
              onCountryChange={(accountLogoCountry) => {
                // Picking the country it already shows keeps it following the currency.
                setPickedStarterCountry(
                  accountLogoCountry === ownCountry ? null : accountLogoCountry,
                );
              }}
              selections={starterSelections}
              onSelectionsChange={setStarterSelections}
              onBack={goBack}
              onContinue={() => {
                setStarterAccountsSkipped(false);
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'accounts',
                  accounts_added: starterSelections.length,
                  account_country: starterCountry,
                  skipped: false,
                });
                leaveAccountsStep();
              }}
              onSkip={() => {
                setStarterAccountsSkipped(true);
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'accounts',
                  accounts_added: 0,
                  account_country: starterCountry,
                  skipped: true,
                });
                leaveAccountsStep();
              }}
            />
          )}

          {step === 'automations' && (
            <OnboardingAutomationsStep
              onBack={goBack}
              onContinue={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
                  step: 'automations',
                });
                setStep('backup');
              }}
            />
          )}

          {step === 'backup' && (
            <OnboardingBackupStep
              onEnable={() => {
                void handleEnableBackup();
              }}
              onSkip={handleSkipBackup}
              onBack={goBack}
            />
          )}

          {step === 'source' && (
            <OnboardingSourceStep
              selected={acquisitionSource}
              onSelect={setAcquisitionSource}
              onBack={goBack}
              onContinue={handleSourceContinue}
            />
          )}

          {step === 'notifications' && (
            <OnboardingNotificationsStep
              onEnable={async () => {
                if (enablingRef.current || finishingRef.current) return;
                enablingRef.current = true;
                // Tapping enable is not a grant: the OS prompt that follows can
                // still be declined, and only the answer says who can be reached.
                const permission = await requestPermissions().catch(() => 'error' as const);
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_ENABLED, { permission });
                enablingRef.current = false;
                handleFinish();
              }}
              onSkip={() => {
                if (enablingRef.current || finishingRef.current) return;
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_SKIPPED);
                handleFinish();
              }}
              onBack={goBack}
            />
          )}
        </Animated.View>
      </TabletContentContainer>
    </SafeAreaView>
  );
}

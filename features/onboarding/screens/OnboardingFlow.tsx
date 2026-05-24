import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text, ThemeModal } from '~/components/ui';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import { WageCalculatorFlowScreen } from '~/features/settings/screens';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n, setAppLocale } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { MMImportSummary } from '~/services/mmbakImportService';
import { requestPermissions } from '~/services/notifications';
import { type WageConfig } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';
import { monthKeyFromDateLocal } from '~/utils/formatters';

import {
  type BootstrapChoice,
  type BootstrapView,
  OnboardingBootstrapStep,
} from './OnboardingBootstrapStep';
import { OnboardingModeStep } from './OnboardingModeStep';
import { OnboardingNotificationsStep } from './OnboardingNotificationsStep';
import { OnboardingPreferencesStep } from './OnboardingPreferencesStep';
import { OnboardingValuePropStep } from './OnboardingValuePropStep';
import { OnboardingWageStep } from './OnboardingWageStep';

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

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
    importMoneyManagerBackup,
  } = useApp();
  const themeColors = useThemeColors();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSimpleUser, setIsSimpleUser] = useState(false);
  const [showWageCalculator, setShowWageCalculator] = useState(false);
  const [importResult, setImportResult] = useState<MMImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [bootstrapChoice, setBootstrapChoice] = useState<BootstrapChoice | null>(null);
  const [bootstrapView, setBootstrapView] = useState<BootstrapView>('choose');
  const visualStep = step;
  const totalVisualSteps = isSimpleUser ? 5 : 6;

  // Derived state
  const wageIsSet = (currentMonthWage?.wageAmount ?? 0) > 0;

  const currentMonth = useMemo(() => monthKeyFromDateLocal(new Date()), []);

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

  // --- Handlers ---

  const handleSkipOnboarding = useCallback(() => {
    Alert.alert(
      I18n.t('onboarding.flow.skip_setup_title'),
      I18n.t('onboarding.flow.skip_setup_message'),
      [
        { text: I18n.t('onboarding.flow.stay'), style: 'cancel' },
        {
          text: I18n.t('onboarding.flow.skip'),
          onPress: () => {
            void triggerHaptic('selection');
            void trackEvent(AnalyticsEvents.ONBOARDING_SKIPPED, { at_step: step });
            try {
              completeOnboarding({
                userMode: 'power',
                seedPowerDefaults: accounts.length === 0 && categories.length === 0,
              });
            } catch (error) {
              void triggerHaptic('error');
              Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
              return;
            }
            onComplete();
          },
        },
      ],
    );
  }, [accounts.length, categories.length, completeOnboarding, onComplete, step]);

  const handleImport = useCallback(async () => {
    if (isImporting) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) return;

      const picked = result.assets[0];
      const name = picked.name?.toLowerCase() ?? '';
      const uri = picked.uri?.toLowerCase() ?? '';
      const hasMmbakExt = name.endsWith('.mmbak') || uri.endsWith('.mmbak');

      if (!hasMmbakExt) {
        Alert.alert(
          I18n.t('onboarding.flow.invalid_file'),
          I18n.t('onboarding.flow.invalid_file_message'),
        );
        return;
      }

      setIsImporting(true);
      void trackEvent(AnalyticsEvents.ONBOARDING_IMPORT_STARTED);
      const summary = await importMoneyManagerBackup(picked.uri, picked.name);
      void triggerHaptic('success');
      setImportResult(summary);
      void trackEvent(AnalyticsEvents.ONBOARDING_IMPORT_COMPLETED, {
        accounts: summary.accounts,
        categories: summary.categories,
        transactions: summary.transactions,
      });
    } catch (error) {
      const message = getErrorMessage(error, I18n.t('errors.import_failed_generic'));
      void triggerHaptic('error');
      void trackEvent(AnalyticsEvents.ONBOARDING_IMPORT_FAILED);
      Alert.alert(I18n.t('onboarding.flow.import_failed'), message);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, importMoneyManagerBackup]);

  const completePowerOnboarding = useCallback(() => {
    try {
      completeOnboarding({ userMode: 'power' });
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
      return;
    }
    onComplete();
  }, [completeOnboarding, onComplete]);

  const handleStartFresh = useCallback(() => {
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

  const handleSelectSimple = useCallback(() => {
    void trackEvent(AnalyticsEvents.ONBOARDING_MODE_SELECTED, { mode: 'simple' });
    setIsSimpleUser(true);
    try {
      completeOnboarding({
        userMode: 'simple',
        seedSimpleDefaults: accounts.length === 0 && categories.length === 0,
      });
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
      return;
    }
    onComplete();
  }, [accounts.length, categories.length, completeOnboarding, onComplete]);

  const handleSelectPower = useCallback(() => {
    void trackEvent(AnalyticsEvents.ONBOARDING_MODE_SELECTED, { mode: 'power' });
    setIsSimpleUser(false);
    setStep(6);
  }, []);

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

  // --- Main render ---

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TabletContentContainer style={{ flex: 1 }}>
        {renderProgressHeader()}

        {step === 1 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-1">
            <OnboardingValuePropStep
              currencySymbol={settings.currencySymbol}
              onGetStarted={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_STARTED);
                setStep(2);
              }}
              onSkip={handleSkipOnboarding}
            />
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-2">
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
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-3">
            <OnboardingNotificationsStep
              onEnable={async () => {
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_ENABLED);
                await requestPermissions();
                setStep(4);
              }}
              onSkip={() => {
                void trackEvent(AnalyticsEvents.ONBOARDING_NOTIFICATIONS_SKIPPED);
                setStep(4);
              }}
            />
          </Animated.View>
        )}

        {step === 4 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-4">
            <OnboardingWageStep
              settings={settings}
              currentMonthWage={currentMonthWage}
              wageIsSet={wageIsSet}
              onBack={() => setStep(3)}
              onContinue={() => setStep(5)}
              onOpenWageCalculator={() => {
                void triggerHaptic('selection');
                setShowWageCalculator(true);
              }}
            />
          </Animated.View>
        )}

        {step === 5 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-5">
            <OnboardingModeStep
              onBack={() => setStep(4)}
              onSelectSimple={handleSelectSimple}
              onSelectPower={handleSelectPower}
            />
          </Animated.View>
        )}

        {step === 6 && (
          <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-6">
            <OnboardingBootstrapStep
              onBack={() => setStep(5)}
              onImport={() => {
                void handleImport();
              }}
              onStartFresh={handleStartFresh}
              onFinish={completePowerOnboarding}
              onClearImportResult={() => setImportResult(null)}
              choice={bootstrapChoice}
              view={bootstrapView}
              onChoiceChange={setBootstrapChoice}
              onViewChange={setBootstrapView}
              importResult={importResult}
              isImporting={isImporting}
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

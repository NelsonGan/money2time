import React, { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { useApp } from '~/context/AppContext';
import {
  DEFAULT_ACCOUNT_TEMPLATE,
  DEFAULT_CURRENCY,
  DEFAULT_WAGE_CONFIG,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import { type WageConfig } from '~/types';
import { triggerHaptic } from '~/services/haptics';
import { getErrorMessage } from '~/utils/errorHandling';
import type { MMImportSummary } from '~/services/mmbakImportService';
import { monthKeyFromDateLocal } from '~/utils/formatters';
import { I18n, setAppLocale } from '~/lib/i18n';

import { OnboardingValuePropStep } from './OnboardingValuePropStep';
import { OnboardingPreferencesStep } from './OnboardingPreferencesStep';
import { OnboardingWageStep } from './OnboardingWageStep';
import {
  OnboardingBootstrapStep,
  type BootstrapChoice,
  type BootstrapView,
} from './OnboardingBootstrapStep';

import {
  AccountsScreen,
  CategoriesScreen,
  WageCalculatorFlowScreen,
} from '~/features/settings/screens';
import { AddTransactionScreen } from '~/features/transactions/screens';

type OnboardingStep = 1 | 2 | 3 | 4;
type SubRoute = 'main' | 'accounts' | 'categories';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const {
    settings,
    accounts,
    categories,
    transactions,
    currentMonthWage,
    updateSettings,
    updateWageConfigForMonth,
    importMoneyManagerBackup,
    createCategory,
    createAccount,
    createTransaction,
  } = useApp();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [subRoute, setSubRoute] = useState<SubRoute>('main');
  const [showWageCalculator, setShowWageCalculator] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [importResult, setImportResult] = useState<MMImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [bootstrapChoice, setBootstrapChoice] = useState<BootstrapChoice | null>(null);
  const [bootstrapView, setBootstrapView] = useState<BootstrapView>('choose');
  const visualStep = step === 4 && bootstrapView !== 'choose' ? 5 : step;
  const totalVisualSteps = 5;

  // Derived state
  const wageIsSet = (currentMonthWage?.wageAmount ?? 0) > 0;
  const accountCount = accounts.length;
  const expenseCategoryCount = useMemo(
    () => categories.filter((c) => c.type === 'expense').length,
    [categories],
  );
  const incomeCategoryCount = useMemo(
    () => categories.filter((c) => c.type === 'income').length,
    [categories],
  );
  const transactionCount = transactions.length;
  const canCreateMinimalDefaults =
    accountCount === 0 ||
    expenseCategoryCount === 0 ||
    incomeCategoryCount === 0 ||
    transactionCount === 0;

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
            onComplete();
          },
        },
      ],
    );
  }, [onComplete]);

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
      const summary = await importMoneyManagerBackup(picked.uri, picked.name);
      void triggerHaptic('success');
      setImportResult(summary);
    } catch (error) {
      const message = getErrorMessage(error, I18n.t('errors.import_failed_generic'));
      void triggerHaptic('error');
      Alert.alert(I18n.t('onboarding.flow.import_failed'), message);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, importMoneyManagerBackup]);

  const handleCreateMinimalDefaults = useCallback(() => {
    try {
      const existing = new Set(
        categories.map((item) => `${item.type}:${item.name.trim().toLowerCase()}`),
      );
      const minimal = [
        ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
        ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
      ];
      let createdCategories = 0;

      minimal.forEach((item) => {
        const key = `${item.type}:${item.name.trim().toLowerCase()}`;
        if (existing.has(key)) return;
        createCategory(item);
        existing.add(key);
        createdCategories += 1;
      });

      let accountId = accounts[0]?.id ?? null;
      if (!accountId) {
        accountId = createAccount({
          ...DEFAULT_ACCOUNT_TEMPLATE,
          currency: DEFAULT_CURRENCY,
        });
      }

      let createdSampleTransaction = false;
      if (transactionCount === 0 && accountId) {
        createTransaction({
          type: 'expense',
          amount: 12,
          currency: settings.currencySymbol,
          date: new Date().toISOString(),
          accountId,
          categoryId: null,
          note: I18n.t('onboarding.flow.sample_transaction_note'),
        });
        createdSampleTransaction = true;
      }

      if (createdCategories > 0 || createdSampleTransaction || accountCount === 0) {
        void triggerHaptic('success');
      } else {
        void triggerHaptic('selection');
      }
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [
    accountCount,
    accounts,
    categories,
    createAccount,
    createCategory,
    createTransaction,
    settings.currencySymbol,
    transactionCount,
  ]);

  // --- Sub-route screens ---

  if (subRoute === 'accounts') {
    return <AccountsScreen onBack={() => setSubRoute('main')} />;
  }

  if (subRoute === 'categories') {
    return <CategoriesScreen onBack={() => setSubRoute('main')} />;
  }

  // --- Step progress indicator ---

  const renderProgressDots = () => (
    <View
      className="flex-row items-center justify-center gap-1.5 pt-3 pb-1"
      accessibilityLabel={I18n.t('onboarding.flow.step_a11y', {
        step: visualStep,
        total: totalVisualSteps,
      })}
      accessibilityRole="header"
    >
      {Array.from({ length: totalVisualSteps }, (_, index) => index + 1).map((i) => (
        <View key={i} className="flex-row items-center">
          <View
            className={`h-2.5 w-2.5 rounded-full ${visualStep >= i ? 'bg-primary' : 'bg-secondary'}`}
          />
          {i < totalVisualSteps && (
            <View className={`h-0.5 w-8 ${visualStep > i ? 'bg-primary' : 'bg-secondary'}`} />
          )}
        </View>
      ))}
    </View>
  );

  // --- Step label ---

  const renderStepLabel = () => {
    if (step === 1) return null;
    return (
      <Text variant="label" tone="muted" className="text-center uppercase tracking-wider mt-2">
        {I18n.t('onboarding.progress_step_of', { step: visualStep, total: totalVisualSteps })}
      </Text>
    );
  };

  // --- Main render ---

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {renderProgressDots()}
      {renderStepLabel()}

      {step === 1 && (
        <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-1">
          <OnboardingValuePropStep
            currencySymbol={settings.currencySymbol}
            onGetStarted={() => setStep(2)}
            onSkip={handleSkipOnboarding}
          />
        </Animated.View>
      )}

      {step === 2 && (
        <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-2">
          <OnboardingPreferencesStep
            locale={settings.locale}
            currencySymbol={settings.currencySymbol}
            onLocaleChange={(locale) => {
              setAppLocale(locale);
              updateSettings({ locale });
            }}
            onCurrencySymbolChange={(currencySymbol) => {
              updateSettings({ currencySymbol });
            }}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        </Animated.View>
      )}

      {step === 3 && (
        <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-3">
          <OnboardingWageStep
            settings={settings}
            currentMonthWage={currentMonthWage}
            wageIsSet={wageIsSet}
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
            onOpenWageCalculator={() => {
              void triggerHaptic('selection');
              setShowWageCalculator(true);
            }}
          />
        </Animated.View>
      )}

      {step === 4 && (
        <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-4">
          <OnboardingBootstrapStep
            onBack={() => setStep(3)}
            onImport={() => {
              void handleImport();
            }}
            onGoToAccounts={() => setSubRoute('accounts')}
            onGoToCategories={() => setSubRoute('categories')}
            onAddTransaction={() => {
              void triggerHaptic('selection');
              setShowAddTransaction(true);
            }}
            onFinish={onComplete}
            onSkipWithWarning={onComplete}
            choice={bootstrapChoice}
            view={bootstrapView}
            onChoiceChange={setBootstrapChoice}
            onViewChange={setBootstrapView}
            importResult={importResult}
            isImporting={isImporting}
            canCreateMinimalDefaults={canCreateMinimalDefaults}
            onCreateMinimalDefaults={handleCreateMinimalDefaults}
            accountCount={accountCount}
            expenseCategoryCount={expenseCategoryCount}
            incomeCategoryCount={incomeCategoryCount}
            transactionCount={transactionCount}
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

      {/* Add Transaction Modal */}
      <ThemeModal
        visible={showAddTransaction}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddTransaction(false)}
      >
        <AddTransactionScreen onClose={() => setShowAddTransaction(false)} />
      </ThemeModal>
    </SafeAreaView>
  );
}

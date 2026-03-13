import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import {
  DEFAULT_CURRENCY,
  DEFAULT_WAGE_CONFIG,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ONBOARDING_POWER_MINIMAL_ACCOUNTS,
} from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import {
  AccountsScreen,
  CategoriesScreen,
  WageCalculatorFlowScreen,
} from '~/features/settings/screens';
import { AddTransactionScreen } from '~/features/transactions/screens';
import { I18n, setAppLocale } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { MMImportSummary } from '~/services/mmbakImportService';
import { type WageConfig } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';
import { monthKeyFromDateLocal } from '~/utils/formatters';

import {
  type BootstrapChoice,
  type BootstrapView,
  OnboardingBootstrapStep,
} from './OnboardingBootstrapStep';
import { OnboardingModeStep } from './OnboardingModeStep';
import { OnboardingPreferencesStep } from './OnboardingPreferencesStep';
import { OnboardingValuePropStep } from './OnboardingValuePropStep';
import { OnboardingWageStep } from './OnboardingWageStep';

type OnboardingStep = 1 | 2 | 3 | 4 | 5;
type SubRoute = 'main' | 'accounts' | 'categories';

function categorySeedKey(type: 'expense' | 'income', name: string) {
  return `${type}:${name.trim().toLowerCase()}`;
}

function nameSeedKey(name: string) {
  return name.trim().toLowerCase();
}

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
    switchToSimpleMode,
  } = useApp();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSimpleUser, setIsSimpleUser] = useState(false);
  const [subRoute, setSubRoute] = useState<SubRoute>('main');
  const [showWageCalculator, setShowWageCalculator] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [importResult, setImportResult] = useState<MMImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [bootstrapChoice, setBootstrapChoice] = useState<BootstrapChoice | null>(null);
  const [bootstrapView, setBootstrapView] = useState<BootstrapView>('choose');
  const visualStep = step;
  const totalVisualSteps = isSimpleUser ? 4 : 5;

  // Derived state
  const wageIsSet = (currentMonthWage?.wageAmount ?? 0) > 0;
  const accountCount = accounts.length;
  const { expenseCategoryCount, incomeCategoryCount, existingCategorySeedKeys } = useMemo(() => {
    let expenseCount = 0;
    let incomeCount = 0;
    const categorySeedKeys = new Set<string>();

    categories.forEach((category) => {
      categorySeedKeys.add(categorySeedKey(category.type, category.name));
      if (category.type === 'expense') {
        expenseCount += 1;
      } else if (category.type === 'income') {
        incomeCount += 1;
      }
    });

    return {
      expenseCategoryCount: expenseCount,
      incomeCategoryCount: incomeCount,
      existingCategorySeedKeys: categorySeedKeys,
    };
  }, [categories]);
  const transactionCount = transactions.length;
  const existingAccountNameKeys = useMemo(() => {
    const accountNameKeys = new Set<string>();
    accounts.forEach((account) => {
      accountNameKeys.add(nameSeedKey(account.name));
    });
    return accountNameKeys;
  }, [accounts]);
  const { missingMinimalExpenseCategoryCount, missingMinimalIncomeCategoryCount } = useMemo(() => {
    let missingExpenseCount = 0;
    let missingIncomeCount = 0;

    ONBOARDING_MINIMAL_EXPENSE_CATEGORIES.forEach((item) => {
      if (!existingCategorySeedKeys.has(categorySeedKey(item.type, item.name))) {
        missingExpenseCount += 1;
      }
    });
    ONBOARDING_MINIMAL_INCOME_CATEGORIES.forEach((item) => {
      if (!existingCategorySeedKeys.has(categorySeedKey(item.type, item.name))) {
        missingIncomeCount += 1;
      }
    });

    return {
      missingMinimalExpenseCategoryCount: missingExpenseCount,
      missingMinimalIncomeCategoryCount: missingIncomeCount,
    };
  }, [existingCategorySeedKeys]);
  const missingMinimalPowerAccountCount = useMemo(() => {
    let missingCount = 0;
    ONBOARDING_POWER_MINIMAL_ACCOUNTS.forEach((item) => {
      if (!existingAccountNameKeys.has(nameSeedKey(item.name))) {
        missingCount += 1;
      }
    });
    return missingCount;
  }, [existingAccountNameKeys]);
  const canCreateMinimalDefaults =
    missingMinimalPowerAccountCount > 0 ||
    missingMinimalExpenseCategoryCount > 0 ||
    missingMinimalIncomeCategoryCount > 0 ||
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
            void trackEvent(AnalyticsEvents.ONBOARDING_SKIPPED, { at_step: step });
            onComplete();
          },
        },
      ],
    );
  }, [onComplete, step]);

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

  const handleCreateMinimalDefaults = useCallback(() => {
    try {
      const existing = new Set(categories.map((item) => categorySeedKey(item.type, item.name)));
      const minimal = [
        ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
        ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
      ];
      let createdCategories = 0;

      minimal.forEach((item) => {
        const key = categorySeedKey(item.type, item.name);
        if (existing.has(key)) return;
        createCategory(item);
        existing.add(key);
        createdCategories += 1;
      });

      const existingAccountNames = new Set(accounts.map((item) => nameSeedKey(item.name)));
      const preferredCurrency = accounts[0]?.currency ?? DEFAULT_CURRENCY;
      let accountIdForSample = accounts[0]?.id ?? null;
      let createdAccounts = 0;
      ONBOARDING_POWER_MINIMAL_ACCOUNTS.forEach((item) => {
        const key = nameSeedKey(item.name);
        if (existingAccountNames.has(key)) return;
        const accountId = createAccount({
          ...item,
          currency: preferredCurrency,
        });
        existingAccountNames.add(key);
        createdAccounts += 1;
        if (!accountIdForSample) {
          accountIdForSample = accountId;
        }
      });

      let createdSampleTransaction = false;
      if (transactionCount === 0 && accountIdForSample) {
        createTransaction({
          type: 'expense',
          amount: 12,
          currency: settings.currencySymbol,
          date: new Date().toISOString(),
          accountId: accountIdForSample,
          categoryId: null,
          note: I18n.t('onboarding.flow.sample_transaction_note'),
        });
        createdSampleTransaction = true;
      }

      if (createdCategories > 0 || createdAccounts > 0 || createdSampleTransaction) {
        void triggerHaptic('success');
      } else {
        void triggerHaptic('selection');
      }
    } catch (error) {
      void triggerHaptic('error');
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [
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

  if (showAddTransaction) {
    return <AddTransactionScreen onClose={() => setShowAddTransaction(false)} />;
  }

  // --- Step progress indicator ---

  const renderProgressDots = () => (
    <View
      className="flex-row items-center justify-center gap-2 pt-4 pb-2"
      accessibilityLabel={I18n.t('onboarding.flow.step_a11y', {
        step: visualStep,
        total: totalVisualSteps,
      })}
      accessibilityRole="header"
    >
      {Array.from({ length: totalVisualSteps }, (_, index) => index + 1).map((i) => (
        <View key={i} className="flex-row items-center gap-2">
          <View
            className={`rounded-full ${
              visualStep >= i ? 'h-2.5 w-2.5 bg-primary shadow-glow' : 'h-2 w-2 bg-secondary/60'
            }`}
          />
          {i < totalVisualSteps && (
            <View
              className={`h-[1.5px] w-6 rounded-full ${
                visualStep > i ? 'bg-primary/50' : 'bg-secondary/40'
              }`}
            />
          )}
        </View>
      ))}
    </View>
  );

  // --- Step label ---

  const renderStepLabel = () => {
    if (step === 1) return null;
    return (
      <Text variant="label" tone="muted" className="text-center tracking-widest mt-1">
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
            onLocaleChange={(locale) => {
              setAppLocale(locale);
              updateSettings({ locale });
            }}
            onCurrencyChange={({ code, symbol }) => {
              updateSettings({ currencyCode: code, currencySymbol: symbol });
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
          <OnboardingModeStep
            onBack={() => setStep(3)}
            onSelectSimple={() => {
              void triggerHaptic('selection');
              void trackEvent(AnalyticsEvents.ONBOARDING_MODE_SELECTED, { mode: 'simple' });
              setIsSimpleUser(true);
              switchToSimpleMode(true);
              onComplete();
            }}
            onSelectPower={() => {
              void triggerHaptic('selection');
              void trackEvent(AnalyticsEvents.ONBOARDING_MODE_SELECTED, { mode: 'power' });
              setIsSimpleUser(false);
              setStep(5);
            }}
          />
        </Animated.View>
      )}

      {step === 5 && (
        <Animated.View entering={FadeIn.duration(350)} className="flex-1" key="step-5">
          <OnboardingBootstrapStep
            onBack={() => setStep(4)}
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
    </SafeAreaView>
  );
}

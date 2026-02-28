import './global.css';

import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Appearance, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { Mascot } from '~/components/feedback/Mascot';
import { BottomNav, type TabName } from '~/components/navigation/BottomNav';
import { Text } from '~/components/ui';
import { AppProvider, useApp } from '~/context/AppContext';
import { ThemeProvider, useResolvedTheme } from '~/context/ThemeContext';
import { HomeScreen } from '~/features/home/screens';
import { InsightsDrilldownScreen, InsightsScreen } from '~/features/insights/screens';
import { OnboardingFlow } from '~/features/onboarding/screens';
import {
  AccountsScreen,
  type SettingsScreenName,
  SettingsStack,
} from '~/features/settings/screens';
import { TransactionEditorScreen } from '~/features/transactions/components';
import {
  AddTransactionScreen,
  EditTransactionScreen,
  SimpleActivityScreen,
  TransactionsScreen,
} from '~/features/transactions/screens';
import { useThemeColors } from '~/hooks/useThemeColors';
import { useThemeVars } from '~/hooks/useThemeVars';
import { I18n } from '~/lib/i18n';
import {
  type RootMainNavigationProp,
  RootStack,
  type RootStackParamList,
  type RootStackRouteProps,
} from '~/navigation/rootStack';
import { SHARED_NATIVE_STACK_OPTIONS } from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';
import { subscribeOpenHourlyValueRequest } from '~/services/hourlyValueNavigation';
import type { TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal, monthKeyFromDateLocal } from '~/utils/formatters';

type MainTab = TabName;

const MemoHomeScreen = React.memo(HomeScreen);
const MemoTransactionsScreen = React.memo(TransactionsScreen);
const MemoSimpleActivityScreen = React.memo(SimpleActivityScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoSettingsStack = React.memo(SettingsStack);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  tabVisible: { opacity: 1 },
  tabHidden: { opacity: 0 },
});

function MountedTab({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.tabSlot, active ? styles.tabVisible : styles.tabHidden]}
    >
      {children}
    </View>
  );
}

function ThemeGate({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const { setColorScheme } = useColorScheme();
  const themeMode = settings?.themeMode ?? 'system';
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    () => Appearance.getColorScheme() ?? 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setColorScheme(themeMode === 'system' ? 'system' : themeMode);
  }, [themeMode, setColorScheme]);

  const resolved: 'light' | 'dark' = themeMode === 'system' ? systemScheme : themeMode;

  return <ThemeProvider value={resolved}>{children}</ThemeProvider>;
}

function MainShellScreen() {
  const navigation = useNavigation<RootMainNavigationProp>();
  const { isSimpleMode } = useApp();
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [homeScrollTopToken, setHomeScrollTopToken] = useState(0);
  const [transactionsScrollTopToken, setTransactionsScrollTopToken] = useState(0);
  const [transactionsFocusMonthKey, setTransactionsFocusMonthKey] = useState<string | null>(null);
  const [transactionsFocusMonthToken, setTransactionsFocusMonthToken] = useState(0);
  const [insightsResetToMonthToken, setInsightsResetToMonthToken] = useState(0);
  const [settingsScrollTopToken, setSettingsScrollTopToken] = useState(0);
  const [settingsResetToken, setSettingsResetToken] = useState(0);
  const [settingsForceScreen, setSettingsForceScreen] = useState<SettingsScreenName | null>(null);
  const [settingsForceScreenToken, setSettingsForceScreenToken] = useState(0);

  useEffect(() => {
    return subscribeOpenHourlyValueRequest(() => {
      setSettingsForceScreen('HourlyValue');
      setSettingsForceScreenToken((prev) => prev + 1);
      setActiveTab('settings');
    });
  }, []);

  const jumpTransactionsToMonth = useCallback((monthKey: string) => {
    setTransactionsFocusMonthKey(monthKey);
    setTransactionsFocusMonthToken((prev) => prev + 1);
  }, []);

  const openAddTransaction = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  const openTransactionEditor = useCallback(
    (transaction: TransactionWithRelations) => {
      navigation.navigate('EditTransaction', { transactionId: transaction.id });
    },
    [navigation],
  );
  const openAccountDetail = useCallback(
    (accountId: string) => {
      navigation.navigate('AccountDetail', { accountId });
    },
    [navigation],
  );
  const openInsightsDrilldown = useCallback(
    (payload: RootStackParamList['InsightsDrilldown']) => {
      navigation.navigate('InsightsDrilldown', payload);
    },
    [navigation],
  );

  const openRecurringEditor = useCallback(
    (ruleId?: string) => {
      if (ruleId) {
        navigation.navigate('RecurringEditor', { ruleId });
        return;
      }
      navigation.navigate('RecurringEditor');
    },
    [navigation],
  );

  const handleTabChange = useCallback(
    (tab: TabName) => {
      if (tab === 'home' && activeTab === 'home') {
        setHomeScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'transactions' && activeTab === 'transactions') {
        jumpTransactionsToMonth(monthKeyFromDateLocal(new Date()));
        setTransactionsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'insights' && activeTab === 'insights') {
        setInsightsResetToMonthToken((prev) => prev + 1);
      }
      if (tab === 'settings') {
        setSettingsForceScreen(null);
        setSettingsResetToken((prev) => prev + 1);
        if (activeTab === 'settings') {
          setSettingsScrollTopToken((prev) => prev + 1);
        }
      }
      setActiveTab(tab);
    },
    [activeTab, jumpTransactionsToMonth],
  );

  return (
    <View className="flex-1 bg-background">
      <View style={styles.flex}>
        <MountedTab active={activeTab === 'home'}>
          <MemoHomeScreen
            scrollToTopToken={homeScrollTopToken}
            onOpenAccount={openAccountDetail}
            onOpenTransaction={openTransactionEditor}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'transactions'}>
          {isSimpleMode ? (
            <MemoSimpleActivityScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
            />
          ) : (
            <MemoTransactionsScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
            />
          )}
        </MountedTab>
        <MountedTab active={activeTab === 'insights'}>
          <MemoInsightsScreen
            resetToCurrentMonthToken={insightsResetToMonthToken}
            onOpenDrilldown={openInsightsDrilldown}
            onOpenTransaction={openTransactionEditor}
            isSimpleMode={isSimpleMode}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'settings'}>
          <MemoSettingsStack
            resetToRootToken={settingsResetToken}
            scrollToTopToken={settingsScrollTopToken}
            forceScreen={settingsForceScreen}
            forceScreenToken={settingsForceScreenToken}
            onOpenRecurringEditor={openRecurringEditor}
          />
        </MountedTab>
      </View>

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onPressAdd={openAddTransaction}
      />
    </View>
  );
}

function AddTransactionRouteScreen({ navigation }: RootStackRouteProps<'AddTransaction'>) {
  const { isSimpleMode, simpleWalletId } = useApp();
  return (
    <AddTransactionScreen
      onClose={() => navigation.goBack()}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
    />
  );
}

function EditTransactionRouteScreen({ route, navigation }: RootStackRouteProps<'EditTransaction'>) {
  const { transactions, isSimpleMode, simpleWalletId } = useApp();
  const transaction = useMemo(
    () => transactions.find((item) => item.id === route.params.transactionId) ?? null,
    [route.params.transactionId, transactions],
  );

  useEffect(() => {
    if (transaction) return;
    navigation.goBack();
  }, [navigation, transaction]);

  if (!transaction) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <EditTransactionScreen
      transaction={transaction}
      onClose={() => navigation.goBack()}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
    />
  );
}

function AccountDetailRouteScreen({ route, navigation }: RootStackRouteProps<'AccountDetail'>) {
  return (
    <AccountsScreen
      onBack={() => navigation.goBack()}
      accountId={route.params.accountId}
      useNativeBackGesture
      onOpenTransaction={(transaction) =>
        navigation.navigate('EditTransaction', { transactionId: transaction.id })
      }
    />
  );
}

function InsightsDrilldownRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'InsightsDrilldown'>) {
  return (
    <InsightsDrilldownScreen
      payload={route.params}
      onBack={() => navigation.goBack()}
      onOpenTransaction={(transaction) =>
        navigation.navigate('EditTransaction', { transactionId: transaction.id })
      }
      onOpenSubcategoryDrilldown={(payload) => navigation.push('InsightsDrilldown', payload)}
    />
  );
}

function RecurringEditorRouteScreen({ route, navigation }: RootStackRouteProps<'RecurringEditor'>) {
  const {
    settings,
    recurringRules,
    createRecurringRule,
    updateRecurringRule,
    isSimpleMode,
    simpleWalletId,
  } = useApp();
  const ruleId = route.params?.ruleId ?? null;
  const editingRule = useMemo(
    () => (ruleId ? (recurringRules.find((rule) => rule.id === ruleId) ?? null) : null),
    [recurringRules, ruleId],
  );

  useEffect(() => {
    if (!ruleId || editingRule) return;
    if (navigation.canGoBack()) navigation.goBack();
  }, [editingRule, navigation, ruleId]);

  if (ruleId && !editingRule) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <TransactionEditorScreen
      mode={editingRule ? 'edit' : 'create'}
      onClose={() => { if (navigation.canGoBack()) navigation.goBack(); }}
      onSubmit={() => {}}
      onDelete={undefined}
      deleteLabel={undefined}
      titleOverride={editingRule ? I18n.t('recurring.edit_rule') : I18n.t('recurring.new_rule')}
      subtitleOverride={I18n.t('recurring.same_flow')}
      submitLabelOverride={I18n.t('recurring.save_rule')}
      restrictTypeOptions={isSimpleMode ? ['expense', 'income'] : ['expense', 'income', 'transfer']}
      hideAccountSelector={isSimpleMode}
      recurringOptions={{
        initialName: editingRule?.name,
        initialPattern: editingRule?.recurrencePattern,
        initialInterval: editingRule?.recurrenceInterval,
        initialEndDate: editingRule?.endDate,
        initialIsActive: editingRule?.isActive,
        onSubmitRecurring: ({ transaction, recurring }) => {
          const recurringTxType =
            transaction.type === 'transfer'
              ? 'transfer'
              : transaction.type === 'income'
                ? 'income'
                : 'expense';
          const basePayload = {
            name: recurring.name,
            type: recurringTxType,
            amount: transaction.amount,
            currency: settings.currencySymbol,
            note: transaction.note ?? null,
            recurrencePattern: recurring.pattern,
            recurrenceInterval: recurring.interval,
            nextRunDate: transaction.date,
            endDate: recurring.endDate,
            isActive: recurring.isActive,
          } as const;
          const effectiveAccountId = isSimpleMode
            ? (simpleWalletId ?? transaction.accountId ?? null)
            : (transaction.accountId ?? null);
          const payload =
            transaction.type === 'transfer' && !isSimpleMode
              ? {
                  ...basePayload,
                  fromAccountId: transaction.fromAccountId ?? null,
                  toAccountId: transaction.toAccountId ?? null,
                  accountId: null,
                  categoryId: null,
                }
              : {
                  ...basePayload,
                  accountId: effectiveAccountId,
                  categoryId: transaction.categoryId ?? null,
                  fromAccountId: null,
                  toAccountId: null,
                };

          if (editingRule) {
            updateRecurringRule(editingRule.id, payload);
          } else {
            createRecurringRule(payload);
          }
          navigation.goBack();
        },
      }}
      initialValues={
        editingRule
          ? {
              type: editingRule.type,
              amount: String(editingRule.amount),
              date: dayKeyFromIsoLocal(editingRule.nextRunDate),
              accountId: isSimpleMode && simpleWalletId ? simpleWalletId : editingRule.accountId,
              fromAccountId: editingRule.fromAccountId,
              toAccountId: editingRule.toAccountId,
              categoryId: editingRule.categoryId,
              note: editingRule.note ?? '',
            }
          : isSimpleMode && simpleWalletId
            ? { accountId: simpleWalletId }
            : undefined
      }
    />
  );
}

function AppContent() {
  const { isLoading, settings, updateSettings } = useApp();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const themeStyle = useThemeVars();
  const rootScreenListeners = useMemo(() => createNativeStackSwipeHapticListeners(), []);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={themeStyle}>
        <View className="items-center rounded-[28px] border border-border/40 bg-card px-8 py-8 shadow-soft">
          <Mascot size={92} mood="sleepy" animate />
          <Text variant="friendly" tone="muted" className="mt-4">
            {I18n.t('app.loading_world')}
          </Text>
        </View>
        <ActivityIndicator size="large" color={themeColors.primary} className="mt-4" />
      </View>
    );
  }

  if (!settings.onboardingCompleted) {
    return (
      <View style={[styles.flex, themeStyle]}>
        <OnboardingFlow onComplete={() => updateSettings({ onboardingCompleted: true })} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={themeStyle}>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer>
        <RootStack.Navigator
          screenOptions={SHARED_NATIVE_STACK_OPTIONS}
          screenListeners={rootScreenListeners}
        >
          <RootStack.Screen name="Main" component={MainShellScreen} />
          <RootStack.Screen name="AddTransaction" component={AddTransactionRouteScreen} />
          <RootStack.Screen name="EditTransaction" component={EditTransactionRouteScreen} />
          <RootStack.Screen name="AccountDetail" component={AccountDetailRouteScreen} />
          <RootStack.Screen name="InsightsDrilldown" component={InsightsDrilldownRouteScreen} />
          <RootStack.Screen name="RecurringEditor" component={RecurringEditorRouteScreen} />
        </RootStack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <AppProvider>
            <ThemeGate>
              <AppContent />
            </ThemeGate>
          </AppProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

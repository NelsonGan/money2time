import './global.css';

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Appearance, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { AppProvider, useApp } from '~/context/AppContext';
import { ThemeProvider, useResolvedTheme } from '~/context/ThemeContext';
import { BottomNav, type TabName } from '~/components/navigation/BottomNav';
import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { HomeScreen } from '~/features/home/screens';
import { InsightsScreen } from '~/features/insights/screens';
import { OnboardingFlow } from '~/features/onboarding/screens';
import {
  AccountsScreen,
  SettingsStack,
  type SettingsScreenName,
} from '~/features/settings/screens';
import { AddTransactionScreen, TransactionsScreen } from '~/features/transactions/screens';
import { Mascot } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { useThemeVars } from '~/hooks/useThemeVars';
import { I18n } from '~/lib/i18n';
import { subscribeOpenHourlyValueRequest } from '~/services/hourlyValueNavigation';
import { monthKeyFromDateLocal } from '~/utils/formatters';

type MainTab = TabName;
const MemoHomeScreen = React.memo(HomeScreen);
const MemoTransactionsScreen = React.memo(TransactionsScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoAccountsScreen = React.memo(AccountsScreen);
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

function AppContent() {
  const { isLoading, settings, updateSettings } = useApp();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const themeStyle = useThemeVars();
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [homeScrollTopToken, setHomeScrollTopToken] = useState(0);
  const [transactionsScrollTopToken, setTransactionsScrollTopToken] = useState(0);
  const [transactionsFocusMonthKey, setTransactionsFocusMonthKey] = useState<string | null>(null);
  const [transactionsFocusMonthToken, setTransactionsFocusMonthToken] = useState(0);
  const [insightsResetToMonthToken, setInsightsResetToMonthToken] = useState(0);
  const [accountsScrollTopToken, setAccountsScrollTopToken] = useState(0);
  const [accountsResetToRootToken, setAccountsResetToRootToken] = useState(0);
  const [settingsScrollTopToken, setSettingsScrollTopToken] = useState(0);
  const [settingsResetToken, setSettingsResetToken] = useState(0);
  const [settingsForceScreen, setSettingsForceScreen] = useState<SettingsScreenName | null>(null);
  const [settingsForceScreenToken, setSettingsForceScreenToken] = useState(0);
  const [showAddPage, setShowAddPage] = useState(false);

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
    setShowAddPage(true);
  }, []);

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
      if (tab === 'account' && activeTab === 'account') {
        setAccountsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'account' && activeTab !== 'account') {
        setAccountsResetToRootToken((prev) => prev + 1);
      }
      if (tab === 'settings' && activeTab === 'settings') {
        setSettingsForceScreen(null);
        setSettingsResetToken((prev) => prev + 1);
        setSettingsScrollTopToken((prev) => prev + 1);
      }
      setActiveTab(tab);
    },
    [activeTab, jumpTransactionsToMonth],
  );

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

      <View style={styles.flex}>
        <MountedTab active={activeTab === 'home'}>
          <MemoHomeScreen scrollToTopToken={homeScrollTopToken} />
        </MountedTab>
        <MountedTab active={activeTab === 'transactions'}>
          <MemoTransactionsScreen
            scrollToTopToken={transactionsScrollTopToken}
            focusMonthKey={transactionsFocusMonthKey}
            focusMonthToken={transactionsFocusMonthToken}
            onPressAddTransaction={openAddTransaction}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'account'}>
          <MemoAccountsScreen
            resetToRootToken={accountsResetToRootToken}
            scrollToTopToken={accountsScrollTopToken}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'insights'}>
          <MemoInsightsScreen resetToCurrentMonthToken={insightsResetToMonthToken} />
        </MountedTab>
        <MountedTab active={activeTab === 'settings'}>
          <MemoSettingsStack
            resetToRootToken={settingsResetToken}
            scrollToTopToken={settingsScrollTopToken}
            forceScreen={settingsForceScreen}
            forceScreenToken={settingsForceScreenToken}
          />
        </MountedTab>
      </View>

      {showAddPage ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 20 }]}>
          <View className="flex-1 bg-background" style={themeStyle}>
            <AddTransactionScreen onClose={() => setShowAddPage(false)} />
          </View>
        </View>
      ) : null}

      {!showAddPage ? <BottomNav activeTab={activeTab} onTabChange={handleTabChange} /> : null}
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

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
import { ThemeModal } from '~/components/ui/theme-modal';
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

/**
 * Computes the resolved theme, applies side-effects (NativeWind + RN Appearance),
 * and wraps children in ThemeProvider so all descendants get the resolved value.
 */
function ThemeGate({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const { setColorScheme } = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(() =>
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (settings.themeMode === 'system') {
      Appearance.setColorScheme(null);
      setSystemScheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
    } else {
      Appearance.setColorScheme(settings.themeMode);
    }
    setColorScheme(settings.themeMode === 'system' ? 'system' : settings.themeMode);
  }, [settings.themeMode, setColorScheme]);

  const resolved: 'light' | 'dark' =
    settings.themeMode === 'system' ? systemScheme : settings.themeMode;

  return <ThemeProvider value={resolved}>{children}</ThemeProvider>;
}

function AppContent() {
  const { isLoading, settings, updateSettings } = useApp();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const themeStyle = useThemeVars();
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [transactionsScrollTopToken, setTransactionsScrollTopToken] = useState(0);
  const [transactionsFocusMonthKey, setTransactionsFocusMonthKey] = useState<string | null>(null);
  const [transactionsFocusMonthToken, setTransactionsFocusMonthToken] = useState(0);
  const [insightsResetToMonthToken, setInsightsResetToMonthToken] = useState(0);
  const [accountsResetToRootToken, setAccountsResetToRootToken] = useState(0);
  const [settingsResetToken, setSettingsResetToken] = useState(0);
  const [settingsForceScreen, setSettingsForceScreen] = useState<SettingsScreenName | null>(null);
  const [settingsForceScreenToken, setSettingsForceScreenToken] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

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
    setShowAddModal(true);
  }, []);

  const handleTabChange = useCallback(
    (tab: TabName) => {
      if (tab === 'transactions' && activeTab === 'transactions') {
        jumpTransactionsToMonth(monthKeyFromDateLocal(new Date()));
        setTransactionsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'insights' && activeTab === 'insights') {
        setInsightsResetToMonthToken((prev) => prev + 1);
      }
      if (tab === 'account') {
        setAccountsResetToRootToken((prev) => prev + 1);
      }
      if (tab === 'settings' && activeTab === 'settings') {
        setSettingsForceScreen(null);
        setSettingsResetToken((prev) => prev + 1);
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
          <MemoHomeScreen />
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
          <MemoAccountsScreen resetToRootToken={accountsResetToRootToken} />
        </MountedTab>
        <MountedTab active={activeTab === 'insights'}>
          <MemoInsightsScreen resetToCurrentMonthToken={insightsResetToMonthToken} />
        </MountedTab>
        <MountedTab active={activeTab === 'settings'}>
          <MemoSettingsStack
            resetToRootToken={settingsResetToken}
            forceScreen={settingsForceScreen}
            forceScreenToken={settingsForceScreenToken}
          />
        </MountedTab>
      </View>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      <ThemeModal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <AddTransactionScreen onClose={() => setShowAddModal(false)} />
      </ThemeModal>
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

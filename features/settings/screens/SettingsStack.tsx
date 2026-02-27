import { StackActions } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useApp } from '~/context/AppContext';
import {
  type SettingsScreenName,
  type SettingsStackNavigationProp,
  SettingsStackNavigator,
  type SettingsStackRouteProps,
} from '~/navigation/settingsStack';
import {
  SHARED_NATIVE_STACK_OPTIONS,
} from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';

import { AccountsScreen } from './AccountsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
import { WageCalculatorFlowScreen } from './WageCalculatorFlowScreen';

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  forceScreen?: SettingsScreenName | null;
  forceScreenToken?: number;
  onOpenRecurringEditor: (ruleId?: string) => void;
}

function SettingsHomeRoute({
  navigation,
  scrollToTopToken,
}: SettingsStackRouteProps<'SettingsHome'> & {
  scrollToTopToken: number;
}) {
  return (
    <SettingsScreen
      scrollToTopToken={scrollToTopToken}
      onOpenDisplay={() => navigation.navigate('DisplaySettings')}
      onOpenHourlyValue={() => navigation.navigate('HourlyValue')}
      onOpenAccounts={() => navigation.navigate('Accounts')}
      onOpenCategories={() => navigation.navigate('Categories')}
      onOpenRecurring={() => navigation.navigate('Recurring')}
    />
  );
}

function WageCalculatorRoute({ route, navigation }: SettingsStackRouteProps<'WageCalculator'>) {
  const { settings, updateWageConfigForMonth } = useApp();
  const { monthKey, initialConfig } = route.params;

  return (
    <WageCalculatorFlowScreen
      initialConfig={initialConfig}
      settings={settings}
      monthLabel={monthKey}
      onCancel={() => navigation.goBack()}
      onComplete={(config) => {
        updateWageConfigForMonth(monthKey, config);
        navigation.goBack();
      }}
    />
  );
}

export function SettingsStack({
  resetToRootToken = 0,
  scrollToTopToken = 0,
  forceScreen = null,
  forceScreenToken = 0,
  onOpenRecurringEditor,
}: SettingsStackProps) {
  const stackNavigationRef = useRef<SettingsStackNavigationProp | null>(null);
  const suppressClosingHapticUntilRef = useRef(0);
  const suppressProgrammaticClosingHaptics = useCallback((durationMs = 600) => {
    suppressClosingHapticUntilRef.current = Date.now() + durationMs;
  }, []);
  const screenListeners = useMemo(
    () =>
      createNativeStackSwipeHapticListeners({
        shouldSuppress: () => Date.now() < suppressClosingHapticUntilRef.current,
      }),
    [],
  );

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    const nav = stackNavigationRef.current;
    if (!nav) return;
    suppressProgrammaticClosingHaptics();
    if (nav.canGoBack()) {
      nav.dispatch(StackActions.popToTop());
    }
  }, [resetToRootToken, suppressProgrammaticClosingHaptics]);

  useEffect(() => {
    if (!forceScreen) return;
    const navigation = stackNavigationRef.current;
    if (!navigation) return;

    suppressProgrammaticClosingHaptics();
    if (navigation.canGoBack()) {
      navigation.dispatch(StackActions.popToTop());
    }
    if (forceScreen === 'SettingsHome') return;

    const frame = requestAnimationFrame(() => {
      navigation.navigate(forceScreen);
    });

    return () => cancelAnimationFrame(frame);
  }, [forceScreen, forceScreenToken, suppressProgrammaticClosingHaptics]);

  return (
    <SettingsStackNavigator.Navigator
      initialRouteName="SettingsHome"
      screenOptions={SHARED_NATIVE_STACK_OPTIONS}
      screenListeners={screenListeners}
    >
      <SettingsStackNavigator.Screen name="SettingsHome">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <SettingsHomeRoute {...props} scrollToTopToken={scrollToTopToken} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="DisplaySettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <DisplaySettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="HourlyValue">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <HourlyValueScreen
              onClose={() => props.navigation.goBack()}
              onOpenWageCalculator={({ monthKey, initialConfig }) =>
                props.navigation.navigate('WageCalculator', { monthKey, initialConfig })
              }
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="WageCalculator">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <WageCalculatorRoute {...props} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Accounts">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <AccountsScreen
              onBack={() => props.navigation.goBack()}
              managementOnly
              useNativeBackGesture
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Categories">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <CategoriesScreen
              onBack={() => props.navigation.goBack()}
              useNativeBackGesture
              onOpenParent={(parentId) =>
                props.navigation.navigate('CategoriesSubcategories', { parentId })
              }
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="CategoriesSubcategories">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <CategoriesScreen
              onBack={() => props.navigation.goBack()}
              useNativeBackGesture
              parentId={props.route.params.parentId}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Recurring">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <RecurringScreen
              onBack={() => props.navigation.goBack()}
              onOpenEditor={onOpenRecurringEditor}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
    </SettingsStackNavigator.Navigator>
  );
}

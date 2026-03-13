import { StackActions } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useApp } from '~/context/AppContext';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import {
  type SettingsStackNavigationProp,
  SettingsStackNavigator,
  type SettingsStackRouteProps,
} from '~/navigation/settingsStack';
import { SHARED_NATIVE_STACK_OPTIONS } from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';
import { AnalyticsEvents, setSuperProperties, trackEvent } from '~/services/analytics';

import { AccountSettingsScreen } from './AccountSettingsScreen';
import { AccountsScreen } from './AccountsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DataManagementScreen } from './DataManagementScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
import { WageCalculatorFlowScreen } from './WageCalculatorFlowScreen';

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  onOpenRecurringEditor: (ruleId?: string) => void;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (
    targetId: 'settings.start_tutorial' | 'settings.recurring' | 'settings.management',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

function SettingsHomeRoute({
  navigation,
  scrollToTopToken,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsStackRouteProps<'SettingsHome'> & {
  scrollToTopToken: number;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (
    targetId: 'settings.start_tutorial' | 'settings.recurring' | 'settings.management',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}) {
  return (
    <SettingsScreen
      scrollToTopToken={scrollToTopToken}
      onOpenDisplay={() => {
        navigation.navigate('DisplaySettings');
        void setSuperProperties({ current_screen: 'DisplaySettings' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'DisplaySettings' });
      }}
      onOpenHourlyValue={() => {
        navigation.navigate('HourlyValue');
        void setSuperProperties({ current_screen: 'HourlyValue' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'HourlyValue' });
      }}
      onOpenAccountSettings={() => {
        navigation.navigate('AccountSettings');
        void setSuperProperties({ current_screen: 'AccountSettings' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'AccountSettings' });
      }}
      onOpenAccounts={() => {
        navigation.navigate('Accounts');
        void setSuperProperties({ current_screen: 'Accounts' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'Accounts' });
      }}
      onOpenCategories={() => {
        navigation.navigate('Categories');
        void setSuperProperties({ current_screen: 'Categories' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'Categories' });
      }}
      onOpenRecurring={() => {
        navigation.navigate('Recurring');
        void setSuperProperties({ current_screen: 'Recurring' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'Recurring' });
      }}
      onOpenDataManagement={() => {
        navigation.navigate('DataManagement');
        void setSuperProperties({ current_screen: 'DataManagement' });
        void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: 'DataManagement' });
      }}
      onStartTutorial={onStartTutorial}
      onTutorialTargetLayout={onTutorialTargetLayout}
      tutorialSpotlightRequest={tutorialSpotlightRequest}
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
  onOpenRecurringEditor,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
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

  return (
    <SettingsStackNavigator.Navigator
      initialRouteName="SettingsHome"
      screenOptions={SHARED_NATIVE_STACK_OPTIONS}
      screenListeners={screenListeners}
    >
      <SettingsStackNavigator.Screen name="SettingsHome">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <SettingsHomeRoute
              {...props}
              scrollToTopToken={scrollToTopToken}
              onStartTutorial={onStartTutorial}
              onTutorialTargetLayout={onTutorialTargetLayout}
              tutorialSpotlightRequest={tutorialSpotlightRequest}
            />
          );
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
      <SettingsStackNavigator.Screen name="AccountSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <AccountSettingsScreen onBack={() => props.navigation.goBack()} />;
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
              useNativeBackGesture
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="DataManagement">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <DataManagementScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
    </SettingsStackNavigator.Navigator>
  );
}

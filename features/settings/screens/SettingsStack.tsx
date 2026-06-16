import { StackActions } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useApp } from '~/context/AppContext';
import { NewsScreen } from '~/features/news/screens/NewsScreen';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import {
  type SettingsStackNavigationProp,
  SettingsStackNavigator,
  type SettingsStackParamList,
  type SettingsStackRouteProps,
} from '~/navigation/settingsStack';
import { SHARED_NATIVE_STACK_OPTIONS } from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';

import { AccountSettingsScreen } from './AccountSettingsScreen';
import { AccountsScreen } from './AccountsScreen';
import { AutoBackupScreen } from './AutoBackupScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DataManagementScreen } from './DataManagementScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { ProManagementScreen } from './ProManagementScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { NotificationDetailScreen } from './NotificationDetailScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { QuickEntrySettingsScreen } from './QuickEntrySettingsScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
import { ShareAndEarnScreen } from './ShareAndEarnScreen';
import { StatementImportListScreen, StatementImportScreen } from './StatementImportScreen';
import { WageCalculatorFlowScreen } from './WageCalculatorFlowScreen';
import { WidgetPreviewsScreen } from './WidgetPreviewsScreen';

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  onOpenRecurringEditor: (ruleId?: string) => void;
  onOpenProPaywall: () => void;
  onScreenChange?: (screen: string) => void;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (
    targetId:
      | 'settings.start_tutorial'
      | 'settings.recurring'
      | 'settings.management'
      | 'settings.statement_import',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

function getSettingsAnalyticsScreen(routeName: keyof SettingsStackParamList): string {
  switch (routeName) {
    case 'SettingsHome':
      return 'settings';
    case 'CategoriesSubcategories':
      return 'Categories';
    default:
      return routeName;
  }
}

function SettingsHomeRoute({
  navigation,
  scrollToTopToken,
  onOpenProPaywall,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsStackRouteProps<'SettingsHome'> & {
  scrollToTopToken: number;
  onOpenProPaywall: () => void;
  onStartTutorial: () => void;
  onTutorialTargetLayout?: (
    targetId:
      | 'settings.start_tutorial'
      | 'settings.recurring'
      | 'settings.management'
      | 'settings.statement_import',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}) {
  return (
    <SettingsScreen
      scrollToTopToken={scrollToTopToken}
      onOpenDisplay={() => navigation.navigate('DisplaySettings')}
      onOpenHourlyValue={() => navigation.navigate('HourlyValue')}
      onOpenAccountSettings={() => navigation.navigate('AccountSettings')}
      onOpenAccounts={() => navigation.navigate('Accounts')}
      onOpenCategories={() => navigation.navigate('Categories')}
      onOpenRecurring={() => navigation.navigate('Recurring')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenDataManagement={() => navigation.navigate('DataManagement')}
      onOpenNews={() => navigation.navigate('News')}
      onOpenStatementImport={() => navigation.navigate('StatementImport')}
      onOpenQuickEntry={() => navigation.navigate('QuickEntrySettings')}
      onOpenWidgetPreviews={__DEV__ ? () => navigation.navigate('WidgetPreviews') : undefined}
      onOpenProPaywall={onOpenProPaywall}
      onOpenProManagement={() => navigation.navigate('ProManagement')}
      onOpenShareAndEarn={() => navigation.navigate('ShareAndEarn')}
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
  onOpenProPaywall,
  onScreenChange,
  onStartTutorial,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: SettingsStackProps) {
  const stackNavigationRef = useRef<SettingsStackNavigationProp | null>(null);
  const isResettingToRootRef = useRef(false);
  const suppressClosingHapticUntilRef = useRef(0);
  const suppressProgrammaticClosingHaptics = useCallback((durationMs = 600) => {
    suppressClosingHapticUntilRef.current = Date.now() + durationMs;
  }, []);
  const swipeBackScreenListeners = useMemo(
    () =>
      createNativeStackSwipeHapticListeners({
        shouldSuppress: () => Date.now() < suppressClosingHapticUntilRef.current,
      }),
    [],
  );
  const screenListeners = useCallback(
    (context: Parameters<typeof swipeBackScreenListeners>[0]) => ({
      ...swipeBackScreenListeners(context),
      focus: () => {
        const nextScreen = getSettingsAnalyticsScreen(
          context.route.name as keyof SettingsStackParamList,
        );

        if (isResettingToRootRef.current) {
          if (nextScreen !== 'settings') return;
          isResettingToRootRef.current = false;
        }

        onScreenChange?.(nextScreen);
      },
    }),
    [onScreenChange, swipeBackScreenListeners],
  );

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    const nav = stackNavigationRef.current;
    if (!nav) return;
    suppressProgrammaticClosingHaptics();
    if (nav.canGoBack()) {
      isResettingToRootRef.current = true;
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
              onOpenProPaywall={onOpenProPaywall}
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
      <SettingsStackNavigator.Screen name="Notifications">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <NotificationsScreen
              onBack={() => props.navigation.goBack()}
              onOpenDetail={(type) => props.navigation.navigate('NotificationDetail', { type })}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="NotificationDetail">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <NotificationDetailScreen
              type={props.route.params.type}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="DataManagement">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <DataManagementScreen
              onBack={() => props.navigation.goBack()}
              onOpenAutoBackup={() => props.navigation.navigate('AutoBackupSettings')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="News">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <NewsScreen
              onBack={() => props.navigation.goBack()}
              onOpenShareEarn={() => props.navigation.navigate('ShareAndEarn')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="AutoBackupSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <AutoBackupScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="StatementImport">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <StatementImportScreen
              onBack={() => props.navigation.goBack()}
              onOpenList={(params) => props.navigation.navigate('StatementImportList', params)}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="StatementImportList">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          const { section, transactions, indices, excludedIndices, onToggle } = props.route.params;
          return (
            <StatementImportListScreen
              section={section}
              transactions={transactions}
              indices={indices}
              excludedIndices={excludedIndices}
              onToggle={onToggle}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="ProManagement">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <ProManagementScreen
              onBack={() => props.navigation.goBack()}
              onOpenPaywall={onOpenProPaywall}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="ShareAndEarn">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <ShareAndEarnScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="QuickEntrySettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <QuickEntrySettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      {__DEV__ ? (
        <SettingsStackNavigator.Screen name="WidgetPreviews">
          {(props) => {
            stackNavigationRef.current = props.navigation;
            return <WidgetPreviewsScreen onBack={() => props.navigation.goBack()} />;
          }}
        </SettingsStackNavigator.Screen>
      ) : null}
    </SettingsStackNavigator.Navigator>
  );
}

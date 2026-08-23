import { StackActions } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { ItemsScreen } from '~/features/items/screens';
import { NewsScreen } from '~/features/news/screens/NewsScreen';
import { ReimbursementSettingsScreen } from '~/features/reimbursements/screens/ReimbursementSettingsScreen';
import { ReimbursementsScreen } from '~/features/reimbursements/screens/ReimbursementsScreen';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import {
  type SettingsStackNavigationProp,
  SettingsStackNavigator,
  type SettingsStackParamList,
  type SettingsStackRouteProps,
} from '~/navigation/settingsStack';
import { SHARED_NATIVE_STACK_OPTIONS } from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';
import { requestFocusInsight } from '~/services/insightsNavigation';
import { subscribeOpenSettingsScreenRequest } from '~/services/settingsNavigation';
import { requestOpenTab } from '~/services/tabNavigation';
import type { CategoryType, TransactionWithRelations, WageConfig } from '~/types';

import { AccountSettingsScreen } from './AccountSettingsScreen';
import { AccountsScreen } from './AccountsScreen';
import { AppLockScreen } from './AppLockScreen';
import { AutoBackupScreen } from './AutoBackupScreen';
import { AutoLogSettingsScreen } from './AutoLogSettingsScreen';
import { AutoLogTutorialScreen } from './AutoLogTutorialScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DataManagementScreen } from './DataManagementScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { ExchangeRatesScreen } from './ExchangeRatesScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { HourlyValueSettingsScreen } from './HourlyValueSettingsScreen';
import { NotificationDetailScreen } from './NotificationDetailScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { ProManagementScreen } from './ProManagementScreen';
import { QuickEntrySettingsScreen } from './QuickEntrySettingsScreen';
import { ReceiptSettingsScreen } from './ReceiptSettingsScreen';
import { ReceiptsScreen } from './ReceiptsScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
import { ShareAndEarnScreen } from './ShareAndEarnScreen';
import { StatementImportListScreen, StatementImportScreen } from './StatementImportScreen';
import { WidgetPreviewsScreen } from './WidgetPreviewsScreen';

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  onOpenRecurringEditor: (ruleId?: string) => void;
  onOpenItemEditor: (itemId?: string) => void;
  onOpenAccountEditor: (params?: { accountId?: string; presetGroupName?: string }) => void;
  onOpenPayCreditCard: (accountId: string) => void;
  onOpenCreateGroup: () => void;
  onOpenCategoryEditor: (params?: {
    categoryId?: string;
    parentId?: string;
    type?: CategoryType;
  }) => void;
  onOpenCategoryIconPicker: (session: CategoryIconPickerSession) => void;
  onOpenAddWageMonth: () => void;
  onOpenWageCalculator: (params: { monthKey: string; initialConfig: WageConfig }) => void;
  onOpenProPaywall: () => void;
  onOpenSettleUp: () => void;
  onOpenEditTransaction: (transaction: TransactionWithRelations) => void;
  onScreenChange?: (screen: string) => void;
}

function getSettingsAnalyticsScreen(routeName: keyof SettingsStackParamList): string {
  switch (routeName) {
    case 'SettingsHome':
      return 'settings';
    default:
      return routeName;
  }
}

function SettingsHomeRoute({
  navigation,
  scrollToTopToken,
  onOpenProPaywall,
  onOpenSettleUp,
}: SettingsStackRouteProps<'SettingsHome'> & {
  scrollToTopToken: number;
  onOpenProPaywall: () => void;
  onOpenSettleUp: () => void;
}) {
  return (
    <SettingsScreen
      scrollToTopToken={scrollToTopToken}
      onOpenDisplay={() => navigation.navigate('DisplaySettings')}
      onOpenHourlyValue={() => navigation.navigate('HourlyValue')}
      onOpenAccountSettings={() => navigation.navigate('AccountSettings')}
      onOpenAccounts={() => navigation.navigate('Accounts')}
      onOpenItems={() => navigation.navigate('Items')}
      onOpenAlbums={() => requestOpenTab('albums')}
      onOpenExchangeRates={() => navigation.navigate('ExchangeRates')}
      onOpenCategories={() => navigation.navigate('Categories')}
      onOpenRecurring={() => navigation.navigate('Recurring')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenDataManagement={() => navigation.navigate('DataManagement')}
      onOpenNews={() => navigation.navigate('News')}
      onOpenStatementImport={() => navigation.navigate('StatementImport')}
      onOpenQuickEntry={() => navigation.navigate('QuickEntrySettings')}
      onOpenAutoLog={() => navigation.navigate('AutoLogSettings')}
      onOpenAppLock={() => navigation.navigate('AppLock')}
      onOpenReceipts={() => navigation.navigate('Receipts')}
      onOpenReimbursements={() => navigation.navigate('Reimbursements')}
      onOpenBudget={() => {
        requestOpenTab('insights');
        requestFocusInsight('budget');
      }}
      onOpenWidgetPreviews={__DEV__ ? () => navigation.navigate('WidgetPreviews') : undefined}
      onOpenProPaywall={onOpenProPaywall}
      onOpenProManagement={() => navigation.navigate('ProManagement')}
      onOpenShareAndEarn={() => navigation.navigate('ShareAndEarn')}
      onOpenSettleUp={onOpenSettleUp}
    />
  );
}

export function SettingsStack({
  resetToRootToken = 0,
  scrollToTopToken = 0,
  onOpenRecurringEditor,
  onOpenItemEditor,
  onOpenAccountEditor,
  onOpenPayCreditCard,
  onOpenCreateGroup,
  onOpenCategoryEditor,
  onOpenCategoryIconPicker,
  onOpenAddWageMonth,
  onOpenWageCalculator,
  onOpenProPaywall,
  onOpenSettleUp,
  onOpenEditTransaction,
  onScreenChange,
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

  // The root-level announcement modal lives outside this stack, so CTAs that
  // point at a settings screen arrive as an imperative request (paired with
  // requestOpenTab('settings') on the caller's side).
  useEffect(
    () =>
      subscribeOpenSettingsScreenRequest((route) => {
        stackNavigationRef.current?.navigate(route);
      }),
    [],
  );

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
              onOpenSettleUp={onOpenSettleUp}
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
              onOpenWageCalculator={onOpenWageCalculator}
              onOpenAddWageMonth={onOpenAddWageMonth}
              onOpenSettings={() => props.navigation.navigate('HourlyValueSettings')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="HourlyValueSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <HourlyValueSettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="AccountSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <AccountSettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="ExchangeRates">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <ExchangeRatesScreen onBack={() => props.navigation.goBack()} />;
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
              onOpenAccountEditor={onOpenAccountEditor}
              onOpenPayCreditCard={onOpenPayCreditCard}
              onOpenCreateGroup={onOpenCreateGroup}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Items">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <ItemsScreen onBack={() => props.navigation.goBack()} onOpenItem={onOpenItemEditor} />
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
              onOpenCategoryEditor={onOpenCategoryEditor}
              onOpenIconPicker={onOpenCategoryIconPicker}
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
              onOpenQuickEntrySettings={() => props.navigation.navigate('QuickEntrySettings')}
              onOpenAutoLog={() => props.navigation.navigate('AutoLogSettings')}
              onOpenFirstDayOfMonth={() => props.navigation.navigate('DisplaySettings')}
              onOpenExcelExport={() => props.navigation.navigate('DataManagement')}
              onOpenAutoBackup={() => props.navigation.navigate('AutoBackupSettings')}
              onOpenIconStyle={() => props.navigation.navigate('DisplaySettings')}
              onOpenReview={() => {
                requestOpenTab('insights');
                requestFocusInsight('review');
              }}
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
          const { section, transactions, indices, excludedIndices, currency, onToggle } =
            props.route.params;
          return (
            <StatementImportListScreen
              section={section}
              transactions={transactions}
              indices={indices}
              excludedIndices={excludedIndices}
              currency={currency}
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
      <SettingsStackNavigator.Screen name="AutoLogSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <AutoLogSettingsScreen
              onBack={() => props.navigation.goBack()}
              onOpenTutorial={(topic) => props.navigation.navigate('AutoLogTutorial', { topic })}
              onOpenQuickEntry={() => props.navigation.navigate('QuickEntrySettings')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="AutoLogTutorial">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <AutoLogTutorialScreen
              topic={props.route.params.topic}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="AppLock">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <AppLockScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Receipts">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <ReceiptsScreen
              onBack={() => props.navigation.goBack()}
              onOpenEditTransaction={onOpenEditTransaction}
              onOpenSettings={() => props.navigation.navigate('ReceiptSettings')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="ReceiptSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <ReceiptSettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="Reimbursements">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <ReimbursementsScreen
              onBack={() => props.navigation.goBack()}
              onOpenSettings={() => props.navigation.navigate('ReimbursementSettings')}
            />
          );
        }}
      </SettingsStackNavigator.Screen>
      <SettingsStackNavigator.Screen name="ReimbursementSettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <ReimbursementSettingsScreen onBack={() => props.navigation.goBack()} />;
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

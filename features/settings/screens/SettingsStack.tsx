import { useEffect, useRef } from 'react';
import { StackActions } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { AccountsScreen } from './AccountsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
import { WageCalculatorFlowScreen } from './WageCalculatorFlowScreen';
import { useApp } from '~/context/AppContext';
import {
  DISABLE_BACK_GESTURE_STACK_OPTIONS,
  SHARED_NATIVE_STACK_OPTIONS,
} from '~/navigation/stackOptions';
import type { WageConfig } from '~/types';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  DisplaySettings: undefined;
  HourlyValue: undefined;
  WageCalculator: { monthKey: string; initialConfig: WageConfig };
  Accounts: undefined;
  Categories: undefined;
  CategoriesSubcategories: { parentId: string };
  Recurring: undefined;
};

export type SettingsScreenName = Exclude<
  keyof SettingsStackParamList,
  'CategoriesSubcategories' | 'WageCalculator'
>;

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  forceScreen?: SettingsScreenName | null;
  forceScreenToken?: number;
  onOpenRecurringEditor: (ruleId?: string) => void;
}

const Stack = createNativeStackNavigator<SettingsStackParamList>();

function SettingsHomeRoute({
  navigation,
  scrollToTopToken,
}: NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'> & {
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

function WageCalculatorRoute({
  route,
  navigation,
}: NativeStackScreenProps<SettingsStackParamList, 'WageCalculator'>) {
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
  const stackNavigationRef = useRef<NativeStackNavigationProp<SettingsStackParamList> | null>(null);

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    stackNavigationRef.current?.dispatch(StackActions.popToTop());
  }, [resetToRootToken]);

  useEffect(() => {
    if (!forceScreen) return;
    const navigation = stackNavigationRef.current;
    if (!navigation) return;

    navigation.dispatch(StackActions.popToTop());
    if (forceScreen === 'SettingsHome') return;

    const frame = requestAnimationFrame(() => {
      navigation.navigate(forceScreen);
    });

    return () => cancelAnimationFrame(frame);
  }, [forceScreen, forceScreenToken]);

  return (
    <Stack.Navigator initialRouteName="SettingsHome" screenOptions={SHARED_NATIVE_STACK_OPTIONS}>
      <Stack.Screen name="SettingsHome">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <SettingsHomeRoute {...props} scrollToTopToken={scrollToTopToken} />;
        }}
      </Stack.Screen>
      <Stack.Screen name="DisplaySettings">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <DisplaySettingsScreen onBack={() => props.navigation.goBack()} />;
        }}
      </Stack.Screen>
      <Stack.Screen name="HourlyValue">
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
      </Stack.Screen>
      <Stack.Screen name="WageCalculator">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <WageCalculatorRoute {...props} />;
        }}
      </Stack.Screen>
      <Stack.Screen name="Accounts" options={DISABLE_BACK_GESTURE_STACK_OPTIONS}>
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return <AccountsScreen onBack={() => props.navigation.goBack()} managementOnly />;
        }}
      </Stack.Screen>
      <Stack.Screen name="Categories">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <CategoriesScreen
              onBack={() => props.navigation.goBack()}
              onOpenParent={(parentId) =>
                props.navigation.navigate('CategoriesSubcategories', { parentId })
              }
            />
          );
        }}
      </Stack.Screen>
      <Stack.Screen name="CategoriesSubcategories">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <CategoriesScreen
              onBack={() => props.navigation.goBack()}
              parentId={props.route.params.parentId}
            />
          );
        }}
      </Stack.Screen>
      <Stack.Screen name="Recurring">
        {(props) => {
          stackNavigationRef.current = props.navigation;
          return (
            <RecurringScreen
              onBack={() => props.navigation.goBack()}
              onOpenEditor={onOpenRecurringEditor}
            />
          );
        }}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

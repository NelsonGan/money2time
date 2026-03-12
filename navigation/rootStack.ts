import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import type { WageConfig } from '~/types';

export type RootStackParamList = {
  Main: undefined;
  AddTransaction: { initialAccountId?: string } | undefined;
  EditTransaction: { transactionId: string };
  AccountDetail: { accountId: string };
  InsightsDrilldown: InsightsDrilldownPayload;
  RecurringEditor: { ruleId?: string } | undefined;
  SettingsRecurring: undefined;
  SettingsAccounts: undefined;
  SettingsHourlyValue: undefined;
  SettingsWageCalculator: { monthKey: string; initialConfig: WageConfig };
};

export type RootMainNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;
export type RootStackRouteProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export const RootStack = createNativeStackNavigator<RootStackParamList>();

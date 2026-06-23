import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import type { TransactionSentiment, TransactionType, WageConfig } from '~/types';

export interface AddTransactionInitialValues {
  type?: TransactionType;
  amount?: string;
  date?: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string;
  sentiment?: TransactionSentiment;
}

export type RootStackParamList = {
  Main: undefined;
  AddTransaction:
    | { initialAccountId?: string; initialValues?: AddTransactionInitialValues }
    | undefined;
  AddTransactionDetailed:
    | { initialAccountId?: string; initialValues?: AddTransactionInitialValues }
    | undefined;
  EditTransaction: { transactionId: string; openSplitBill?: boolean };
  AccountDetail: { accountId: string };
  InsightsDrilldown: InsightsDrilldownPayload;
  RecurringEditor: { ruleId?: string } | undefined;
  SettingsRecurring: undefined;
  SettingsAccounts: undefined;
  SettingsHourlyValue: undefined;
  SettingsQuickEntry: undefined;
  SettingsMultiCurrency: undefined;
  SettingsWageCalculator: { monthKey: string; initialConfig: WageConfig };
  ShareAndEarn: undefined;
  ProPaywall: { source?: string; flashMessage?: string } | undefined;
};

export type RootMainNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;
export type RootStackRouteProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export const RootStack = createNativeStackNavigator<RootStackParamList>();

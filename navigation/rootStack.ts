import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import type { CategoryType, TransactionSentiment, TransactionType, WageConfig } from '~/types';

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
  AccountEditor: { accountId?: string; presetGroupName?: string } | undefined;
  PayCreditCard: { accountId: string };
  AccountGroupEditor: undefined;
  CategoryEditor: { categoryId?: string; parentId?: string; type?: CategoryType } | undefined;
  InsightsDrilldown: InsightsDrilldownPayload;
  RecurringEditor: { ruleId?: string } | undefined;
  SettingsRecurring: undefined;
  SettingsAccounts: undefined;
  SettingsHourlyValue: undefined;
  AddWageMonth: undefined;
  SettingsQuickEntry: undefined;
  SettingsMultiCurrency: undefined;
  SettingsAutoBackup: undefined;
  SettingsWageCalculator: { monthKey: string; initialConfig: WageConfig };
  ShareAndEarn: undefined;
  ProPaywall: { source?: string; flashMessage?: string } | undefined;
  CreateAlbum: { initialTransactionIds?: string[] } | undefined;
  AlbumDetail: { albumId: string };
  EditAlbumTransactions: { albumId: string };
  AddAlbumTransactions: { albumId: string };
  EditAlbumDetails: { albumId: string };
  ItemEditor: { itemId?: string } | undefined;
  BudgetTemplateEditor: { templateId?: string; duplicateFromId?: string } | undefined;
  // Root-level budget screens for imperative opens (widget deep link).
  SettingsBudget: undefined;
  SettingsBudgetTemplates: undefined;
};

export type RootMainNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;
export type RootStackRouteProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export const RootStack = createNativeStackNavigator<RootStackParamList>();

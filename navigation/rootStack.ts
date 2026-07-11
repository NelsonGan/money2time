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
  /** Entry currency (e.g. from a scanned receipt). */
  currency?: string;
  /** Stored receipt relative path to attach on save (e.g. `receipts/9f3c.jpg`). */
  receiptUri?: string | null;
}

export type RootStackParamList = {
  Main: undefined;
  AddTransaction:
    | { initialAccountId?: string; initialValues?: AddTransactionInitialValues }
    | undefined;
  AddTransactionDetailed:
    | { initialAccountId?: string; initialValues?: AddTransactionInitialValues }
    | undefined;
  // Multi-transaction receipt-scan review. Its drafts + receipt path ride the
  // scanReviewBridge module (not params) so the route stays serializable.
  ScanReview: undefined;
  // Full editor for one scanned draft. Its initial values + onDone callback ride
  // the scanEditBridge module (not params), so the route stays serializable.
  ScanDraftEdit: undefined;
  EditTransaction: { transactionId: string; openSplitBill?: boolean };
  SettleUp: undefined;
  SettleUpSettings: undefined;
  SettleUpPerson: { personKey: string };
  SettleUpTransaction: { transactionId: string };
  SplitBill: { toast?: string } | undefined;
  AccountDetail: { accountId: string };
  AccountEditor: { accountId?: string; presetGroupName?: string } | undefined;
  // Full-page account logo picker. Its selected id + onSelect callback ride a
  // module bridge (accountLogoPickerBridge) rather than params, so the route
  // stays serializable.
  AccountLogoPicker: undefined;
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
  // Full-page item icon picker. Its selected id + onSelect callback ride a
  // module bridge (itemIconPickerBridge) rather than params, so the route stays
  // serializable.
  ItemIconPicker: undefined;
  BudgetTemplateEditor: { templateId?: string; duplicateFromId?: string } | undefined;
  // Edit an existing month budget (budgetId) or create a one-off custom
  // budget for a month with no live budget (createForMonth, 'YYYY-MM').
  BudgetMonthEditor: { budgetId: string } | { createForMonth: string };
  // Full-page per-category allocation editor. Its draft slice + commit callback
  // ride a module bridge (categoryAllocationBridge) rather than params, so the
  // route stays serializable.
  BudgetCategoryAllocation: undefined;
  // Budget templates manager (opened from the Insights budget header).
  SettingsBudgetTemplates: undefined;
};

export type RootMainNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;
export type RootStackRouteProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export const RootStack = createNativeStackNavigator<RootStackParamList>();

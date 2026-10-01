import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

export type NotificationDetailType = 'dailyCheckin' | 'weeklyReview' | 'monthlyReview';

/**
 * Named after the Shortcuts action each iOS auto-log walkthrough sets up;
 * `shareScreenshot` is the Android one (sharing a screenshot to the app).
 */
export type AutoLogTutorialTopic =
  | 'logPayment'
  | 'newTransaction'
  | 'logScreenshot'
  | 'shareScreenshot';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  DisplaySettings: undefined;
  AppIcon: undefined;
  MonthCycle: undefined;
  HourlyValue: undefined;
  HourlyValueSettings: undefined;
  AccountSettings: undefined;
  Accounts: undefined;
  Items: undefined;
  ExchangeRates: undefined;
  Categories: undefined;
  Recurring: undefined;
  Notifications: undefined;
  NotificationDetail: { type: NotificationDetailType };
  DataManagement: undefined;
  News: undefined;
  AutoBackupSettings: undefined;
  StatementImport: undefined;
  StatementImportList: {
    section: 'expense' | 'income';
    transactions: {
      date: string;
      description: string;
      amount: number;
      category?: string;
      account?: string;
      currency?: string;
    }[];
    indices: number[];
    excludedIndices: number[];
    /** Currency the previewed amounts are denominated in. */
    currency: string;
    onToggle: (index: number) => void;
  };
  ProManagement: undefined;
  ShareAndEarn: undefined;
  QuickEntrySettings: undefined;
  AutoLogSettings: undefined;
  AutoLogTutorial: { topic: AutoLogTutorialTopic };
  AppLock: undefined;
  Receipts: undefined;
  ReceiptSettings: undefined;
  Reimbursements: undefined;
  ReimbursementSettings: undefined;
  Widgets: undefined;
  LiveEarnings: undefined;
  WidgetPreviews: undefined;
};

export type SettingsStackNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;
export type SettingsStackRouteProps<RouteName extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, RouteName>;

export const SettingsStackNavigator = createNativeStackNavigator<SettingsStackParamList>();

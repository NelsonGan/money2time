import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

export type NotificationDetailType = 'dailyCheckin' | 'weeklySummary';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  DisplaySettings: undefined;
  HourlyValue: undefined;
  AccountSettings: undefined;
  Accounts: undefined;
  Items: undefined;
  Goals: undefined;
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
    }[];
    indices: number[];
    excludedIndices: number[];
    onToggle: (index: number) => void;
  };
  ProManagement: undefined;
  ShareAndEarn: undefined;
  QuickEntrySettings: undefined;
  AppLock: undefined;
  WidgetPreviews: undefined;
};

export type SettingsStackNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;
export type SettingsStackRouteProps<RouteName extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, RouteName>;

export const SettingsStackNavigator = createNativeStackNavigator<SettingsStackParamList>();

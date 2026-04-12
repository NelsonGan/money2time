import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import type { WageConfig } from '~/types';

export type NotificationDetailType = 'dailyCheckin' | 'weeklySummary';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  DisplaySettings: undefined;
  HourlyValue: undefined;
  WageCalculator: { monthKey: string; initialConfig: WageConfig };
  AccountSettings: undefined;
  Accounts: undefined;
  Categories: undefined;
  CategoriesSubcategories: { parentId: string };
  Recurring: undefined;
  Notifications: undefined;
  NotificationDetail: { type: NotificationDetailType };
  DataManagement: undefined;
  StatementImport: undefined;
  StatementImportList: {
    section: 'expense' | 'income';
    transactions: { date: string; description: string; amount: number; category?: string; account?: string }[];
    indices: number[];
    excludedIndices: number[];
    onToggle: (index: number) => void;
  };
  ProManagement: undefined;
};

export type SettingsStackNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;
export type SettingsStackRouteProps<RouteName extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, RouteName>;

export const SettingsStackNavigator = createNativeStackNavigator<SettingsStackParamList>();

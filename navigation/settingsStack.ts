import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

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

export type SettingsStackNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;
export type SettingsStackRouteProps<RouteName extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, RouteName>;

export const SettingsStackNavigator = createNativeStackNavigator<SettingsStackParamList>();

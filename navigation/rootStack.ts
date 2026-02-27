import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import type { InsightsDrilldownPayload } from '~/features/insights/screens';

export type RootStackParamList = {
  Main: undefined;
  AddTransaction: undefined;
  EditTransaction: { transactionId: string };
  AccountDetail: { accountId: string };
  InsightsDrilldown: InsightsDrilldownPayload;
  RecurringEditor: { ruleId?: string } | undefined;
};

export type RootMainNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;
export type RootStackRouteProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export const RootStack = createNativeStackNavigator<RootStackParamList>();

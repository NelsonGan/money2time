import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export {
  buildMoney2TimeWidgetSnapshot,
  type Money2TimeWidgetSnapshot,
  type MonthlyExpenseQuickLogSnapshot,
} from './widgetSnapshot.shared';
import type { Money2TimeWidgetSnapshot } from './widgetSnapshot.shared';

export const WIDGET_SNAPSHOT_STORAGE_KEY = '@m2t/widget_snapshot/v1';

interface NativeWidgetModule {
  writeSnapshot?: (json: string) => Promise<void>;
  reloadAll?: () => Promise<void>;
}

const nativeWidgetModule = NativeModules.Money2TimeWidget as NativeWidgetModule | undefined;

export async function writeMoney2TimeWidgetSnapshot(snapshot: Money2TimeWidgetSnapshot) {
  const json = JSON.stringify(snapshot);

  if (nativeWidgetModule?.writeSnapshot && (Platform.OS === 'ios' || Platform.OS === 'android')) {
    await nativeWidgetModule.writeSnapshot(json);
    return;
  }

  await AsyncStorage.setItem(WIDGET_SNAPSHOT_STORAGE_KEY, json);
}

export async function reloadMoney2TimeWidgets() {
  await nativeWidgetModule?.reloadAll?.();
}

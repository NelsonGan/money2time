/**
 * Native (iOS + Android) home-screen icon switching, wrapping
 * `expo-alternate-app-icons`. The shared no-op shims (`appIcon.shared`) back
 * this surface on web and in tests.
 *
 * Dark mode is deliberately NOT handled here. Each variant registers its light,
 * dark and tinted faces as appearances of one icon, so iOS swaps them itself
 * when the system theme changes: silent, instant, and correct even while the app
 * is not running. Driving it from the app's own theme instead would mean calling
 * setAlternateIconName on every theme flip, and iOS shows a modal alert on every
 * successful call, so a user on the automatic theme would get one at dusk.
 * Android has no light/dark launcher icons at all; its equivalent is the themed
 * (monochrome) layer, which every variant also ships.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  appIconById,
  appIconIdForAlternateName,
  DEFAULT_APP_ICON_ID,
  isRetiredAlternateName,
} from '~/constants/appIcons';
import type { AppIconId } from '~/types';

type AlternateAppIconsModule = typeof import('expo-alternate-app-icons');

/**
 * Loaded through a guarded require because expo-alternate-app-icons reaches for
 * its native module at import time and throws when it is not there. AppContext
 * pulls this module in, so a plain import would take the whole app down on a dev
 * client built before the package was added, the same way MapLibre and
 * expo-camera would if they were not lazy.
 */
const alternateAppIcons: AlternateAppIconsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    return require('expo-alternate-app-icons') as AlternateAppIconsModule;
  } catch {
    return null;
  }
})();

export const supportsAppIconSwitching = alternateAppIcons?.supportsAlternateIcons ?? false;

export const getActiveAppIcon = (): AppIconId => {
  if (!alternateAppIcons) return DEFAULT_APP_ICON_ID;
  try {
    return appIconIdForAlternateName(alternateAppIcons.getAppIconName());
  } catch {
    return DEFAULT_APP_ICON_ID;
  }
};

/**
 * Android only: the icon this install last switched the launcher to. The OS is
 * the source of truth, but on Android it can only be read off the activity the
 * app was launched through, and a deep link or widget tap lands on
 * `MainActivity` even while an alias is enabled. Without this marker that
 * reads as "launcher is on the default, stored choice differs", and the load
 * sync disables the activity that is running, tearing it down under any open
 * `<Modal>` (Sentry MONEY2TIME-3Y: `DecorView ... not attached to window
 * manager`, repeated recreations of `MainActivityDetective`).
 */
const ANDROID_APPLIED_ICON_KEY = 'appIcon.androidApplied';

const readAndroidAppliedIcon = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ANDROID_APPLIED_ICON_KEY);
  } catch {
    return null;
  }
};

const writeAndroidAppliedIcon = async (id: AppIconId): Promise<void> => {
  try {
    await AsyncStorage.setItem(ANDROID_APPLIED_ICON_KEY, id);
  } catch {
    // Best effort: without the marker the next load just re-checks the OS.
  }
};

export const applyAppIcon = async (id: AppIconId): Promise<AppIconId> => {
  if (!alternateAppIcons || !supportsAppIconSwitching) return getActiveAppIcon();

  const target = appIconById(id).alternateName;
  // iOS raises its "You have changed the icon" alert on every *successful*
  // call, so a redundant one is not free. Android would restart the launcher
  // entry for nothing.
  if (alternateAppIcons.getAppIconName() === target) {
    if (Platform.OS === 'android') await writeAndroidAppliedIcon(id);
    return id;
  }

  await alternateAppIcons.setAlternateAppIcon(target);
  if (Platform.OS === 'android') await writeAndroidAppliedIcon(id);
  return id;
};

/**
 * Reconciles the launcher with the user's stored choice at load, as opposed to
 * `applyAppIcon`, which carries out a choice they just made.
 *
 * The two differ over a RETIRED alternate, and only on Android. There, being on
 * a retired alias is a live problem: switching icons enables an `activity-alias`
 * and disables `MainActivity`, that disabled state outlives the update that
 * retires the alias, and this reset is the only thing that turns MainActivity
 * back on. On iOS the same reset buys nothing — the alias is still registered
 * and already draws the default artwork — while costing the user Apple's modal
 * "You have changed the icon" alert on their first launch after the update, for
 * a change they did not ask for and cannot see.
 */
export const syncAppIcon = async (id: AppIconId): Promise<void> => {
  if (!alternateAppIcons || !supportsAppIconSwitching) return;
  if (Platform.OS !== 'android' && isRetiredAlternateName(alternateAppIcons.getAppIconName())) {
    return;
  }
  if (
    Platform.OS === 'android' &&
    !isRetiredAlternateName(alternateAppIcons.getAppIconName()) &&
    (await readAndroidAppliedIcon()) === id
  ) {
    // Already switched to this icon on this install; a differing read here is
    // just a launch through MainActivity, not a launcher that needs repair.
    return;
  }
  await applyAppIcon(id);
};

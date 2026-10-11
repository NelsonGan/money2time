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

export const applyAppIcon = async (id: AppIconId): Promise<AppIconId> => {
  if (!alternateAppIcons || !supportsAppIconSwitching) return getActiveAppIcon();

  const target = appIconById(id).alternateName;
  // iOS raises its "You have changed the icon" alert on every *successful*
  // call, so a redundant one is not free. Android would restart the launcher
  // entry for nothing.
  if (alternateAppIcons.getAppIconName() === target) return id;

  await alternateAppIcons.setAlternateAppIcon(target);
  return id;
};

/**
 * Whether the app may push its own light/dark choice into Android's AppCompat
 * night mode (`Appearance.setColorScheme`) without that recreating the activity.
 * Always true on iOS.
 *
 * AppCompat decides between "tell the activity" and "recreate it" by reading
 * the activity's `configChanges` from the manifest entry named after its class,
 * `.MainActivity`, and it looks that entry up without MATCH_DISABLED_COMPONENTS.
 * An alternate icon disables `.MainActivity` (see withAndroidAlternateIcons), so
 * in an activity launched through an icon alias the lookup throws, AppCompat
 * concludes the activity cannot handle a uiMode change, and recreates it. React
 * Native then tears down any open Modal against a window that no longer exists,
 * which crashes (Sentry MONEY2TIME-3Y / MONEY2TIME-62). The lock screen and the
 * feature announcement are Modals up at launch, so a user with an alternate icon
 * and a forced theme crashed on every launch.
 *
 * Read off the running activity: an alias in front means `.MainActivity` was
 * already disabled when it was created, which is when AppCompat cached the
 * flags. An activity created through `.MainActivity` keeps correct flags even
 * after the user then picks an alternate icon.
 */
export const canApplyNativeColorScheme = (): boolean => {
  if (Platform.OS !== 'android' || !alternateAppIcons) return true;
  try {
    return alternateAppIcons.getAppIconName() == null;
  } catch {
    return true;
  }
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
  await applyAppIcon(id);
};

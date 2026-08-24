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
import { appIconById, appIconIdForAlternateName, DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
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

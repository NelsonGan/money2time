/**
 * Cross-platform home-screen icon surface.
 *
 * The real implementation lives in `appIcon.native.ts` and wraps
 * `expo-alternate-app-icons`. Web and the test (node) environment get the no-op
 * shims below, so importing from `~/services/appIcon` is safe on any platform.
 */
import { DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
import type { AppIconId } from '~/types';

/** False on any device or platform that cannot swap its launcher icon. */
export const supportsAppIconSwitching = false;

/** What the OS is currently showing, as far as it will tell us. */
export const getActiveAppIcon = (): AppIconId => DEFAULT_APP_ICON_ID;

/**
 * Points the launcher at `id`. Resolves to what the OS ended up on, which is
 * the requested icon on success and the previous one if the platform refused.
 */
export const applyAppIcon = async (_id: AppIconId): Promise<AppIconId> => DEFAULT_APP_ICON_ID;

/** Reconciles the launcher with the stored choice at load. See the native one. */
export const syncAppIcon = async (_id: AppIconId): Promise<void> => {};

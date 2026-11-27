import type { SettingsStackParamList } from '~/navigation/settingsStack';

/** Settings screens that can be opened imperatively (no params needed). */
export type OpenableSettingsScreen = {
  [Route in keyof SettingsStackParamList]: SettingsStackParamList[Route] extends undefined
    ? Route
    : never;
}[keyof SettingsStackParamList];

type Listener = (route: OpenableSettingsScreen) => void;

const listeners = new Set<Listener>();

/** How long a request waits for the Settings stack to mount before it is dropped. */
export const PENDING_SETTINGS_SCREEN_TTL_MS = 10_000;

let pending: { route: OpenableSettingsScreen; at: number } | null = null;

/**
 * Open a Settings screen from outside the settings stack (e.g. the root-level
 * announcement modal); pair with `requestOpenTab('settings')`.
 */
export function requestOpenSettingsScreen(route: OpenableSettingsScreen, now = Date.now()) {
  if (listeners.size === 0) {
    // The Settings stack has not mounted yet (a notification tapped while the
    // app was closed: the tab mounts a render later). Keep the request for it.
    pending = { route, at: now };
    return;
  }
  pending = null;
  listeners.forEach((listener) => listener(route));
}

export function subscribeOpenSettingsScreenRequest(listener: Listener, now = Date.now()) {
  listeners.add(listener);
  const waiting = pending;
  pending = null;
  if (waiting && now - waiting.at <= PENDING_SETTINGS_SCREEN_TTL_MS) listener(waiting.route);
  return () => {
    listeners.delete(listener);
  };
}

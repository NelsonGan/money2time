import type { SettingsStackParamList } from '~/navigation/settingsStack';

/** Settings screens that can be opened imperatively (no params needed). */
export type OpenableSettingsScreen = {
  [Route in keyof SettingsStackParamList]: SettingsStackParamList[Route] extends undefined
    ? Route
    : never;
}[keyof SettingsStackParamList];

type Listener = (route: OpenableSettingsScreen) => void;

const listeners = new Set<Listener>();

/**
 * Open a Settings screen from outside the settings stack (e.g. the root-level
 * announcement modal); pair with `requestOpenTab('settings')`.
 */
export function requestOpenSettingsScreen(route: OpenableSettingsScreen) {
  listeners.forEach((listener) => listener(route));
}

export function subscribeOpenSettingsScreenRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

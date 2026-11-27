import {
  PENDING_SETTINGS_SCREEN_TTL_MS,
  requestOpenSettingsScreen,
  subscribeOpenSettingsScreenRequest,
} from '~/services/settingsNavigation';

describe('settings screen requests', () => {
  it('delivers a request to the mounted Settings stack at once', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeOpenSettingsScreenRequest(listener);
    requestOpenSettingsScreen('ProManagement');
    expect(listener).toHaveBeenCalledWith('ProManagement');
    unsubscribe();
  });

  it('keeps a request made before the stack mounts, for a notification tapped from a closed app', () => {
    requestOpenSettingsScreen('ProManagement', 1_000);
    const listener = jest.fn();
    const unsubscribe = subscribeOpenSettingsScreenRequest(listener, 1_500);
    expect(listener).toHaveBeenCalledWith('ProManagement');
    unsubscribe();
    // Delivered once: the next mount does not replay it.
    const again = jest.fn();
    subscribeOpenSettingsScreenRequest(again, 1_600)();
    expect(again).not.toHaveBeenCalled();
  });

  it('drops a request the stack did not mount in time for', () => {
    requestOpenSettingsScreen('ProManagement', 1_000);
    const listener = jest.fn();
    subscribeOpenSettingsScreenRequest(listener, 1_001 + PENDING_SETTINGS_SCREEN_TTL_MS)();
    expect(listener).not.toHaveBeenCalled();
  });
});

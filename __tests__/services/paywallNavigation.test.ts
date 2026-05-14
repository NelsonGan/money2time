import {
  requestOpenPaywall,
  subscribeOpenPaywallRequest,
} from '~/services/paywallNavigation';

describe('paywallNavigation pub/sub', () => {
  it('sends the source and flashMessage to listeners', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenPaywallRequest(listener);

    requestOpenPaywall('home', 'Upgrade to unlock');
    expect(listener).toHaveBeenCalledWith({ source: 'home', flashMessage: 'Upgrade to unlock' });

    unsub();
  });

  it('omits flashMessage when not provided', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenPaywallRequest(listener);
    requestOpenPaywall('settings');
    expect(listener).toHaveBeenCalledWith({ source: 'settings', flashMessage: undefined });
    unsub();
  });

  it('unsubscribes cleanly', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenPaywallRequest(listener);
    unsub();
    requestOpenPaywall('anywhere');
    expect(listener).not.toHaveBeenCalled();
  });
});

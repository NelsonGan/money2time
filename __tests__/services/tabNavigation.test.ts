import { requestOpenTab, subscribeOpenTabRequest } from '~/services/tabNavigation';

describe('tabNavigation pub/sub', () => {
  it('forwards the requested tab to listeners', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTabRequest(listener);

    requestOpenTab('calendar');
    expect(listener).toHaveBeenCalledWith({ tab: 'calendar' });

    unsub();
  });

  it('stops invoking listeners after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTabRequest(listener);
    unsub();
    requestOpenTab('insights');
    expect(listener).not.toHaveBeenCalled();
  });
});

import {
  requestOpenHourlyValueSetup,
  subscribeOpenHourlyValueRequest,
} from '~/services/hourlyValueNavigation';

describe('hourlyValueNavigation pub/sub', () => {
  it('fans out requests to every subscribed listener', () => {
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = subscribeOpenHourlyValueRequest(a);
    const unsubB = subscribeOpenHourlyValueRequest(b);

    requestOpenHourlyValueSetup();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });

  it('stops calling listeners after they unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenHourlyValueRequest(listener);
    requestOpenHourlyValueSetup();
    unsub();
    requestOpenHourlyValueSetup();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

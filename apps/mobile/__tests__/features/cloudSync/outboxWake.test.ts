import {
  notifyLocalDataChanged,
  subscribeLocalDataChanged,
} from '~/features/cloudSync/lib/outboxWake';

describe('outboxWake', () => {
  it('notifies subscribers on local writes and stops after unsubscribe', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubFirst = subscribeLocalDataChanged(first);
    const unsubSecond = subscribeLocalDataChanged(second);

    notifyLocalDataChanged();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubFirst();
    notifyLocalDataChanged();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubSecond();
  });

  it('isolates listener errors so writes never fail', () => {
    const broken = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    const u1 = subscribeLocalDataChanged(broken);
    const u2 = subscribeLocalDataChanged(healthy);

    expect(() => notifyLocalDataChanged()).not.toThrow();
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);

    u1();
    u2();
  });
});

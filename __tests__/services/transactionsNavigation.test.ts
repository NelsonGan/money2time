import {
  requestOpenTransactions,
  subscribeOpenTransactionsRequest,
} from '~/services/transactionsNavigation';

describe('transactionsNavigation pub/sub', () => {
  it('forwards the request payload to listeners', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTransactionsRequest(listener);

    requestOpenTransactions({ monthKey: '2026-05' });
    expect(listener).toHaveBeenCalledWith({ monthKey: '2026-05' });

    unsub();
  });

  it('supports null monthKey', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTransactionsRequest(listener);
    requestOpenTransactions({ monthKey: null });
    expect(listener).toHaveBeenCalledWith({ monthKey: null });
    unsub();
  });

  it('stops invoking listeners after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTransactionsRequest(listener);
    unsub();
    requestOpenTransactions({ monthKey: '2026-05' });
    expect(listener).not.toHaveBeenCalled();
  });
});

import {
  requestEditTransaction,
  requestOpenTransactions,
  requestOpenTransactionsAfterSave,
  subscribeEditTransaction,
  subscribeOpenTransactionsRequest,
} from '~/services/transactionsNavigation';

describe('transaction save destination', () => {
  it('keeps Accounts or an account detail caller on its originating tab', () => {
    const listener = jest.fn();
    const unsub = subscribeOpenTransactionsRequest(listener);
    try {
      requestOpenTransactionsAfterSave('2026-10-30', true);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsub();
    }
  });

  it.each([undefined, false])(
    'focuses the saved day for Calendar or external entry (%s)',
    (keep) => {
      const listener = jest.fn();
      const unsub = subscribeOpenTransactionsRequest(listener);
      try {
        requestOpenTransactionsAfterSave('2026-09-12', keep);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ monthKey: '2026-09', dayKey: '2026-09-12' });
      } finally {
        unsub();
      }
    },
  );
});

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

  it('forwards edit requests and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeEditTransaction(listener);

    requestEditTransaction('transaction-1');
    expect(listener).toHaveBeenCalledWith('transaction-1');

    unsub();
    requestEditTransaction('transaction-2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

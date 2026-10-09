const worker = require('../../../cloudflare/workers/receipt-scanner/src/index').default;
const { getEntitlement } = require('../../../cloudflare/workers/receipt-scanner/src/revenuecat');
const { checkQuota } = require('../../../cloudflare/workers/receipt-scanner/src/ratelimit');

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(),
  consumeQuota: jest.fn(),
}));
it('rejects the retired notification mode without AI, entitlement calls or scan usage', async () => {
  const fetchMock = jest.fn();
  const previous = global.fetch;
  global.fetch = fetchMock;
  const warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const response = await worker.fetch(
      new Request('https://scanner.test/scan', {
        method: 'POST',
        body: JSON.stringify({
          appUserId: 'test',
          mode: 'notification',
          text: 'RM0.20 sent to ALEX TAN',
          currency: 'MYR',
          categories: [],
        }),
      }),
      {} as never,
      { waitUntil: jest.fn() } as never,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'notification_scanning_removed' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(checkQuota).not.toHaveBeenCalled();
  } finally {
    global.fetch = previous;
    warn.mockRestore();
  }
});

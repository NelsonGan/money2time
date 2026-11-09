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

describe('per-IP limits', () => {
  const ctx = { waitUntil: jest.fn() } as never;
  const blocked = { limit: jest.fn(async () => ({ success: false })) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses a scan from an address over its limit before any AI or quota work', async () => {
    const fetchMock = jest.fn();
    const previous = global.fetch;
    global.fetch = fetchMock;
    try {
      const response = await worker.fetch(
        new Request('https://scanner.test/scan', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          body: JSON.stringify({ appUserId: 'm2t_a', image: 'eA==', mime: 'image/png', currency: 'MYR' }),
        }),
        { SCAN_LIMITER: blocked } as never,
        ctx,
      );
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'rate_limited' });
      expect(blocked.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getEntitlement).not.toHaveBeenCalled();
      expect(checkQuota).not.toHaveBeenCalled();
    } finally {
      global.fetch = previous;
    }
  });

  it('refuses a notification review from an address over its limit', async () => {
    const response = await worker.fetch(
      new Request('https://scanner.test/notifications', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ appUserId: 'm2t_a', notifications: [] }),
      }),
      { NOTIFICATION_LIMITER: blocked } as never,
      ctx,
    );
    expect(response.status).toBe(429);
    expect(getEntitlement).not.toHaveBeenCalled();
  });

  it('refuses a body larger than any image before reading it', async () => {
    const response = await worker.fetch(
      new Request('https://scanner.test/scan', {
        method: 'POST',
        headers: { 'content-length': String(64 * 1024 * 1024) },
        body: '{}',
      }),
      {} as never,
      ctx,
    );
    expect(response.status).toBe(413);
    expect(getEntitlement).not.toHaveBeenCalled();
  });
});

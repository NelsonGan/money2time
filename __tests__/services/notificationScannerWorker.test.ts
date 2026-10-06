import { webcrypto } from 'node:crypto';

// Keep the Worker's separate Cloudflare type environment out of the app compilation.
const worker = require('../../cloudflare/workers/receipt-scanner/src/index').default as {
  fetch(
    request: Request,
    env: Record<string, string>,
    ctx: { waitUntil: jest.Mock },
  ): Promise<Response>;
};
const { checkQuota, consumeQuota } =
  require('../../cloudflare/workers/receipt-scanner/src/ratelimit') as {
    checkQuota: jest.Mock;
    consumeQuota: jest.Mock;
  };
const { getEntitlement } = require('../../cloudflare/workers/receipt-scanner/src/revenuecat') as {
  getEntitlement: jest.Mock;
};

jest.mock('~/cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(),
  consumeQuota: jest.fn(),
}));
jest.mock('~/cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(),
}));

const env = { MODEL: 'primary', BACKUP_MODEL: 'backup', OPENROUTER_API_KEY: 'test' } as Parameters<
  typeof worker.fetch
>[1];
const body = {
  appUserId: 'user',
  mode: 'notification',
  currency: 'MYR',
  categories: ['Food'],
  incomeCategories: ['Salary'],
  notification: {
    title: 'Bank',
    body: 'Payment notification',
    source: 'Bank',
    extra: [],
    capturedAt: '2026-10-06T12:00:00.000Z',
  },
};
const row = { type: 'income', amount: 3000, currency: 'MYR', category: 'Salary', note: 'Employer' };
const request = (input = body) =>
  new Request('https://scanner.example/scan', { method: 'POST', body: JSON.stringify(input) });
const ctx = { waitUntil: jest.fn() } as unknown as Parameters<typeof worker.fetch>[2];

describe('receipt worker notification mode', () => {
  const originalFetch = global.fetch;
  beforeAll(() => {
    Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(checkQuota)
      .mockResolvedValue({ allowed: true, used: 0, limit: 100, interval: '100year' });
    jest.mocked(getEntitlement).mockResolvedValue({ isPro: false });
    jest.mocked(consumeQuota).mockResolvedValue(1);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ transactions: [row] }) } }],
        }),
      ),
    );
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('accepts notification details without an image and runs text inference', async () => {
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transactions: [expect.objectContaining(row)] });
    const inference = JSON.parse(String(jest.mocked(global.fetch).mock.calls[0]![1]?.body));
    expect(JSON.stringify(inference.messages)).not.toContain('image_url');
    expect(inference.messages[0].role).toBe('system');
    expect(inference.messages[0].content).toContain('promotional');
    expect(inference.messages[1].content).toContain(body.notification.body);
    expect(checkQuota).toHaveBeenCalledWith(
      'user:notifications',
      false,
      expect.objectContaining({ FREE_LIMIT: '1000', FREE_INTERVAL: 'month' }),
      expect.any(Date),
    );
  });

  it('skips promotions without retrying inference or spending receipt quota', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"transactions":[]}' } }] }),
        ),
      );
    expect(await (await worker.fetch(request(), env, ctx)).json()).toMatchObject({
      transactions: [],
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(consumeQuota).toHaveBeenCalledWith(
      'user:notifications',
      false,
      expect.any(Object),
      expect.any(Date),
    );
  });

  it.each([
    'not json',
    '{}',
    '{"transactions":[{"type":"transfer","amount":25}]}',
    '{"transactions":[{"type":"expense","amount":-1}]}',
  ])('leaves malformed model output retryable', async (content) => {
    jest
      .mocked(global.fetch)
      .mockImplementation(
        async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })),
      );
    expect((await worker.fetch(request(), env, ctx)).status).toBe(502);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('fails over when the primary provider is unavailable', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not log notification content echoed in a malformed provider response', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce(new Response('Secret123'));
    await worker.fetch(request(), env, ctx);
    expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain('Secret123');
  });

  it('rejects empty notification details before inference', async () => {
    expect(
      (
        await worker.fetch(
          request({
            ...body,
            notification: { ...body.notification, title: '', body: '', source: '' },
          }),
          env,
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('still requires an image for receipt scans', async () => {
    expect((await worker.fetch(request({ ...body, mode: 'quick' }), env, ctx)).status).toBe(400);
  });

  it('requires request signing when configured, including text-only calls', async () => {
    expect(
      (await worker.fetch(request(), { ...env, MONEY2TIME_REQUEST_SIGNING_KEY: 'secret' }, ctx))
        .status,
    ).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bounds notification uploads', async () => {
    expect(
      (
        await worker.fetch(
          request({ ...body, notification: { ...body.notification, body: 'x'.repeat(16001) } }),
          env,
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('enforces the separate notification quota before inference', async () => {
    jest
      .mocked(checkQuota)
      .mockResolvedValueOnce({ allowed: false, used: 100, limit: 100, interval: '100year' });
    expect((await worker.fetch(request(), env, ctx)).status).toBe(402);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

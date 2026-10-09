import { createHmac, webcrypto } from 'node:crypto';

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(async () => ({ isPro: false })),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(),
  consumeQuota: jest.fn(async () => 4),
}));

const worker = require('../../../cloudflare/workers/receipt-scanner/src/index').default;
const {
  buildReceiptPrompt,
  maxTokensForMode,
} = require('../../../cloudflare/workers/receipt-scanner/src/scanModes');
const {
  checkQuota,
  consumeQuota,
} = require('../../../cloudflare/workers/receipt-scanner/src/ratelimit');
const { getEntitlement } = require('../../../cloudflare/workers/receipt-scanner/src/revenuecat');
const args = {
  appUserId: 'receipt-user',
  image: 'aW1hZ2U=',
  mime: 'image/png',
  currency: 'MYR',
  categories: ['Food', 'Other'],
};
const env = {
  MODEL: 'primary',
  BACKUP_MODEL: 'backup',
  OPENROUTER_API_KEY: 'test',
  MONEY2TIME_REQUEST_SIGNING_KEY: 'receipt-test-secret',
  FREE_LIMIT: '20',
  FREE_INTERVAL: '100year',
  PRO_LIMIT: '500',
  PRO_INTERVAL: 'month',
  FREE_NOTIFICATION_LIMIT: '100',
  PRO_NOTIFICATION_LIMIT: '2000',
  NOTIFICATION_DAILY_ATTEMPTS: '500',
};
const row = {
  type: 'expense',
  amount: 16,
  currency: 'MYR',
  date: '2026-10-08',
  category: 'Food',
  note: 'QA CAFE',
};
const detail = {
  merchant: 'QA CAFE',
  date: '2026-10-08',
  currency: 'MYR',
  items: [
    { name: 'Coffee', quantity: 2, lineTotal: 12, confidence: 'high' },
    { name: 'Tea', quantity: 1, lineTotal: 3, confidence: 'high' },
  ],
  itemsConfidence: 'high',
};
const fetchMock = jest.fn();
const ctx = { waitUntil: jest.fn() };

function request(body: Record<string, unknown> = args, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', env.MONEY2TIME_REQUEST_SIGNING_KEY)
    .update(`${timestamp}.${body.appUserId}`)
    .digest('hex');
  return new Request('https://scanner.test/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
      'X-Timestamp': timestamp,
    },
    body: JSON.stringify(body),
  });
}
function completion(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: typeof value === 'string' ? value : JSON.stringify(value) } },
      ],
    }),
  );
}

describe('existing receipt image endpoint', () => {
  const originalFetch = global.fetch;
  beforeAll(() =>
    Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true }),
  );
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock
      .mockReset()
      .mockImplementation(async () => completion({ transactions: [row], receiptDetail: detail }));
    getEntitlement.mockResolvedValue({ isPro: false });
    // Notification usage is exhausted: image operations must use their own allowance.
    checkQuota.mockImplementation(async (user: string, pro: boolean) => ({
      allowed: user === args.appUserId,
      used: 3,
      limit: pro ? 500 : 20,
      interval: pro ? 'month' : '100year',
    }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([undefined, 'quick', 'itemized', 'screenshot'] as const)(
    'preserves image payload, prompt, tokens, schema and receipt quota for mode %s',
    async (mode) => {
      const accounts = mode === 'screenshot' ? ['Everyday Account', 'Travel Wallet'] : [];
      const response = await worker.fetch(
        request({ ...args, ...(mode ? { mode } : {}), accounts }),
        env,
        ctx,
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        transactions: [{ ...row, account: '', sentiment: 'neutral' }],
        ...(mode === 'itemized' ? { receiptDetail: detail } : {}),
        schemaVersion: 2,
        quota: { used: 4, limit: 20, isPro: false, interval: '100year' },
      });
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildReceiptPrompt(args.categories, args.currency, mode ?? 'quick', accounts),
            },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
          ],
        },
      ]);
      expect(sent.max_tokens).toBe(mode === 'itemized' ? 5000 : 1200);
      expect(sent.max_tokens).toBe(maxTokensForMode(mode ?? 'quick'));
      expect(sent.reasoning).toEqual({ enabled: false });
      expect(sent.temperature).toBe(0);
      expect(checkQuota).toHaveBeenCalledTimes(1);
      expect(checkQuota).toHaveBeenCalledWith(args.appUserId, false, env, expect.any(Date));
      expect(consumeQuota).toHaveBeenCalledTimes(1);
      expect(consumeQuota).toHaveBeenCalledWith(args.appUserId, false, env, expect.any(Date));
    },
  );

  it('keeps the existing Pro receipt limit and cadence', async () => {
    getEntitlement.mockResolvedValue({ isPro: true });
    const response = await worker.fetch(request(), env, ctx);
    expect(await response.json()).toMatchObject({
      quota: { used: 4, limit: 500, isPro: true, interval: 'month' },
    });
    expect(checkQuota).toHaveBeenCalledWith(args.appUserId, true, env, expect.any(Date));
  });

  it.each(['quick', 'itemized', 'screenshot'])(
    'retains the image and its mode when failing over a %s scan',
    async (mode) => {
      fetchMock.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
      const response = await worker.fetch(
        request({ ...args, mode, accounts: ['Everyday Account'] }),
        { ...env, IMAGE_DETAIL: ' high ' },
        ctx,
      );
      expect(response.status).toBe(200);
      const primary = JSON.parse(fetchMock.mock.calls[0][1].body);
      const backup = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(primary.model).toBe('primary');
      expect(backup).toEqual({ ...primary, model: 'backup' });
      expect(backup.messages[0].content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aW1hZ2U=', detail: 'high' },
      });
      expect(consumeQuota).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['quick', 'itemized', 'screenshot'])(
    'still retries an unreadable %s scan with the image',
    async (mode) => {
      fetchMock.mockResolvedValueOnce(completion({ transactions: [] }));
      const response = await worker.fetch(request({ ...args, mode }), env, ctx);
      expect(await response.json()).toMatchObject({ transactions: [{ amount: 16 }] });
      const calls = fetchMock.mock.calls.map((call: unknown[]) =>
        JSON.parse((call[1] as { body: string }).body),
      );
      expect(calls.map((call: { temperature: number }) => call.temperature)).toEqual([0, 0.2]);
      expect(calls[1].messages).toEqual(calls[0].messages);
      expect(consumeQuota).toHaveBeenCalledTimes(1);
    },
  );

  it('returns an empty successful reply without charging an unreadable image twice', async () => {
    fetchMock.mockImplementation(async () => completion({ transactions: [] }));
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      transactions: [],
      quota: { used: 3, limit: 20, isPro: false, interval: '100year' },
      schemaVersion: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('keeps the empty receipt result when its retry fails', async () => {
    fetchMock
      .mockResolvedValueOnce(completion({ transactions: [] }))
      .mockImplementation(async () => new Response('Unavailable', { status: 503 }));
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transactions: [], quota: { used: 3 } });
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('retains multiple receipt rows and charges once per image', async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ transactions: [row, { ...row, amount: 7.5, note: 'QA BAKERY' }] }),
    );
    const response = await worker.fetch(request(), env, ctx);
    expect(
      (await response.json()).transactions.map((item: { amount: number }) => item.amount),
    ).toEqual([16, 7.5]);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
  });

  it('retains screenshot account detection and tolerant fenced JSON parsing', async () => {
    fetchMock.mockResolvedValueOnce(
      completion(
        '```json\n' +
          JSON.stringify({ transactions: [{ ...row, account: 'Everyday Account' }] }) +
          '\n```',
      ),
    );
    const response = await worker.fetch(
      request({ ...args, mode: 'screenshot', accounts: ['Everyday Account'] }),
      env,
      ctx,
    );
    expect(await response.json()).toMatchObject({
      transactions: [{ account: 'Everyday Account', amount: 16 }],
    });
  });

  it('retains receipt and split-item date clamping', async () => {
    fetchMock.mockResolvedValueOnce(
      completion({
        transactions: [{ ...row, date: '2025-01-01' }],
        receiptDetail: { ...detail, date: '2030-01-01' },
      }),
    );
    const response = await worker.fetch(request({ ...args, mode: 'itemized' }), env, ctx);
    expect(await response.json()).toMatchObject({
      transactions: [{ date: '2026-10-08' }],
      receiptDetail: { date: '2026-10-08', items: detail.items },
    });
  });

  it('blocks exhausted receipt allowance before inference even when notification allowance is configured', async () => {
    checkQuota.mockResolvedValueOnce({ allowed: false, used: 20, limit: 20, interval: '100year' });
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: 'limit_reached',
      used: 20,
      limit: 20,
      isPro: false,
      interval: '100year',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it.each([
    [{ image: undefined }, 'missing_image'],
    [{ mime: 'text/plain' }, 'invalid_mime'],
    [{ mode: 'unknown' }, 'invalid_mode'],
    [{ currency: undefined }, 'missing_currency'],
    [{ image: 'a'.repeat(8 * 1024 * 1024 + 1) }, 'image_too_large'],
  ])('rejects invalid legacy image arguments before inference (%s)', async (overrides, error) => {
    const response = await worker.fetch(request({ ...args, ...overrides }), env, ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkQuota).not.toHaveBeenCalled();
  });

  it('does not let notification fields divert a valid image request into text scanning', async () => {
    const response = await worker.fetch(
      request({ ...args, mode: 'quick', text: 'irrelevant', capturedAt: 'invalid' }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[1].type).toBe(
      'image_url',
    );
  });

  it('rejects expired receipt signatures before metering or inference', async () => {
    const response = await worker.fetch(request(args, String(Date.now() - 300001)), env, ctx);
    expect(response.status).toBe(401);
    expect(checkQuota).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'capacity'],
    [503, 'inference_failed'],
  ])('retains failed image status handling for provider HTTP %s', async (status, error) => {
    fetchMock.mockImplementation(
      async () => new Response('Provider unavailable', { status: Number(status) }),
    );
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(status === 429 ? 429 : 502);
    expect(await response.json()).toMatchObject({ error });
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('keeps one shared 70-second budget across image failover attempts', async () => {
    let started: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          started();
          options.signal.addEventListener('abort', () => reject(new Error('timed out')));
        }),
    );
    const scan = worker.fetch(request(), env, ctx);
    await providerStarted;
    await jest.advanceTimersByTimeAsync(45000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(25000);
    expect((await scan).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

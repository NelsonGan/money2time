import { createHmac, webcrypto } from 'node:crypto';

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(async () => ({ isPro: false })),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(),
  consumeQuota: jest.fn(async () => 1),
}));

const WORKER = '../../../cloudflare/workers/receipt-scanner/src/index';
const worker = require(WORKER).default;
const {
  checkQuota,
  consumeQuota,
} = require('../../../cloudflare/workers/receipt-scanner/src/ratelimit');
const {
  normalizeNotificationResults,
  parseNotificationRequest,
} = require('../../../cloudflare/workers/receipt-scanner/src/notifications');

const SECRET = 'notification-test-secret';
const CLAUDE = 'anthropic/claude-haiku-5.5';
const USER = 'm2t_notification_user';
// The charged-id table (notification_review_charged), in memory.
const charged = new Set<string>();
const d1 = {
  prepare: (sql: string) => ({
    bind: (...args: unknown[]) => ({
      sql,
      args,
      all: async () => ({
        results: (args.slice(2) as string[])
          .filter((id) => charged.has(id))
          .map((id) => ({ capture_id: id })),
      }),
    }),
  }),
  batch: async (statements: { args: unknown[] }[]) => {
    statements.forEach((statement) => charged.add(statement.args[1] as string));
    return [];
  },
};
const env = {
  MONEY2TIME_D1_RECEIPT_SCANNER: d1,
  MODEL: CLAUDE,
  BACKUP_MODEL: 'backup',
  OPENROUTER_API_KEY: 'test',
  MONEY2TIME_REQUEST_SIGNING_KEY: SECRET,
  POSTHOG_PROJECT_TOKEN: 'phc_test',
};
const notifications = [
  { id: 'n1', text: 'Payment of RM14.50 at STARBUCKS completed.', currency: 'MYR', source: 'Bank' },
  { id: 'n2', text: 'Your login code is 123456.', currency: 'MYR', source: 'Bank' },
  { id: 'n3', text: 'Transfer successful: RM 0.20.', currency: 'MYR', source: 'Wallet' },
];
const body = {
  appUserId: USER,
  notifications,
  expenseCategories: ['Food', 'Other'],
  incomeCategories: ['Salary'],
};
const ANSWER = JSON.stringify({
  results: [
    {
      i: 0,
      decision: 'expense',
      amount: 14.5,
      currency: 'MYR',
      category: 'Food',
      note: 'STARBUCKS',
    },
    { i: 1, decision: 'ignore', reason: 'otp' },
    { i: 2, decision: 'unsure' },
  ],
});

function request(path: string, payload: unknown = body, signed = true): Request {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', SECRET).update(`${timestamp}.${USER}`).digest('hex');
  return new Request(`https://scanner.test${path}`, {
    method: 'POST',
    headers: signed ? { 'X-Signature': signature, 'X-Timestamp': timestamp } : {},
    body: JSON.stringify(payload),
  });
}
const completion = (content: string) => () =>
  new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { is_byok: true, cost: 0 } }),
  );
const quota = (used: number) => ({ allowed: used < 40, used, limit: 40, interval: '100year' });

describe('POST /notifications', () => {
  const originalFetch = global.fetch;
  const originalCrypto = globalThis.crypto;
  let answers: (() => Response)[];
  let fetchMock: jest.Mock;
  let waits: Promise<unknown>[];
  const ctx = { waitUntil: (promise: Promise<unknown>) => waits.push(promise) };
  const sent = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).includes('openrouter.ai'))
      .map(([, init]) => JSON.parse(init.body));

  beforeEach(() => {
    waits = [];
    answers = [];
    if (!globalThis.crypto?.subtle)
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
    fetchMock = jest.fn(async (url: string) => {
      if (url.includes('openrouter.ai')) {
        const next = answers.shift();
        if (!next) throw new Error('more model calls than answers');
        return next();
      }
      if (url.includes('/batch/')) return new Response('{"status":"Ok"}');
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.mocked(checkQuota).mockReset().mockResolvedValue(quota(0));
    jest.mocked(consumeQuota).mockClear();
    charged.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    jest.restoreAllMocks();
  });

  it('reviews the batch in one call and charges one review per notification answered', async () => {
    answers.push(completion(ANSWER));
    const response = await worker.fetch(request('/notifications'), env, ctx);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results).toEqual([
      {
        id: 'n1',
        decision: 'expense',
        amount: 14.5,
        currency: 'MYR',
        category: 'Food',
        note: 'STARBUCKS',
      },
      { id: 'n2', decision: 'ignore', reason: 'otp' },
      { id: 'n3', decision: 'unsure' },
    ]);
    expect(json.skipped).toEqual([]);
    expect(json.quota).toEqual({ used: 3, limit: 40, isPro: false, interval: '100year' });
    expect([...charged]).toEqual(['n1', 'n2', 'n3']);
    await Promise.all(waits);
    expect(checkQuota).toHaveBeenCalledWith(USER, false, env, expect.any(Date), 'notification');
    expect(consumeQuota).toHaveBeenCalledWith(
      USER,
      false,
      env,
      expect.any(Date),
      'notification',
      3,
    );

    const [call] = sent();
    expect(call.model).toBe(CLAUDE);
    const [shared, personal, ...rest] = call.messages[0].content;
    // The rules are cached for everyone; the notifications follow uncached.
    expect(shared.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(shared.text).not.toContain('login code');
    expect(personal.text).toContain('Your login code is 123456.');
    expect(personal.text).not.toContain('n1');
    expect(rest).toHaveLength(0);
  });

  it('reviews only what a free allowance has left and returns the rest as skipped', async () => {
    jest.mocked(checkQuota).mockResolvedValue(quota(38));
    answers.push(
      completion(
        '{"results":[{"i":0,"decision":"unsure"},{"i":1,"decision":"ignore","reason":"otp"}]}',
      ),
    );
    const response = await worker.fetch(request('/notifications'), env, ctx);
    const json = await response.json();
    expect(json.results.map((r: { id: string }) => r.id)).toEqual(['n1', 'n2']);
    expect(json.skipped).toEqual(['n3']);
    expect(json.quota.used).toBe(40);
    expect(sent()[0].messages[0].content[1].text).not.toContain('RM 0.20');
  });

  it('refuses with 402 and no AI call once the allowance is used up', async () => {
    jest.mocked(checkQuota).mockResolvedValue(quota(40));
    const response = await worker.fetch(request('/notifications'), env, ctx);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: 'limit_reached',
      used: 40,
      limit: 40,
      isPro: false,
      interval: '100year',
    });
    expect(sent()).toHaveLength(0);
  });

  it('fails over on an answer without results and charges nothing if every model fails', async () => {
    answers.push(completion('sorry'), completion('{"oops":true}'));
    const response = await worker.fetch(request('/notifications'), env, ctx);
    expect(response.status).toBe(502);
    expect(sent()).toHaveLength(2);
    expect(sent()[1].model).toBe('backup');
    // The backup runs only on providers that keep no prompts.
    expect(sent()[1].provider).toEqual({ data_collection: 'deny' });
    await Promise.all(waits);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('does not charge again for notifications charged in the last day', async () => {
    charged.add('n1');
    charged.add('n2');
    answers.push(completion(ANSWER));
    const json = await (await worker.fetch(request('/notifications'), env, ctx)).json();
    expect(json.results).toHaveLength(3);
    expect(json.quota.used).toBe(1);
    expect(consumeQuota).toHaveBeenCalledWith(
      USER,
      false,
      env,
      expect.any(Date),
      'notification',
      1,
    );
  });

  it('reviews already-charged notifications even with no allowance left', async () => {
    jest.mocked(checkQuota).mockResolvedValue(quota(40));
    charged.add('n1');
    answers.push(completion('{"results":[{"i":0,"decision":"unsure"}]}'));
    const json = await (await worker.fetch(request('/notifications'), env, ctx)).json();
    expect(json.results).toEqual([{ id: 'n1', decision: 'unsure' }]);
    expect(json.skipped).toEqual(['n2', 'n3']);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('charges only for, and returns only, the notifications the model answered', async () => {
    answers.push(
      completion('{"results":[{"i":0,"decision":"unsure"},{"i":2,"decision":"unsure"}]}'),
    );
    const response = await worker.fetch(request('/notifications'), env, ctx);
    const json = await response.json();
    expect(json.results.map((r: { id: string }) => r.id)).toEqual(['n1', 'n3']);
    expect(json.quota.used).toBe(2);
    await Promise.all(waits);
    expect(consumeQuota).toHaveBeenCalledWith(
      USER,
      false,
      env,
      expect.any(Date),
      'notification',
      2,
    );
  });

  it('serves the allowance without any AI call', async () => {
    jest.mocked(checkQuota).mockResolvedValue(quota(12));
    const response = await worker.fetch(
      request('/notifications/quota', { appUserId: USER }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      quota: { used: 12, limit: 40, isPro: false, interval: '100year' },
    });
    expect(sent()).toHaveLength(0);
  });

  it('rejects unsigned requests', async () => {
    const response = await worker.fetch(request('/notifications', body, false), env, ctx);
    expect(response.status).toBe(401);
    expect(sent()).toHaveLength(0);
  });

  it('rejects oversized batches before any entitlement or AI call', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ ...notifications[0], id: `n${i}` }));
    const response = await worker.fetch(
      request('/notifications', { ...body, notifications: many }),
      env,
      ctx,
    );
    expect(response.status).toBe(400);
    expect(checkQuota).not.toHaveBeenCalled();
  });
});

describe('notification review parsing', () => {
  const parsed = parseNotificationRequest(body).request;

  it('turns malformed answers into unsure and leaves unanswered ones out', () => {
    expect(
      normalizeNotificationResults(
        {
          results: [
            { i: 0, decision: 'expense', amount: -3 },
            { i: 1, decision: 'transfer' },
          ],
        },
        parsed,
      ),
    ).toEqual([
      { id: 'n1', decision: 'unsure' },
      { id: 'n2', decision: 'unsure' },
    ]);
  });

  it('falls back to the account currency and drops invented categories', () => {
    const [first] = normalizeNotificationResults(
      {
        results: [
          { i: 0, decision: 'income', amount: '250', currency: null, category: 'Food', note: 'X' },
        ],
      },
      parsed,
    );
    expect(first).toEqual({
      id: 'n1',
      decision: 'income',
      amount: 250,
      currency: 'MYR',
      category: '',
      note: 'X',
    });
  });

  it('caps each notification and rejects duplicate ids', () => {
    const long = parseNotificationRequest({
      ...body,
      notifications: [{ ...notifications[0], text: 'x'.repeat(5000) }],
    });
    expect(long.request.notifications[0].text).toHaveLength(800);
    expect(
      parseNotificationRequest({ ...body, notifications: [notifications[0], notifications[0]] }),
    ).toEqual({ error: 'invalid_notification' });
  });
});

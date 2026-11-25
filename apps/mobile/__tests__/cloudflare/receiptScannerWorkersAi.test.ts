import { createHmac, webcrypto } from 'node:crypto';

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(async () => ({ isPro: false })),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(async () => ({ allowed: true, used: 0, limit: 20, interval: 'month' })),
  consumeQuota: jest.fn(async () => 1),
}));

const worker = require('../../../cloudflare/workers/receipt-scanner/src/index').default;
const prompts = require('../../../cloudflare/workers/receipt-scanner/src/prompts');

const SECRET = 'receipt-test-secret';
const WORKERS_AI_MODEL = '@cf/qwen/qwen3.8-27b';
// A JPEG from a phone in mainland China: Claude is skipped there, so the
// chain starts at the OpenRouter backups.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString(
  'base64',
);
const HEIC = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]).toString(
  'base64',
);
const body = {
  appUserId: 'm2t_receipt_user',
  image: JPEG,
  mime: 'image/jpeg',
  currency: 'CNY',
  categories: ['Food', 'Other'],
  mode: 'screenshot',
};
const ANSWER =
  '{"transactions":[{"type":"expense","amount":38,"currency":"CNY","date":null,"category":"Food","note":"茶语时光"}]}';
// What OpenRouter answered most requests from mainland China with on 2026-11-25.
const RELAY_REFUSAL = '{"error":{"message":"Request path cannot be relayed","code":400}}';
const WORKERS_AI_USAGE = {
  prompt_tokens: 1456,
  completion_tokens: 53,
  total_tokens: 1509,
  prompt_tokens_details: { cached_tokens: 0 },
  neurons: 80,
};

function request(overrides: Record<string, unknown> = {}): Request {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body.appUserId}`)
    .digest('hex');
  const req = new Request('https://scanner.test/scan', {
    method: 'POST',
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp },
    body: JSON.stringify({ ...body, ...overrides }),
  });
  Object.defineProperty(req, 'cf', { value: { country: 'CN' } });
  return req;
}

describe('receipt scanner falling back to Workers AI', () => {
  const originalFetch = global.fetch;
  const originalCrypto = globalThis.crypto;
  let openRouterAnswers: (() => Response)[];
  let fetchMock: jest.Mock;
  let ai: { run: jest.Mock };
  let waits: Promise<unknown>[];
  const ctx = { waitUntil: (promise: Promise<unknown>) => waits.push(promise) };

  const env = () => ({
    MODEL: 'anthropic/claude-haiku-5.5',
    BACKUP_MODEL: 'qwen/qwen3.7-flash',
    SECOND_BACKUP_MODEL: 'deepseek/deepseek-v4.1-flash-1017',
    CLAUDE_BLOCKED_COUNTRIES: 'CN,HK,MO',
    WORKERS_AI_MODEL,
    AI: ai,
    OPENROUTER_API_KEY: 'test',
    MONEY2TIME_REQUEST_SIGNING_KEY: SECRET,
    FREE_LIMIT: '20',
    FREE_INTERVAL: 'month',
    PRO_LIMIT: '500',
    PRO_INTERVAL: 'month',
    POSTHOG_PROJECT_TOKEN: 'phc_test',
  });
  const openRouterModels = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).includes('openrouter.ai'))
      .map(([, init]) => JSON.parse(init.body).model);
  const generations = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/batch/'))
      .flatMap(([, init]) => JSON.parse(init.body).batch);
  const refused = () => new Response(RELAY_REFUSAL, { status: 400 });

  beforeEach(() => {
    prompts.clearPromptCache();
    waits = [];
    openRouterAnswers = [];
    ai = {
      run: jest.fn(async () => ({
        choices: [{ message: { content: ANSWER } }],
        usage: WORKERS_AI_USAGE,
      })),
    };
    if (!globalThis.crypto?.subtle)
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
    fetchMock = jest.fn(async (url: string) => {
      if (url.includes('openrouter.ai')) {
        const next = openRouterAnswers.shift();
        if (!next) throw new Error('more OpenRouter calls than answers');
        return next();
      }
      if (url.includes('/batch/')) return new Response('{"status":"Ok"}');
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    jest.restoreAllMocks();
  });

  it('reads the receipt on Workers AI when OpenRouter refuses every model', async () => {
    openRouterAnswers.push(refused, refused);
    const response = await worker.fetch(request(), env(), ctx);

    expect(response.status).toBe(200);
    const { transactions } = await response.json();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ amount: 38, note: '茶语时光' });
    expect(openRouterModels()).toEqual(['qwen/qwen3.7-flash', 'deepseek/deepseek-v4.1-flash-1017']);

    expect(ai.run).toHaveBeenCalledTimes(1);
    const [model, inputs] = ai.run.mock.calls[0];
    expect(model).toBe(WORKERS_AI_MODEL);
    // Reasoning off: with it on, the model spent the whole budget thinking.
    expect(inputs.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(inputs.max_tokens).toBeGreaterThan(0);
    const [prompt, image] = inputs.messages[0].content;
    expect(prompt).toEqual({ type: 'text', text: expect.stringContaining('Currency: CNY') });
    expect(prompt).not.toHaveProperty('cache_control');
    expect(image.image_url.url).toBe(`data:image/jpeg;base64,${JPEG}`);

    await Promise.all(waits);
    const events = generations();
    expect(events.map((event) => event.properties.$ai_model)).toEqual([
      'qwen/qwen3.7-flash',
      'deepseek/deepseek-v4.1-flash-1017',
      WORKERS_AI_MODEL,
    ]);
    const last = events[2].properties;
    expect(last).toMatchObject({
      $ai_provider: 'cloudflare-workers-ai',
      $ai_is_error: false,
      $ai_http_status: 200,
      $ai_input_tokens: 1456,
      $ai_output_tokens: 53,
      is_backup_model: true,
      parsed_transactions: 1,
    });
    // Its neurons at Workers AI's $0.011 per 1,000.
    expect(last.$ai_total_cost_usd).toBeCloseTo(0.00088, 8);
    expect(last).not.toHaveProperty('$ai_base_url');
    expect(events[0].properties.$ai_provider).toBe('openrouter');
  });

  it('never reaches Workers AI while an OpenRouter model answers', async () => {
    openRouterAnswers.push(
      () => new Response(JSON.stringify({ choices: [{ message: { content: ANSWER } }] })),
    );
    const response = await worker.fetch(request(), env(), ctx);
    expect(response.status).toBe(200);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it.each([
    ['busy', '3040: Capacity temporarily exceeded', 429],
    ['failing', '5007: No such model', 502],
  ])('fails the scan as before when Workers AI is %s too', async (_label, message, status) => {
    openRouterAnswers.push(refused, refused);
    ai.run.mockRejectedValueOnce(new Error(message));
    const response = await worker.fetch(request(), env(), ctx);
    // A busy model is the retryable "capacity" answer, as from OpenRouter.
    expect(response.status).toBe(status);

    await Promise.all(waits);
    const last = generations().at(-1).properties;
    expect(last).toMatchObject({
      $ai_model: WORKERS_AI_MODEL,
      $ai_is_error: true,
      $ai_error: `workers-ai: ${message}`,
    });
  });

  it('never sends Workers AI an image it cannot decode', async () => {
    openRouterAnswers.push(refused, refused);
    const response = await worker.fetch(request({ image: HEIC, mime: 'image/heic' }), env(), ctx);
    expect(response.status).toBe(502);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('skips Workers AI without the binding or the model', async () => {
    for (const missing of [{ AI: undefined }, { WORKERS_AI_MODEL: '' }]) {
      openRouterAnswers.push(refused, refused);
      const response = await worker.fetch(request(), { ...env(), ...missing }, ctx);
      expect(response.status).toBe(502);
    }
    expect(ai.run).not.toHaveBeenCalled();
  });
});

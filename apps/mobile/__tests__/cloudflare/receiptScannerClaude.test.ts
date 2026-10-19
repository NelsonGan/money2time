import { createHmac, webcrypto } from 'node:crypto';

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(async () => ({ isPro: false })),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(async () => ({ allowed: true, used: 0, limit: 20, interval: '100year' })),
  consumeQuota: jest.fn(async () => 1),
}));

const worker = require('../../../cloudflare/workers/receipt-scanner/src/index').default;
const prompts = require('../../../cloudflare/workers/receipt-scanner/src/prompts');

const SECRET = 'receipt-test-secret';
const CLAUDE = 'anthropic/claude-haiku-5.5';
const env = {
  MODEL: CLAUDE,
  BACKUP_MODEL: 'backup',
  OPENROUTER_API_KEY: 'test',
  MONEY2TIME_REQUEST_SIGNING_KEY: SECRET,
  FREE_LIMIT: '20',
  FREE_INTERVAL: '100year',
  PRO_LIMIT: '500',
  PRO_INTERVAL: 'month',
  POSTHOG_PROJECT_TOKEN: 'phc_test',
};
// Screenshot mode has no empty-result retry, so every request below is one pass
// down the model chain.
const body = {
  appUserId: 'm2t_receipt_user',
  image: 'aW1hZ2U=',
  mime: 'image/png',
  currency: 'MYR',
  categories: ['Food', 'Other'],
  mode: 'screenshot',
};
const ANSWER =
  '{"transactions":[{"type":"expense","amount":12.5,"currency":"MYR","date":null,"category":"Food","note":"Kopitiam"}]}';
const BYOK_USAGE = {
  prompt_tokens: 1200,
  completion_tokens: 80,
  cost: 0,
  is_byok: true,
  cost_details: { upstream_inference_cost: 0.0002 },
};

function request(): Request {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body.appUserId}`)
    .digest('hex');
  return new Request('https://scanner.test/scan', {
    method: 'POST',
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp },
    body: JSON.stringify(body),
  });
}

const completion = (content: string, usage?: unknown) => () =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }));
const failure = (status: number) => () => new Response('nope', { status });

describe('receipt scanner with Claude as MODEL', () => {
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
  const generations = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/batch/'))
      .flatMap(([, init]) => JSON.parse(init.body).batch);

  beforeEach(() => {
    prompts.clearPromptCache();
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
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    jest.restoreAllMocks();
  });

  it('sends Claude to Anthropic alone, with no temperature, tagged as the app', async () => {
    answers.push(completion(ANSWER, BYOK_USAGE));
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).transactions).toHaveLength(1);
    const [first, ...rest] = sent();
    expect(rest).toHaveLength(0);
    expect(first.model).toBe(CLAUDE);
    expect(first.provider).toEqual({ only: ['anthropic'], allow_fallbacks: false });
    expect(first).not.toHaveProperty('temperature');
    // OpenRouter files calls under the referer and shows the title as the app.
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('openrouter.ai'))!;
    expect(init.headers).toMatchObject({
      'HTTP-Referer': 'https://money2time.com',
      'X-Title': 'Money2Time',
    });

    await Promise.all(waits);
    const [event] = generations();
    // Anthropic's own bill, since OpenRouter's `cost` under BYOK is only its fee.
    expect(event.properties).toMatchObject({
      $ai_model: CLAUDE,
      byok: true,
      $ai_total_cost_usd: 0.0002,
      is_backup_model: false,
    });
    expect(event.properties).not.toHaveProperty('$ai_temperature');
  });

  it.each([
    ['refused', failure(401)],
    ['rate limited', failure(429)],
    ['answering in prose', completion('I could not find a payment on this screen.')],
  ])('moves on to BACKUP_MODEL when Claude is %s', async (_label, first) => {
    answers.push(first, completion(ANSWER));
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).transactions).toHaveLength(1);
    const [claude, backup] = sent();
    expect(claude.model).toBe(CLAUDE);
    expect(backup.model).toBe('backup');
    expect(backup).not.toHaveProperty('provider');
    expect(backup.temperature).toBe(0);

    await Promise.all(waits);
    const [failed, served] = generations();
    expect(failed.properties.$ai_is_error).toBe(true);
    expect(served.properties.is_backup_model).toBe(true);
  });

  it('sends an image as the type its bytes are, not the type it was declared', async () => {
    answers.push(completion(ANSWER, BYOK_USAGE));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', SECRET)
      .update(`${timestamp}.${body.appUserId}`)
      .digest('hex');
    await worker.fetch(
      new Request('https://scanner.test/scan', {
        method: 'POST',
        headers: { 'X-Signature': signature, 'X-Timestamp': timestamp },
        body: JSON.stringify({ ...body, image: png, mime: 'image/jpeg' }),
      }),
      env,
      ctx,
    );
    expect(sent()[0].messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${png}`);
  });

  it('locks Claude to our key as BACKUP_MODEL too', async () => {
    answers.push(failure(503), completion(ANSWER, BYOK_USAGE));
    const response = await worker.fetch(
      request(),
      { ...env, MODEL: 'primary', BACKUP_MODEL: CLAUDE },
      ctx,
    );
    expect(response.status).toBe(200);
    const [primary, backup] = sent();
    expect(primary).not.toHaveProperty('provider');
    expect(backup.model).toBe(CLAUDE);
    expect(backup.provider).toEqual({ only: ['anthropic'], allow_fallbacks: false });
  });

  // Last: tripping the breaker lasts for the rest of the isolate.
  it('keeps an answer billed to credits, then stops asking Claude', async () => {
    answers.push(completion(ANSWER, { ...BYOK_USAGE, is_byok: false }));
    const billed = await worker.fetch(request(), env, ctx);
    expect((await billed.json()).transactions).toHaveLength(1);

    answers.push(completion(ANSWER));
    await worker.fetch(request(), env, ctx);
    expect(sent().map((s) => s.model)).toEqual([CLAUDE, 'backup']);
  });
});

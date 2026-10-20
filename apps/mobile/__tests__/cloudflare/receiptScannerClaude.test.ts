import { createHmac, webcrypto } from 'node:crypto';

jest.mock('../../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({
  getEntitlement: jest.fn(async () => ({ isPro: false })),
}));
jest.mock('../../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(async () => ({ allowed: true, used: 0, limit: 20, interval: '100year' })),
  consumeQuota: jest.fn(async () => 1),
}));

const WORKER = '../../../cloudflare/workers/receipt-scanner/src/index';
const worker = require(WORKER).default;
const { getEntitlement } = require('../../../cloudflare/workers/receipt-scanner/src/revenuecat');
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
// The worker sends Claude only an image whose bytes it recognises.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
// What a HEIC file starts with: a box size, then `ftypheic`.
const HEIC = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]).toString(
  'base64',
);
// Screenshot mode has no empty-result retry, so every request below is one pass
// down the model chain.
const body = {
  appUserId: 'm2t_receipt_user',
  image: PNG,
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
  prompt_tokens_details: { cached_tokens: 900, cache_write_tokens: 0 },
};

function request(overrides: Record<string, unknown> = {}): Request {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body.appUserId}`)
    .digest('hex');
  return new Request('https://scanner.test/scan', {
    method: 'POST',
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp },
    body: JSON.stringify({ ...body, ...overrides }),
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
    // The text every user shares goes in the 1-hour prompt cache; this user's
    // settings follow it uncached, then the receipt.
    const [shared, personal, image] = first.messages[0].content;
    expect(shared.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(shared.text).not.toContain('MYR');
    expect(personal).toEqual({
      type: 'text',
      text: expect.stringContaining("## This user's settings"),
    });
    expect(personal.text).toContain('Currency: MYR');
    expect(image.type).toBe('image_url');
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
      $ai_cache_read_input_tokens: 900,
      $ai_cache_creation_input_tokens: 0,
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
    expect(backup.messages[0].content[0]).not.toHaveProperty('cache_control');
    expect(backup.temperature).toBe(0);

    await Promise.all(waits);
    const [failed, served] = generations();
    expect(failed.properties.$ai_is_error).toBe(true);
    expect(served.properties.is_backup_model).toBe(true);
  });

  it('sends every user the same cached text, whatever their settings', async () => {
    answers.push(completion(ANSWER, BYOK_USAGE), completion(ANSWER, BYOK_USAGE));
    await worker.fetch(request({ currency: 'MYR', categories: ['Food', 'Other'] }), env, ctx);
    await worker.fetch(
      request({ currency: 'SGD', categories: ['Makan', 'Grab'], accounts: ['Visa 4242'] }),
      env,
      ctx,
    );
    const [a, b] = sent().map((s) => s.messages[0].content);
    expect(a[0].text).toBe(b[0].text);
    expect(a[1].text).not.toBe(b[1].text);
    expect(b[1].text).toContain('Visa 4242');
  });

  it('caches an older hosted template, with no shared part, whole and per user', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/llm_prompts/')) {
        return new Response(
          JSON.stringify({ prompt: 'Old {{currency_code}} {{allowed_categories}}', version: 1 }),
        );
      }
      if (url.includes('openrouter.ai')) return completion(ANSWER, BYOK_USAGE)();
      return new Response('{"status":"Ok"}');
    });
    await worker.fetch(request(), { ...env, POSTHOG_PROMPTS_API_KEY: 'phx_test' }, ctx);
    const content = sent()[0].messages[0].content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Old MYR Food, Other',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('sends an image as the type its bytes are, not the type it was declared', async () => {
    answers.push(completion(ANSWER, BYOK_USAGE));
    await worker.fetch(request({ image: PNG, mime: 'image/jpeg' }), env, ctx);
    const image = sent()[0].messages[0].content.find(
      (part: { type: string }) => part.type === 'image_url',
    );
    expect(image.image_url.url).toBe(`data:image/png;base64,${PNG}`);
  });

  it.each([
    ['labelled HEIC', 'image/heic'],
    ['labelled JPEG', 'image/jpeg'],
  ])('sends a HEIC image %s straight to BACKUP_MODEL', async (_label, mime) => {
    answers.push(completion(ANSWER));
    const response = await worker.fetch(request({ image: HEIC, mime }), env, ctx);
    expect(response.status).toBe(200);
    expect(sent().map((s) => s.model)).toEqual(['backup']);
    expect(sent()[0].messages[0].content[1].image_url.url).toBe(`data:${mime};base64,${HEIC}`);

    await Promise.all(waits);
    // Still the backup in PostHog, though nothing ran before it.
    expect(generations()[0].properties.is_backup_model).toBe(true);
  });

  it('times a hung Claude out early enough to leave the backup a real attempt', async () => {
    jest.useFakeTimers();
    try {
      // A slow entitlement lookup spends 10 s of the 70 s budget first.
      let lookupStarted: () => void;
      const lookingUp = new Promise<void>((resolve) => {
        lookupStarted = resolve;
      });
      getEntitlement.mockImplementationOnce(() => {
        lookupStarted();
        return new Promise((resolve) => setTimeout(() => resolve({ isPro: false }), 10000));
      });
      let claudeAbortedAt = 0;
      answers.push(completion(ANSWER));
      const answer = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, init: RequestInit) =>
        String(url).includes('openrouter.ai') && JSON.parse(String(init.body)).model === CLAUDE
          ? new Promise((_resolve, reject) => {
              init.signal!.addEventListener('abort', () => {
                claudeAbortedAt = Date.now();
                reject(new Error('timed out'));
              });
            })
          : answer(url, init),
      );
      const start = Date.now();
      const scan = worker.fetch(request(), env, ctx);
      await lookingUp;
      await jest.advanceTimersByTimeAsync(70000);
      expect((await scan).status).toBe(200);
      // Claude gets the 60 s left minus the 25 s kept for the backup, not 45 s.
      expect(claudeAbortedAt - start).toBe(10000 + 35000);
      expect(sent().map((s) => s.model)).toEqual([CLAUDE, 'backup']);
    } finally {
      jest.useRealTimers();
    }
  });

  // A fresh copy of the Worker: tripping the breaker lasts for the rest of the
  // isolate, so it must not leak into the other tests.
  it('keeps an answer billed to credits, then stops asking Claude', async () => {
    let isolated: typeof worker;
    jest.isolateModules(() => {
      isolated = require(WORKER).default;
    });
    answers.push(completion(ANSWER, { ...BYOK_USAGE, is_byok: false }));
    const billed = await isolated!.fetch(request(), env, ctx);
    expect((await billed.json()).transactions).toHaveLength(1);

    answers.push(completion(ANSWER));
    await isolated!.fetch(request(), env, ctx);
    expect(sent().map((s) => s.model)).toEqual([CLAUDE, 'backup']);
  });
});

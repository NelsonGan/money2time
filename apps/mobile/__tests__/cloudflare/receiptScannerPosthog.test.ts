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
const SESSION_ID = '01a12da7-b2c1-7422-b4f8-047d0b367593';
const baseEnv = {
  MODEL: 'primary',
  BACKUP_MODEL: 'backup',
  OPENROUTER_API_KEY: 'test',
  MONEY2TIME_REQUEST_SIGNING_KEY: SECRET,
  FREE_LIMIT: '20',
  FREE_INTERVAL: '100year',
  PRO_LIMIT: '500',
  PRO_INTERVAL: 'month',
};
const body = {
  appUserId: 'm2t_receipt_user',
  image: 'aW1hZ2U=',
  mime: 'image/png',
  currency: 'MYR',
  categories: ['Food', 'Other'],
};
const completion = {
  choices: [
    {
      message: {
        content:
          '{"transactions":[{"type":"expense","amount":12.5,"currency":"MYR","date":null,"category":"Food","note":"Kopitiam"}]}',
      },
    },
  ],
  usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.0004 },
};

function request(headers: Record<string, string> = {}): Request {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body.appUserId}`)
    .digest('hex');
  return new Request('https://scanner.test/scan', {
    method: 'POST',
    headers: { 'X-Signature': signature, 'X-Timestamp': timestamp, ...headers },
    body: JSON.stringify(body),
  });
}

describe('receipt scanner PostHog integration', () => {
  const originalFetch = global.fetch;
  const originalCrypto = globalThis.crypto;
  let fetchMock: jest.Mock;
  let waits: Promise<unknown>[];
  const ctx = { waitUntil: (promise: Promise<unknown>) => waits.push(promise) };

  beforeEach(() => {
    prompts.clearPromptCache();
    waits = [];
    if (!globalThis.crypto?.subtle)
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
    fetchMock = jest.fn(async (url: string) => {
      if (url.includes('openrouter.ai')) return new Response(JSON.stringify(completion));
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

  const batches = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/batch/'))
      .map(([, init]) => JSON.parse(init.body));

  it('captures one generation per call, linked to its prompt and session, without content', async () => {
    const response = await worker.fetch(
      request({ 'X-POSTHOG-SESSION-ID': SESSION_ID }),
      { ...baseEnv, POSTHOG_PROJECT_TOKEN: 'phc_test' },
      ctx,
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);

    const [batch] = batches();
    expect(batch.api_key).toBe('phc_test');
    expect(batch.batch).toHaveLength(1);
    const [event] = batch.batch;
    expect(event.event).toBe('$ai_generation');
    expect(event.distinct_id).toBe(body.appUserId);
    expect(event.properties).toMatchObject({
      $ai_model: 'primary',
      $ai_provider: 'openrouter',
      $ai_span_name: 'receipt_scan_quick',
      $ai_input_tokens: 1200,
      $ai_output_tokens: 80,
      $ai_total_cost_usd: 0.0004,
      $ai_cost_passthrough: true,
      $ai_is_error: false,
      $ai_prompt_name: 'receipt-scan-quick',
      prompt_source: 'bundled',
      $session_id: SESSION_ID,
      $ai_session_id: SESSION_ID,
      parsed_transactions: 1,
      $geoip_disable: true,
    });
    expect(event.properties).not.toHaveProperty('$ai_prompt_version');
    // Neither the receipt, the prompt nor the parsed answer leaves the Worker.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(body.image);
    expect(serialized).not.toContain('Kopitiam');
    expect(serialized).not.toContain('receipt-parsing engine');
  });

  it('ignores a session header that is not a session ID', async () => {
    await worker.fetch(
      request({ 'X-POSTHOG-SESSION-ID': 'not a session <script>' }),
      { ...baseEnv, POSTHOG_PROJECT_TOKEN: 'phc_test' },
      ctx,
    );
    await Promise.all(waits);
    const [batch] = batches();
    expect(batch.batch[0].properties).not.toHaveProperty('$session_id');
  });

  it('sends nothing to PostHog without a project token', async () => {
    const response = await worker.fetch(request(), baseEnv, ctx);
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(batches()).toEqual([]);
  });
});

describe('hosted receipt prompts', () => {
  const originalFetch = global.fetch;
  const env = { POSTHOG_PROMPTS_API_KEY: 'phx_read', POSTHOG_PROJECT_TOKEN: 'phc_test' };
  beforeEach(() => {
    prompts.clearPromptCache();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('serves the production label with the read key and caches it for five minutes', async () => {
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify({ prompt: 'Hosted {{currency_code}}', version: 3 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await prompts.resolvePrompt(env, 'receipt-scan-quick', 1_000);
    const cached = await prompts.resolvePrompt(env, 'receipt-scan-quick', 1_000 + 4 * 60_000);
    expect(first).toEqual({
      name: 'receipt-scan-quick',
      template: 'Hosted {{currency_code}}',
      version: 3,
      source: 'posthog',
    });
    expect(cached).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://us.posthog.com/api/projects/658608/llm_prompts/name/receipt-scan-quick/?label=production&token=phc_test',
    );
    expect(init.headers).toEqual({ Authorization: 'Bearer phx_read' });
  });

  it('serves a stale copy while PostHog fails, and the bundled one when it never answered', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ prompt: 'Hosted v2', version: 2 })),
    ) as unknown as typeof fetch;
    await prompts.resolvePrompt(env, 'receipt-scan-itemized', 0);

    const failing = jest.fn(async () => new Response('down', { status: 503 }));
    global.fetch = failing as unknown as typeof fetch;
    const stale = await prompts.resolvePrompt(env, 'receipt-scan-itemized', 10 * 60_000);
    expect(stale).toMatchObject({ template: 'Hosted v2', version: 2, source: 'posthog' });
    // Within the retry window the stale copy is served without another request.
    await prompts.resolvePrompt(env, 'receipt-scan-itemized', 10 * 60_000 + 30_000);
    expect(failing).toHaveBeenCalledTimes(1);

    const bundled = await prompts.resolvePrompt(env, 'receipt-scan-screenshot', 0);
    expect(bundled).toEqual({
      name: 'receipt-scan-screenshot',
      template: prompts.BUNDLED_PROMPTS['receipt-scan-screenshot'],
      version: null,
      source: 'bundled',
    });
  });

  it('shares a fetched prompt with new isolates through the edge cache', async () => {
    const store = new Map<string, Response>();
    const edge = {
      match: async (req: Request) => store.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void store.set(req.url, res.clone()),
    };
    Object.defineProperty(globalThis, 'caches', { value: { default: edge }, configurable: true });
    try {
      const fetchMock = jest.fn(
        async () => new Response(JSON.stringify({ prompt: 'Hosted v4', version: 4 })),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      await prompts.resolvePrompt(env, 'receipt-scan-quick', 0);
      prompts.clearPromptCache(); // a fresh isolate
      const shared = await prompts.resolvePrompt(env, 'receipt-scan-quick', 1_000);
      expect(shared).toMatchObject({ template: 'Hosted v4', version: 4, source: 'posthog' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as { caches?: unknown }).caches;
    }
  });

  it('uses the bundled prompts without a read key', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const resolved = await prompts.resolvePrompt({}, 'receipt-scan-quick');
    expect(resolved.source).toBe('bundled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fills variables in one pass, leaving braces inside values as text', () => {
    expect(prompts.compilePrompt('{{a}} and {{b}} and {{missing}}', { a: '{{b}}', b: 'B' })).toBe(
      '{{b}} and B and {{missing}}',
    );
  });
});

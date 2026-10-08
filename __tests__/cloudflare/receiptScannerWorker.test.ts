import { webcrypto } from 'node:crypto';

jest.mock('../../cloudflare/workers/receipt-scanner/src/revenuecat', () => ({ getEntitlement: jest.fn(async () => ({ isPro: false })) }));
jest.mock('../../cloudflare/workers/receipt-scanner/src/ratelimit', () => ({
  checkQuota: jest.fn(async () => ({ allowed: true, used: 0, limit: 50, interval: '100year' })),
  consumeQuota: jest.fn(async () => 1),
}));
const worker = require('../../cloudflare/workers/receipt-scanner/src/index').default;
const { checkQuota, consumeQuota } = require('../../cloudflare/workers/receipt-scanner/src/ratelimit');
const inference = { decision: 'transaction', confidence: 'high', completed: true, transactions: [{ type: 'income', amount: 100, currency: 'MYR', category: 'Salary', note: 'ACME', secondary: null }] };
const args = { appUserId: 'test', mode: 'notification', text: 'Salary MYR100 from ACME credited.', currency: 'MYR', categories: ['Food'], incomeCategories: ['Salary'], capturedAt: '2026-10-05T12:00:00Z' };
const env = { MODEL: 'primary', BACKUP_MODEL: 'backup', OPENROUTER_API_KEY: 'test' };
const ctx = { waitUntil: jest.fn() };
const fetchMock = jest.fn();
const request = (body = args, headers = {}) => new Request('https://scanner.test/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const completion = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

describe('text-only notification endpoint', () => {
  const originalFetch = global.fetch;
  beforeAll(() => { Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true }); });
  beforeEach(() => {
    jest.clearAllMocks(); global.fetch = fetchMock;
    fetchMock.mockReset().mockResolvedValue(completion(inference));
    checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 50, interval: '100year' });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });
  it('sends text without image content, accepts income and keeps category types separate', async () => {
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notificationDecision: 'transaction', transactions: [{ type: 'income', amount: 100, category: 'Salary' }] });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[1].content).toContain(args.text);
    expect(JSON.stringify(sent)).not.toContain('image_url');
  });
  it('does not retry a deliberate discard or consume the successful scan allowance', async () => {
    fetchMock.mockResolvedValue(completion({ decision: 'ignore', transactions: [] }));
    const response = await worker.fetch(request(), env, ctx);
    expect(await response.json()).toMatchObject({ notificationDecision: 'ignore', transactions: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consumeQuota.mock.calls.filter((call: unknown[]) => call[0] === 'notification:test')).toHaveLength(0);
  });
  it('fails safely for a malformed answer instead of interpreting it as a discard', async () => {
    fetchMock.mockResolvedValue(completion({ transactions: [] }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(502);
  });
  it('uses the backup model for malformed output while keeping deliberate ignores final', async () => {
    fetchMock.mockResolvedValueOnce(completion({ transactions: [] }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('backup');
  });
  it('uses the backup model when inference fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('backup');
  });
  it.each([
    { text: '' }, { text: 'a'.repeat(12001) }, { text: 25 }, { capturedAt: 'bad' },
    { categories: [5] }, { incomeCategories: 'Salary' }, { currency: 'bad-code' },
  ])('rejects invalid notification arguments before inference: %j', async (overrides) => {
    expect((await worker.fetch(request({ ...args, ...overrides } as typeof args), env, ctx)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects an invalid request signature before inference', async () => {
    expect((await worker.fetch(request(), { ...env, MONEY2TIME_REQUEST_SIGNING_KEY: 'secret' }, ctx)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not call inference after the notification quota is exhausted', async () => {
    checkQuota.mockResolvedValue({ allowed: false, used: 50, limit: 50, interval: '100year' });
    expect((await worker.fetch(request(), env, ctx)).status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('continues to require an image for ordinary receipts', async () => {
    expect((await worker.fetch(request({ ...args, mode: 'quick' }), env, ctx)).status).toBe(400);
  });
});

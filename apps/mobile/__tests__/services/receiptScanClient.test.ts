import { scanReceipt } from '~/services/receiptScan.native';
import { signingHeaders } from '~/services/requestSigning';
import { readReceiptBase64 } from '~/services/userAssets';

jest.mock('~/services/userAssets', () => ({ readReceiptBase64: jest.fn() }));
jest.mock('~/services/requestSigning', () => ({
  signingHeaders: jest.fn(() => ({ 'X-Signature': 'signed', 'X-Timestamp': '123' })),
}));

const args = {
  receiptRelPath: 'receipts/synthetic.png',
  appUserId: 'receipt-user',
  currency: 'MYR',
  categories: ['Food', 'Other'],
};
const transaction = {
  type: 'expense',
  amount: 16,
  currency: 'MYR',
  date: '2026-10-08',
  category: 'Food',
  note: 'QA CAFE',
  sentiment: 'neutral',
};
const reply = {
  transactions: [transaction],
  quota: { used: 4, limit: 20, isPro: false },
};

describe('native receipt image client compatibility', () => {
  const originalFetch = global.fetch;
  const previousUrl = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = ' https://scan.test/// ';
    jest.mocked(readReceiptBase64).mockResolvedValue({ base64: 'aW1hZ2U=', mime: 'image/png' });
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify(reply)));
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    if (previousUrl === undefined)
      delete process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
    else process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = previousUrl;
  });

  it.each([undefined, 'quick', 'itemized', 'screenshot'] as const)(
    'preserves the signed image request and response for mode %s',
    async (mode) => {
      const accounts = mode === 'screenshot' ? ['Everyday Account', 'Travel Wallet'] : undefined;
      expect(await scanReceipt({ ...args, mode, accounts })).toEqual(reply);
      expect(readReceiptBase64).toHaveBeenCalledWith(args.receiptRelPath);
      expect(signingHeaders).toHaveBeenCalledWith(args.appUserId);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://scan.test/scan');
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Signature': 'signed',
        'X-Timestamp': '123',
      });
      expect(JSON.parse(options.body)).toEqual({
        image: 'aW1hZ2U=',
        mime: 'image/png',
        appUserId: args.appUserId,
        currency: args.currency,
        categories: args.categories,
        ...(mode ? { mode } : {}),
        ...(accounts ? { accounts } : {}),
      });
    },
  );

  it('retains itemized details and detected accounts without notification validation', async () => {
    const response = {
      ...reply,
      transactions: [{ ...transaction, account: 'Everyday Account' }],
      receiptDetail: {
        merchant: 'QA CAFE',
        currency: 'MYR',
        date: '2026-10-08',
        items: [{ name: 'Coffee', quantity: 2, lineTotal: 12, confidence: 'high' }],
        itemsConfidence: 'high',
      },
      schemaVersion: 2,
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
    expect(await scanReceipt({ ...args, mode: 'itemized' })).toEqual(response);
  });

  it('accepts old worker replies with multiple receipts or an unreadable image', async () => {
    for (const transactions of [[transaction, { ...transaction, amount: 7.5 }], []]) {
      const response = { ...reply, transactions };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response)));
      expect(await scanReceipt(args)).toEqual(response);
    }
  });

  it('omits empty account lists', async () => {
    await scanReceipt({ ...args, accounts: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('accounts');
  });

  it('rejects missing configuration before reading or uploading an image', async () => {
    delete process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
    await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'not_available' });
    expect(readReceiptBase64).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing local image before uploading', async () => {
    jest.mocked(readReceiptBase64).mockResolvedValue(null);
    await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'server' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized images before uploading and accepts the exact boundary', async () => {
    const boundary = 8 * 1024 * 1024;
    jest
      .mocked(readReceiptBase64)
      .mockResolvedValue({ base64: 'a'.repeat(boundary + 1), mime: 'image/png' });
    await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
    jest
      .mocked(readReceiptBase64)
      .mockResolvedValue({ base64: 'a'.repeat(boundary), mime: 'image/png' });
    await expect(scanReceipt(args)).resolves.toEqual(reply);
  });

  it.each([
    [402, { error: 'limit_reached', isPro: true, limit: 500 }, 'limit_reached'],
    [429, { error: 'capacity' }, 'capacity'],
    [400, { error: 'image_too_large' }, 'too_large'],
    [502, { error: 'inference_failed' }, 'server'],
    [401, { error: 'unauthorized' }, 'server'],
  ])('preserves receipt error mapping for HTTP %s', async (status, payload, code) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: Number(status) }));
    await expect(scanReceipt(args)).rejects.toMatchObject({
      code,
      ...(code === 'limit_reached' ? { isPro: true, limit: 500 } : {}),
    });
  });

  it('maps non-JSON server errors using the status', async () => {
    fetchMock.mockResolvedValue(new Response('Service unavailable', { status: 503 }));
    await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'server' });
  });

  it.each([null, {}, { transactions: 'invalid' }])(
    'rejects malformed receipt replies: %j',
    async (response) => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
      await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'server' });
    },
  );

  it('clears the request timeout after success and a network failure', async () => {
    jest.useFakeTimers();
    await scanReceipt(args);
    expect(jest.getTimerCount()).toBe(0);
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(scanReceipt(args)).rejects.toMatchObject({ code: 'network' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('allows a slow image scan until the existing 90-second timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const scan = scanReceipt(args);
    const failure = expect(scan).rejects.toMatchObject({ code: 'network' });
    await jest.advanceTimersByTimeAsync(89999);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await failure;
    expect(jest.getTimerCount()).toBe(0);
  });
});

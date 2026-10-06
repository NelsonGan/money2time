import { scanPaymentAlert } from '~/services/paymentAlertScan';

const args = {
  appUserId: 'user',
  currency: 'MYR',
  categories: ['Food'],
  incomeCategories: ['Salary'],
  notification: {
    title: 'Bank',
    subtitle: null,
    body: 'RM25 paid',
    extra: [],
    source: 'Bank',
    capturedAt: '2026-10-06T12:00:00.000Z',
  },
};
const row = {
  type: 'expense',
  amount: 25,
  currency: 'MYR',
  category: 'Food',
  note: 'Cafe',
  sentiment: 'neutral',
  date: null,
};

describe('notification scanner client', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = 'https://scanner.example';
    process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ transactions: [row] }) });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
    delete process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY;
  });

  it('uses a signed text-only request to the same scan endpoint', async () => {
    expect(await scanPaymentAlert(args)).toMatchObject(row);
    const [url, options] = jest.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe('https://scanner.example/scan');
    expect(options?.headers).toEqual(
      expect.objectContaining({
        'X-Signature': expect.any(String),
        'X-Timestamp': expect.any(String),
      }),
    );
    const body = JSON.parse(String(options?.body));
    expect(body).toEqual({ ...args, mode: 'notification' });
    expect(body).not.toHaveProperty('image');
    expect(body).not.toHaveProperty('mime');
  });

  it('returns null for a non-transaction notification', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ transactions: [] }) } as Response);
    expect(await scanPaymentAlert(args)).toBeNull();
  });

  it('bounds rich notification details to the worker limit before upload', async () => {
    await scanPaymentAlert({
      ...args,
      notification: {
        ...args.notification,
        title: 'Title'.repeat(1000),
        body: '\n'.repeat(10000),
        extra: ['Details'.repeat(2000)],
      },
    });
    const uploaded = JSON.parse(
      String(jest.mocked(global.fetch).mock.calls[0]![1]?.body),
    ).notification;
    expect(JSON.stringify(uploaded).length).toBeLessThanOrEqual(16000);
  });

  it.each([
    { ...row, amount: -1 },
    { ...row, type: 'transfer' },
    { ...row, currency: 'FAKE' },
    { ...row, amount: '25' },
    { ...row, secondary: false },
    { ...row, secondary: 0 },
  ])('rejects invalid automatic drafts', async (invalid) => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [invalid] }),
    } as Response);
    await expect(scanPaymentAlert(args)).rejects.toMatchObject({ code: 'server' });
  });

  it('rejects multiple transactions for one notification', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [row, row] }),
    } as Response);
    await expect(scanPaymentAlert(args)).rejects.toMatchObject({ code: 'server' });
  });

  it('preserves network failures for automatic retry', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('offline'));
    await expect(scanPaymentAlert(args)).rejects.toMatchObject({ code: 'network' });
  });

  it('never includes notification text from an unreadable service response in an error', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('PrivateAccount123 in response');
      },
    } as unknown as Response);
    await expect(scanPaymentAlert(args)).rejects.toMatchObject({
      message: 'Notification scan request failed.',
    });
  });

  it('handles a null error response without leaking arbitrary server details', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => null } as Response);
    await expect(scanPaymentAlert(args)).rejects.toMatchObject({
      code: 'server',
      message: 'Scan failed (502).',
    });
  });
});

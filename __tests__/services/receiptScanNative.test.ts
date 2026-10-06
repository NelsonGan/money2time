import { scanReceipt } from '~/services/receiptScan.native';
import { readReceiptBase64 } from '~/services/userAssets';

jest.mock('~/services/userAssets', () => ({ readReceiptBase64: jest.fn() }));

describe('receipt image transport regression', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = 'https://scanner.example/';
    jest.mocked(readReceiptBase64).mockResolvedValue({ base64: 'image-data', mime: 'image/jpeg' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [], quota: { used: 1, limit: 20, isPro: false } }),
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
  });

  it.each(['quick', 'itemized', 'screenshot'] as const)(
    'preserves the %s image scan contract',
    async (mode) => {
      await scanReceipt({
        receiptRelPath: 'receipts/example.jpg',
        appUserId: 'user',
        currency: 'MYR',
        categories: ['Food'],
        accounts: ['Visa'],
        mode,
      });
      expect(readReceiptBase64).toHaveBeenCalledWith('receipts/example.jpg');
      expect(JSON.parse(String(jest.mocked(global.fetch).mock.calls[0]![1]?.body))).toEqual({
        image: 'image-data',
        mime: 'image/jpeg',
        appUserId: 'user',
        currency: 'MYR',
        categories: ['Food'],
        accounts: ['Visa'],
        mode,
      });
    },
  );

  it('does not upload an unreadable image', async () => {
    jest.mocked(readReceiptBase64).mockResolvedValueOnce(null);
    await expect(
      scanReceipt({
        receiptRelPath: 'missing',
        appUserId: 'user',
        currency: 'MYR',
        categories: [],
      }),
    ).rejects.toMatchObject({ code: 'server' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves quota error details', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: 'limit_reached', isPro: false, limit: 20 }),
    } as Response);
    await expect(
      scanReceipt({
        receiptRelPath: 'receipt',
        appUserId: 'user',
        currency: 'MYR',
        categories: [],
      }),
    ).rejects.toMatchObject({ code: 'limit_reached', isPro: false, limit: 20 });
  });
});

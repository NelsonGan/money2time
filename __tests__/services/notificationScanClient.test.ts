import { scanNotification } from '~/services/receiptScan.native';
import { ReceiptScanError } from '~/services/receiptScan.shared';
import { readReceiptBase64 } from '~/services/userAssets';

jest.mock('~/services/userAssets', () => ({ readReceiptBase64: jest.fn() }));
jest.mock('~/services/requestSigning', () => ({
  signingHeaders: () => ({ 'X-Signature': 'signed', 'X-Timestamp': '123' }),
}));
const args = {
  appUserId: 'user',
  text: 'Paid RM25 at SHELL',
  capturedAt: '2026-10-05T12:00:00Z',
  currency: 'MYR',
  categories: ['Food'],
  incomeCategories: ['Salary'],
};
const transaction = {
  type: 'expense',
  amount: 25,
  currency: 'MYR',
  category: 'Food',
  note: 'SHELL',
  date: '2026-10-05',
  secondary: null,
};
const response = {
  notificationDecision: 'transaction',
  transactions: [transaction],
  quota: { used: 1, limit: 50, isPro: false },
};

describe('notification scanner client', () => {
  const originalFetch = global.fetch;
  const previousUrl = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
  const fetchMock = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = 'https://scan.test';
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
  });
  afterAll(() => {
    global.fetch = originalFetch;
    if (previousUrl === undefined)
      delete process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER;
    else process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER = previousUrl;
  });
  it('posts signed text and never reads or uploads an image', async () => {
    expect(await scanNotification(args)).toMatchObject(response);
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers['X-Signature']).toBe('signed');
    expect(JSON.parse(options.body)).toEqual({ ...args, mode: 'notification' });
    expect(readReceiptBase64).not.toHaveBeenCalled();
  });
  it('accepts only an explicit discard', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ...response, notificationDecision: 'ignore', transactions: [] }),
      ),
    );
    expect((await scanNotification(args)).transactions).toEqual([]);
  });
  it.each([
    { transactions: [] },
    { ...response, notificationDecision: 'ignore' },
    { ...response, transactions: [] },
    { ...response, transactions: [{ ...transaction, type: 'transfer' }] },
    { ...response, transactions: [{ ...transaction, amount: -25 }] },
    { ...response, transactions: [{ ...transaction, currency: 'bogus' }] },
    { ...response, transactions: [transaction, transaction] },
  ])('keeps malformed or incompatible replies retryable', async (payload) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(scanNotification(args)).rejects.toMatchObject({ code: 'server' });
  });
  it.each([
    [402, 'limit_reached'],
    [429, 'capacity'],
    [502, 'server'],
  ])('maps HTTP %s to %s', async (status, code) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: Number(status) }));
    await expect(scanNotification(args)).rejects.toMatchObject({ code });
  });
  it('retains network errors as retryable errors', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(scanNotification(args)).rejects.toBeInstanceOf(ReceiptScanError);
    await expect(scanNotification(args)).rejects.toMatchObject({ code: 'network' });
  });
});

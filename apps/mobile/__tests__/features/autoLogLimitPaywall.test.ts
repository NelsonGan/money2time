const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));

let mockBlocked: { count: number; lastAt: string } | null = null;
const mockClear = jest.fn(async () => {
  mockBlocked = null;
});
jest.mock('~/services/autoLog', () => ({
  readAutoLogLimitBlocked: jest.fn(async () => mockBlocked),
  clearAutoLogLimitBlocked: () => mockClear(),
}));

let mockListening = true;
const mockRequest = jest.fn((_source: string, _message?: string) => mockListening);
jest.mock('~/services/paywallNavigation', () => ({
  requestOpenPaywall: (source: string, message?: string) => mockRequest(source, message),
}));

import { AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS } from '~/features/autoLog/lib/limitPrompt';
import { autoLogLimitPaywall, promptForAutoLogLimit } from '~/features/autoLog/limitPaywall';

const NOW = Date.parse('2026-11-20T09:00:00.000Z');

beforeEach(() => {
  mockStore.clear();
  mockBlocked = { count: 1, lastAt: '2026-11-20T08:00:00.000Z' };
  mockListening = true;
  mockRequest.mockClear();
  mockClear.mockClear();
});

describe('autoLogLimitPaywall', () => {
  it('offers Pro for automatic logs once they are used up', () => {
    expect(autoLogLimitPaywall(false)).toEqual({
      source: 'autolog',
      message: 'pro.limit_autolog',
    });
  });

  it('names the account limit when that is what blocked the tap', () => {
    expect(autoLogLimitPaywall(true)).toEqual({
      source: 'accounts_transaction',
      message: 'pro.limit_accounts',
    });
  });
});

describe('promptForAutoLogLimit', () => {
  it('opens the paywall once and drops the record', async () => {
    await promptForAutoLogLimit({ isPro: false, blockedByAccounts: false }, NOW);
    expect(mockRequest).toHaveBeenCalledWith('autolog', 'pro.limit_autolog');
    expect(mockClear).toHaveBeenCalledTimes(1);

    // A later refusal the same day waits instead of opening it again.
    mockBlocked = { count: 1, lastAt: '2026-11-20T10:00:00.000Z' };
    await promptForAutoLogLimit({ isPro: false, blockedByAccounts: false }, NOW + 60_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockBlocked).not.toBeNull();

    // …and opens it the next day.
    await promptForAutoLogLimit(
      { isPro: false, blockedByAccounts: false },
      NOW + AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS,
    );
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('keeps the record when nothing is listening yet', async () => {
    mockListening = false;
    await promptForAutoLogLimit({ isPro: false, blockedByAccounts: false }, NOW);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockStore.size).toBe(0);
  });

  it('never shows it to a Pro member, and drops the stale record', async () => {
    await promptForAutoLogLimit({ isPro: true, blockedByAccounts: false }, NOW);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no payment was refused', async () => {
    mockBlocked = null;
    await promptForAutoLogLimit({ isPro: false, blockedByAccounts: false }, NOW);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });
});

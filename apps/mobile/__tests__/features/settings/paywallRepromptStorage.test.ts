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

const mockRequest = jest.fn((_source: string) => true);
jest.mock('~/services/paywallNavigation', () => ({
  requestOpenPaywall: (source: string) => mockRequest(source),
}));

import { PAYWALL_REPROMPT_INTERVAL_MS } from '~/features/settings/lib/paywallReprompt';
import { markPaywallShown, promptPaywallIfDue } from '~/features/settings/paywallReprompt';

const NOW = Date.parse('2026-11-27T09:00:00.000Z');
const free = {
  isPro: false,
  hasRenewingSubscription: false,
  isStatusKnown: true,
  onboardingCompleted: true,
};

beforeEach(() => {
  mockStore.clear();
  mockRequest.mockClear();
});

describe('promptPaywallIfDue', () => {
  it('starts the clock on the first check without showing a paywall', async () => {
    await promptPaywallIfDue(free, NOW);
    expect(mockRequest).not.toHaveBeenCalled();
    await promptPaywallIfDue(free, NOW + PAYWALL_REPROMPT_INTERVAL_MS - 1);
    expect(mockRequest).not.toHaveBeenCalled();
    await promptPaywallIfDue(free, NOW + PAYWALL_REPROMPT_INTERVAL_MS);
    expect(mockRequest).toHaveBeenCalledWith('periodic');
  });

  it('counts any paywall the member saw', async () => {
    await markPaywallShown(NOW);
    await promptPaywallIfDue(free, NOW + PAYWALL_REPROMPT_INTERVAL_MS / 2);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('never opens it for Pro', async () => {
    await markPaywallShown(NOW - 10 * PAYWALL_REPROMPT_INTERVAL_MS);
    await promptPaywallIfDue({ ...free, isPro: true }, NOW);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

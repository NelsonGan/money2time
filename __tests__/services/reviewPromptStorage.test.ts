jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.5.5' } }));
jest.mock('expo-store-review', () => ({ isAvailableAsync: jest.fn(async () => false) }));
jest.mock('react-native', () => ({ Linking: {}, Platform: { OS: 'ios' } }));
jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: {},
  trackEvent: jest.fn(async () => undefined),
}));

import { createInitialState } from '~/services/reviewPrompt.shared';

const flushWrites = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup() {
  jest.resetModules();
  const { default: storage } = await import('@react-native-async-storage/async-storage');
  const getItem = jest.mocked(storage.getItem);
  const setItem = jest.mocked(storage.setItem);
  getItem.mockResolvedValue(
    JSON.stringify(createInitialState(new Date('2026-09-01T00:00:00Z'), '1.5.5')),
  );
  setItem.mockResolvedValue();
  const service = await import('~/services/reviewPrompt.native');
  await service.initReviewPrompt();
  return { service, setItem };
}

describe('review prompt storage failures', () => {
  it('handles a failed Insights counter write and persists the full count on recovery', async () => {
    const { service, setItem } = await setup();
    setItem.mockRejectedValueOnce(new Error('No space left on device'));

    service.recordInsightsView();
    await flushWrites();
    service.recordInsightsView();
    await flushWrites();

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(setItem.mock.calls[1][1]).insightsViewsCount).toBe(2);
  });

  it('keeps a dismissed prompt cooldown in memory when its write fails', async () => {
    const { service, setItem } = await setup();
    setItem.mockRejectedValueOnce(new Error('No space left on device'));

    await service.handlePrePromptDismissed('manual');
    await flushWrites();
    const failedState = JSON.parse(setItem.mock.calls[0][1]);
    service.recordTransactionLogged();
    await flushWrites();

    const recoveredState = JSON.parse(setItem.mock.calls[1][1]);
    expect(failedState.lastPromptAt).toEqual(expect.any(String));
    expect(recoveredState.lastPromptAt).toBe(failedState.lastPromptAt);
    expect(recoveredState.transactionCount).toBe(1);
  });

  it('serializes concurrent activity writes after a storage failure', async () => {
    const { service, setItem } = await setup();
    let rejectWrite!: (error: Error) => void;
    setItem.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectWrite = reject;
        }),
    );

    service.recordInsightsView();
    service.recordTransactionLogged(2);
    await flushWrites();
    expect(setItem).toHaveBeenCalledTimes(1);
    rejectWrite(new Error('No space left on device'));
    await flushWrites();

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(setItem.mock.calls[1][1])).toMatchObject({
      insightsViewsCount: 1,
      transactionCount: 2,
    });
  });
});

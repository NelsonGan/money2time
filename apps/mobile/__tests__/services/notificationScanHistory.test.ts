import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearNotificationScanHistory,
  getNotificationScanHistoryGeneration,
  isUnseenAiResult,
  markNotificationAiResultsSeen,
  readNotificationScanHistory,
  recordNotificationScan,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';

const storage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    storage.delete(key);
  }),
}));
const entry = (id: number, result: 'expense' | 'income' | 'none' | 'failed' = 'expense') => ({
  id: String(id),
  capturedAt: new Date(Date.UTC(2026, 9, 8, 10, id)).toISOString(),
  sourceLabel: 'QA Bank',
  text: `Notification ${id}`,
  result,
});
beforeEach(() => {
  storage.clear();
  jest.clearAllMocks();
});
it('persists only the 10 newest notifications, including no-transaction results', async () => {
  for (let i = 0; i < 12; i++)
    await recordNotificationScan('a', entry(i, i % 2 ? 'none' : 'income'));
  const history = await readNotificationScanHistory('a');
  expect(history.map((x) => x.id)).toEqual(['11', '10', '9', '8', '7', '6', '5', '4', '3', '2']);
  expect(JSON.parse([...storage.values()][0])).toHaveLength(10);
});
it('retains all unfinished reviews alongside the last 10 completed notifications', async () => {
  for (let i = 0; i < 12; i++)
    await recordNotificationScan('review', {
      ...entry(i),
      result: 'pending',
      accountId: 'a1',
      categoryId: null,
      channel: 'ios_alert',
      amounts: [{ amount: 0.2, currency: 'MYR' }],
    });
  for (let i = 20; i < 32; i++) await recordNotificationScan('review', entry(i));
  const rows = await readNotificationScanHistory('review');
  expect(rows.filter((row) => row.result === 'pending')).toHaveLength(12);
  expect(rows.filter((row) => row.result !== 'pending')).toHaveLength(10);
  expect(rows.find((row) => row.id === '0')).toMatchObject({
    accountId: 'a1',
    amounts: [{ amount: 0.2, currency: 'MYR' }],
  });
});
it('updates a failed retry without adding another entry or displacing newer notifications', async () => {
  await recordNotificationScan('a', entry(0, 'failed'));
  await recordNotificationScan('a', entry(1));
  await recordNotificationScan('a', entry(0, 'income'));
  expect((await readNotificationScanHistory('a')).map((x) => [x.id, x.result])).toEqual([
    ['1', 'expense'],
    ['0', 'income'],
  ]);
});
it('moves a failed legacy scan into the local review queue on retry', async () => {
  await recordNotificationScan('a', entry(0, 'failed'));
  await recordNotificationScan('a', { ...entry(0), result: 'pending' });
  expect(await readNotificationScanHistory('a')).toEqual([
    expect.objectContaining({ id: '0', result: 'pending' }),
  ]);
});
it.each(['expense', 'income', 'none'] as const)(
  'never reopens a completed %s notification on queue replay',
  async (result) => {
    await recordNotificationScan('a', entry(0, result));
    await recordNotificationScan('a', { ...entry(0), result: 'pending' });
    expect(await readNotificationScanHistory('a')).toEqual([
      expect.objectContaining({ id: '0', result }),
    ]);
  },
);
it('serializes concurrent writes without losing captures', async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => recordNotificationScan('a', entry(i))));
  expect(await readNotificationScanHistory('a')).toHaveLength(10);
});
it('isolates users and clears stored history on reset', async () => {
  await recordNotificationScan('a', entry(0));
  await recordNotificationScan('b', entry(1));
  await clearNotificationScanHistory('a');
  expect(await readNotificationScanHistory('a')).toEqual([]);
  expect(await readNotificationScanHistory('b')).toHaveLength(1);
});
it('rejects a scan started before the most recent reset', async () => {
  const generation = getNotificationScanHistoryGeneration('stale-user');
  await clearNotificationScanHistory('stale-user');
  await recordNotificationScan('stale-user', entry(0), generation);
  expect(await readNotificationScanHistory('stale-user')).toEqual([]);
  await recordNotificationScan('stale-user', entry(1));
  expect((await readNotificationScanHistory('stale-user')).map((row) => row.id)).toEqual(['1']);
});
it('does not publish a pending write after reset has been requested', async () => {
  const listener = jest.fn();
  const stop = subscribeNotificationScanHistory('pending-user', listener);
  const write = recordNotificationScan('pending-user', entry(0));
  const clear = clearNotificationScanHistory('pending-user');
  await Promise.all([write, clear]);
  expect(await readNotificationScanHistory('pending-user')).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
});
it('recovers from malformed storage and a failed write', async () => {
  await recordNotificationScan('a', entry(0));
  const key = [...storage.keys()][0];
  storage.set(key, 'broken');
  expect(await readNotificationScanHistory('a')).toEqual([]);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
  await expect(recordNotificationScan('a', entry(1))).rejects.toThrow('disk');
  await recordNotificationScan('a', entry(2));
  expect((await readNotificationScanHistory('a'))[0].id).toBe('2');
});
it('notifies only the matching user after persistence and reset', async () => {
  const listener = jest.fn();
  const other = jest.fn();
  const stop = subscribeNotificationScanHistory('a', listener);
  const stopOther = subscribeNotificationScanHistory('b', other);
  await recordNotificationScan('a', entry(0));
  await clearNotificationScanHistory('a');
  expect(listener).toHaveBeenCalledTimes(2);
  expect(other).not.toHaveBeenCalled();
  stop();
  stopOther();
});

const ai = (seen: boolean) =>
  ({ decision: 'expense', applied: true, seen, reviewedAt: '2026-11-02T09:00:00.000Z' }) as const;
it('keeps unseen AI results beyond the 10-entry cap until they are marked seen', async () => {
  await recordNotificationScan('a', { ...entry(0), ai: ai(false) });
  for (let i = 1; i <= 11; i++) await recordNotificationScan('a', entry(i));
  let history = await readNotificationScanHistory('a');
  expect(history.find((row) => row.id === '0')?.ai).toEqual(ai(false));
  expect(history.filter(isUnseenAiResult).map((row) => row.id)).toEqual(['0']);

  await markNotificationAiResultsSeen('a', ['0']);
  history = await readNotificationScanHistory('a');
  expect(history.some((row) => row.id === '0')).toBe(false);
  expect(history).toHaveLength(10);
});
it('only reopens a finished review when asked to (undo), never on a queue retry', async () => {
  await recordNotificationScan('a', entry(1));
  await recordNotificationScan('a', { ...entry(1), result: 'pending' });
  expect((await readNotificationScanHistory('a'))[0].result).toBe('expense');
  await recordNotificationScan('a', { ...entry(1), result: 'pending' }, undefined, true);
  expect((await readNotificationScanHistory('a'))[0].result).toBe('pending');
});
it('drops a malformed AI field instead of the whole entry', async () => {
  storage.set(
    'notification-scan-history:a',
    JSON.stringify([{ ...entry(1), ai: { decision: 'maybe' } }]),
  );
  const [row] = await readNotificationScanHistory('a');
  expect(row.id).toBe('1');
  expect(row.ai).toBeUndefined();
});

it('caps unseen AI results and lets them age out after three days', async () => {
  const fresh = new Date().toISOString();
  const stale = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 60; i++) {
    await recordNotificationScan('a', {
      ...entry(i),
      ai: { decision: 'ignore', applied: true, seen: false, reviewedAt: fresh },
    });
  }
  await recordNotificationScan('a', {
    ...entry(99),
    ai: { decision: 'ignore', applied: true, seen: false, reviewedAt: stale },
  });
  const history = await readNotificationScanHistory('a');
  // 40 unseen kept past the cap, then the normal 10 newest: bounded at 50.
  expect(history).toHaveLength(50);
  // Three days old, a result no longer waits in Done by AI.
  expect(isUnseenAiResult(history.find((row) => row.id === '99')!)).toBe(false);
});

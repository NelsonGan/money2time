import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearNotificationScanHistory,
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
it('updates a failed retry without adding another entry or displacing newer notifications', async () => {
  await recordNotificationScan('a', entry(0, 'failed'));
  await recordNotificationScan('a', entry(1));
  await recordNotificationScan('a', entry(0, 'income'));
  expect((await readNotificationScanHistory('a')).map((x) => [x.id, x.result])).toEqual([
    ['1', 'expense'],
    ['0', 'income'],
  ]);
});
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

import assert from 'node:assert/strict';
import test from 'node:test';

import { forEachLimit, UPLOAD_CONCURRENCY } from '../src/data/storeUpload.mjs';

const tick = () => new Promise(r => setTimeout(r, 5));

test('runs every item, never more than the limit at once', async () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  let running = 0;
  let peak = 0;
  const seen = [];
  await forEachLimit(items, UPLOAD_CONCURRENCY, async (item) => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    seen.push(item);
    running--;
  });
  assert.equal(peak, UPLOAD_CONCURRENCY);
  assert.deepEqual(seen.sort((a, b) => a - b), items);
});

test('a limit of one runs in order, and an empty list does nothing', async () => {
  const seen = [];
  await forEachLimit(['a', 'b', 'c'], 1, async (item) => { await tick(); seen.push(item); });
  assert.deepEqual(seen, ['a', 'b', 'c']);
  await forEachLimit([], UPLOAD_CONCURRENCY, async () => { throw new Error('called'); });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { forEachLimit, parseConcurrency, UPLOAD_CONCURRENCY } from '../src/data/storeUpload.mjs';

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

test('a throw lets the running items finish, starts no more, then rethrows', async () => {
  const started = [];
  const finished = [];
  await assert.rejects(
    forEachLimit([0, 1, 2, 3, 4, 5], 2, async (item) => {
      started.push(item);
      if (item === 0) throw new Error('boom');
      await tick();
      finished.push(item);
    }),
    /boom/,
  );
  // Item 1 was already running when item 0 threw: it finished before the
  // rejection, and nothing after it started.
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(finished, [1]);
});

test('a limit that is not a positive whole number is refused', async () => {
  for (const bad of [0, -1, 1.5, Number.NaN, undefined]) {
    await assert.rejects(forEachLimit([1], bad, async () => {}), /positive whole limit/);
  }
});

test('--concurrency defaults to the stores\' limit and refuses nonsense', () => {
  assert.equal(parseConcurrency(undefined), UPLOAD_CONCURRENCY);
  assert.equal(parseConcurrency('2'), 2);
  for (const bad of ['0', 'one', '-3', '2.5', '']) {
    assert.throws(() => parseConcurrency(bad), /--concurrency must be/);
  }
});

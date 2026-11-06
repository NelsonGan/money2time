import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { existingMedia, putMedia, userSpace } from '../src/media.ts';

// The error R2 threw in production on 2026-11-06 (PostHog 01a1ae5f, 01a1ae9d).
const R2_INTERNAL = 'We encountered an internal error. Please try again. (10001)';

type Op = 'head' | 'put';

/** An in-memory R2 bucket whose next `fail[op]` calls of `op` throw `error`. */
function fakeBucket(fail: Partial<Record<Op, number>>, error = R2_INTERNAL) {
  const objects = new Map<string, Uint8Array>();
  const calls: Record<Op, number> = { head: 0, put: 0 };
  const failing = (op: Op) => {
    calls[op] += 1;
    if ((fail[op] ?? 0) > 0) {
      fail[op]! -= 1;
      throw new Error(`${op}: ${error}`);
    }
  };
  const bucket = {
    async head(key: string) {
      failing('head');
      return objects.has(key) ? { key } : null;
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array) {
      failing('put');
      const bytes =
        value instanceof ReadableStream
          ? new Uint8Array(await new Response(value).arrayBuffer())
          : new Uint8Array(value as ArrayBuffer);
      objects.set(key, bytes);
      return { key };
    },
  };
  return { bucket, objects, calls };
}

/** Real SQL against the D1 schema, with only the Cloudflare binding adapted. */
function fixture(t: TestContext, fail: Partial<Record<Op, number>>, error?: string) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
    'u1',
    'U1',
    'u1@example.com',
    '2026-11-06',
    '2026-11-06',
  );
  const prepare = (sql: string) => {
    const statement = db.prepare(sql.replace(/\?(\d+)/g, ':p$1'));
    let values: Record<string, string | number | null> = {};
    return {
      bind(...args: (string | number | null)[]) {
        values = Object.fromEntries(args.map((value, i) => [`p${i + 1}`, value]));
        return this;
      },
      async first() {
        return statement.get(values) ?? null;
      },
      async run() {
        return { meta: { changes: Number(statement.run(values).changes) } };
      },
    };
  };
  const r2 = fakeBucket(fail, error);
  const env = { AUTH_DB: { prepare }, MEDIA: r2.bucket } as unknown as Env;
  const count = () =>
    (
      db.prepare('SELECT objects FROM media_usage WHERE user_id = ?').get('u1') as
        | { objects: number }
        | undefined
    )?.objects ?? 0;
  return { env, r2, count };
}

const space = userSpace('u1');
const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function upload(body: Uint8Array = image): Request {
  return new Request('https://sync.test/v1/media/receipts/a.jpg', {
    method: 'PUT',
    body,
    headers: { 'content-length': String(body.byteLength) },
  });
}

test('an upload survives R2 failing the existence check once', async (t) => {
  const { env, r2, count } = fixture(t, { head: 1 });
  const res = await putMedia(env, space, 'receipts/a.jpg', upload());
  assert.equal(res.status, 200);
  assert.deepEqual(r2.objects.get('u/u1/receipts/a.jpg'), image);
  assert.equal(count(), 1);
});

test('an upload survives R2 failing the write once, and is counted once', async (t) => {
  const { env, r2, count } = fixture(t, { put: 1 });
  const res = await putMedia(env, space, 'receipts/a.jpg', upload());
  assert.equal(res.status, 200);
  assert.equal(r2.calls.put, 2);
  assert.deepEqual(r2.objects.get('u/u1/receipts/a.jpg'), image);
  assert.equal(count(), 1);
});

test('the exists check survives R2 failing a head once', async (t) => {
  const { env } = fixture(t, { head: 1 });
  await putMedia(env, space, 'receipts/a.jpg', upload());
  const res = await existingMedia(env, space, ['receipts/a.jpg', 'receipts/b.jpg']);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { existing: ['receipts/a.jpg'] });
});

test('R2 still failing after the retries throws, and the image stays uncounted', async (t) => {
  const { env, r2, count } = fixture(t, { put: 10 });
  await assert.rejects(putMedia(env, space, 'receipts/a.jpg', upload()), /10001/);
  assert.equal(r2.calls.put, 3);
  assert.equal(count(), 0);
});

test('an error that is not R2 asking for a retry is not retried', async (t) => {
  const { env, r2 } = fixture(t, { head: 1 }, 'Unauthorized (10002)');
  await assert.rejects(putMedia(env, space, 'receipts/a.jpg', upload()), /10002/);
  assert.equal(r2.calls.head, 1);
});

test('a body shorter than its Content-Length is refused before R2 is written', async (t) => {
  const { env, r2 } = fixture(t, {});
  const res = await putMedia(
    env,
    space,
    'receipts/a.jpg',
    new Request('https://sync.test/v1/media/receipts/a.jpg', {
      method: 'PUT',
      body: image,
      headers: { 'content-length': String(image.byteLength + 10) },
    }),
  );
  assert.equal(res.status, 400);
  assert.equal(r2.calls.put, 0);
});

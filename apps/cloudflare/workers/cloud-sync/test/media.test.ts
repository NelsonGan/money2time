import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { deleteAllMedia, existingMedia, getMedia, putMedia, userSpace } from '../src/media.ts';

// The error R2 threw in production on 2026-11-06 (PostHog 01a1ae5f, 01a1ae9d).
const R2_INTERNAL = 'We encountered an internal error. Please try again. (10001)';

type Op = 'head' | 'put' | 'get' | 'list' | 'delete';

/** An in-memory R2 bucket whose next `fail[op]` calls of `op` throw `error`. */
function fakeBucket(fail: Partial<Record<Op, number>>, error = R2_INTERNAL) {
  const objects = new Map<string, Uint8Array>();
  const calls: Record<Op, number> = { head: 0, put: 0, get: 0, list: 0, delete: 0 };
  const putBodies: string[] = [];
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
      putBodies.push(value instanceof ReadableStream ? 'stream' : 'buffer');
      failing('put');
      const bytes =
        value instanceof ReadableStream
          ? new Uint8Array(await new Response(value).arrayBuffer())
          : new Uint8Array(value as ArrayBuffer);
      objects.set(key, bytes);
      return { key };
    },
    async get(key: string) {
      failing('get');
      const bytes = objects.get(key);
      return bytes ? { body: bytes, httpMetadata: { contentType: 'image/jpeg' } } : null;
    },
    async list({ prefix }: { prefix: string }) {
      failing('list');
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })), truncated: false };
    },
    async delete(keys: string[]) {
      failing('delete');
      for (const key of keys) objects.delete(key);
    },
  };
  return { bucket, objects, calls, putBodies };
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
  const old = fakeBucket({});
  const env = { AUTH_DB: { prepare }, MEDIA: r2.bucket, OLD_MEDIA: old.bucket } as unknown as Env;
  const count = () =>
    (
      db.prepare('SELECT objects FROM media_usage WHERE user_id = ?').get('u1') as
        | { objects: number }
        | undefined
    )?.objects ?? 0;
  return { env, r2, old, count };
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

test('a body shorter than its Content-Length is refused and left uncounted', async (t) => {
  const { env, r2, count } = fixture(t, {});
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
  assert.equal(count(), 0);
});

test('an upload the phone abandons midway is a 400, not a server error', async (t) => {
  const { env, r2, count } = fixture(t, {});
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(image.slice(0, 4));
      controller.error(new Error('client disconnected'));
    },
  });
  const res = await putMedia(
    env,
    space,
    'receipts/a.jpg',
    new Request('https://sync.test/v1/media/receipts/a.jpg', {
      method: 'PUT',
      body,
      duplex: 'half',
      headers: { 'content-length': String(image.byteLength) },
    } as RequestInit),
  );
  assert.equal(res.status, 400);
  assert.equal(r2.calls.put, 0);
  assert.equal(count(), 0);
});

test('R2 being briefly unavailable (10043) is retried too', async (t) => {
  const { env, r2 } = fixture(t, { put: 1 }, 'Service is temporarily unavailable. (10043)');
  const res = await putMedia(env, space, 'receipts/a.jpg', upload());
  assert.equal(res.status, 200);
  assert.equal(r2.calls.put, 2);
});

test('an image over 4 MB still streams to R2 once, without a retry', async (t) => {
  const { env, r2, count } = fixture(t, { put: 1 });
  const big = new Uint8Array(4 * 1024 * 1024 + 1);
  await assert.rejects(putMedia(env, space, 'receipts/big.jpg', upload(big)), /10001/);
  assert.deepEqual(r2.putBodies, ['stream']);
  assert.equal(count(), 0);
  const res = await putMedia(env, space, 'receipts/big.jpg', upload(big));
  assert.equal(res.status, 200);
  assert.equal(r2.objects.get('u/u1/receipts/big.jpg')?.byteLength, big.byteLength);
});

test('reading an image survives R2 failing once', async (t) => {
  const { env } = fixture(t, { get: 1 });
  await putMedia(env, space, 'receipts/a.jpg', upload());
  const res = await getMedia(env, space, 'receipts/a.jpg');
  assert.equal(res.status, 200);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), image);
});

test('deleting every image survives R2 failing the list and the delete once', async (t) => {
  const { env, r2 } = fixture(t, { list: 1, delete: 1 });
  await putMedia(env, space, 'receipts/a.jpg', upload());
  await deleteAllMedia(env, space);
  assert.equal(r2.objects.size, 0);
  assert.equal(r2.calls.list, 2);
  assert.equal(r2.calls.delete, 2);
});

test('an image still only in the old bucket is read, found and deleted there', async (t) => {
  const { env, r2, old } = fixture(t, {});
  old.objects.set('u/u1/receipts/old.jpg', image);
  const read = await getMedia(env, space, 'receipts/old.jpg');
  assert.equal(read.status, 200);
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), image);
  const exists = await existingMedia(env, space, ['receipts/old.jpg', 'receipts/none.jpg']);
  assert.deepEqual(await exists.json(), { existing: ['receipts/old.jpg'] });
  await putMedia(env, space, 'receipts/a.jpg', upload());
  await deleteAllMedia(env, space);
  assert.equal(old.objects.size, 0);
  assert.equal(r2.objects.size, 0);
});

test('a new image goes to the new bucket only, and replacing an old one adds nothing', async (t) => {
  const { env, r2, old, count } = fixture(t, {});
  old.objects.set('u/u1/receipts/a.jpg', image);
  const res = await putMedia(env, space, 'receipts/a.jpg', upload());
  assert.equal(res.status, 200);
  assert.equal(count(), 0);
  await putMedia(env, space, 'receipts/b.jpg', upload());
  assert.equal(count(), 1);
  assert.deepEqual([...r2.objects.keys()].sort(), ['u/u1/receipts/a.jpg', 'u/u1/receipts/b.jpg']);
  assert.equal(old.calls.put, 0);
});

test('without the old bucket bound, only the new one is used', async (t) => {
  const { env, old } = fixture(t, {});
  delete (env as { OLD_MEDIA?: unknown }).OLD_MEDIA;
  old.objects.set('u/u1/receipts/old.jpg', image);
  assert.equal((await getMedia(env, space, 'receipts/old.jpg')).status, 404);
  assert.equal(old.calls.get, 0);
});

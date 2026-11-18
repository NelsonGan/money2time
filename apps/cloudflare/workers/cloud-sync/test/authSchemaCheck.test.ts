import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAuth } from '../src/auth.ts';
import type { Env } from '../src/env.ts';

/**
 * A D1 stand-in where the first request's reads never come back, like a
 * request the phone gave up on (Cloudflare cancels its I/O). Every later
 * read answers at once with no rows.
 */
function stalledFirstRequestDb() {
  let stalled = false;
  let reads = 0;
  const answer = async () => {
    reads += 1;
    if (!stalled) {
      stalled = true;
      return new Promise<never>(() => {});
    }
    return { results: [], meta: { changes: 0 } };
  };
  const statement = {
    bind: () => statement,
    all: answer,
    first: async () => ((await answer()) as { results: unknown[] }).results[0] ?? null,
    run: answer,
    raw: async () => [],
  };
  return {
    reads: () => reads,
    prepare: () => statement,
    batch: async (statements: unknown[]) => Promise.all(statements.map(() => answer())),
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
  };
}

const settlesWithin = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), ms).unref()),
  ]);

test('a request the phone abandoned does not hold up the next request in the isolate', async () => {
  const env = {
    BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'kR3v9Qw7Zp2Lx8Nc4Hb6Tj1Ym5Ud0FaE',
    AUTH_DB: stalledFirstRequestDb(),
    GOOGLE_CLIENT_IDS: 'google-client',
    APPLE_CLIENT_IDS: 'apple-client',
    APPLE_APP_BUNDLE_IDENTIFIER: 'com.example.app',
  } as unknown as Env;
  const db = env.AUTH_DB as unknown as ReturnType<typeof stalledFirstRequestDb>;
  const auth = getAuth(env);
  // A signed-in phone: the session token is looked up in D1.
  const headers = () => new Headers({ authorization: 'Bearer session-token-of-a-phone' });

  // The first request in a fresh isolate: its D1 reads never come back.
  void auth.api.getSession({ headers: headers() }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 20));

  // The next request must not wait on a promise that belongs to the first
  // one: in production that wait fails ("This promise was created by a
  // request that has since ended") and the app gets server_error.
  const next = auth.api.getSession({ headers: headers() });
  assert.equal(await settlesWithin(next, 500), true);
  assert.equal(await next, null);
  // Both requests asked D1 for their own session.
  assert.ok(db.reads() >= 2);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import { getAuth } from '../src/auth.ts';
import type { Env } from '../src/env.ts';

const authEnv = (db: unknown) =>
  ({
    BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'test-secret',
    AUTH_DB: db,
    GOOGLE_CLIENT_IDS: 'google-client',
    APPLE_CLIENT_IDS: 'apple-client',
    APPLE_APP_BUNDLE_IDENTIFIER: 'com.example.app',
  }) as unknown as Env;

/**
 * A D1 stand-in where the first request's read never comes back, like a
 * request the phone gave up on (Cloudflare cancels its I/O). Every later
 * read answers at once with no rows. `reads` is the SQL of every read.
 */
function stalledFirstRequestDb() {
  const reads: string[] = [];
  const answer = async (sql: string) => {
    reads.push(sql);
    if (reads.length === 1) return new Promise<never>(() => {});
    return { results: [], meta: { changes: 0 } };
  };
  const prepare = (sql: string) => {
    const statement = {
      bind: () => statement,
      all: () => answer(sql),
      first: async () => ((await answer(sql)) as { results: unknown[] }).results[0] ?? null,
      run: () => answer(sql),
      raw: async () => [],
      sql,
    };
    return statement;
  };
  return {
    reads,
    prepare,
    batch: async (statements: { sql: string }[]) =>
      Promise.all(statements.map((statement) => answer(statement.sql))),
    exec: async () => ({ count: 0, duration: 0 }),
  };
}

// The timer keeps the test running until it fires: unref'd, a request that
// never settles ends the run as "cancelled" instead of failing this check.
async function settlesWithin<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), ms))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Waits, a few milliseconds at a time, until `ready()` is true. */
async function until(ready: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`not ready within ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('a request the phone abandoned does not hold up the next request in the isolate', async () => {
  const db = stalledFirstRequestDb();
  const auth = getAuth(authEnv(db));
  // A signed-in phone: the session token is looked up in D1.
  const headers = () => new Headers({ authorization: 'Bearer session-token-of-a-phone' });

  // The first request in a fresh isolate: its D1 read never comes back.
  // Wait for that read rather than a set time: a busy machine takes longer
  // than 20 ms to get there, and the next request's read was then the one
  // stalled (CI on main, 2026-11-21).
  void auth.api.getSession({ headers: headers() }).catch(() => {});
  await until(() => db.reads.length > 0, 5000);
  assert.match(db.reads[0]!, /from "session"/);

  // Later requests must not wait on a promise that belongs to the first one:
  // in production that wait fails ("This promise was created by a request
  // that has since ended") and the app gets server_error. Both ways in:
  // the /v1 session lookup and Better Auth's own /api/auth routes.
  const next = auth.api.getSession({ headers: headers() });
  assert.equal(await settlesWithin(next, 500), true);
  assert.equal(await next, null);
  const signIn = auth.handler(new Request('http://localhost:8787/api/auth/ok'));
  assert.equal(await settlesWithin(signIn, 500), true);
  assert.equal((await signIn).status, 200);

  // Each request looked up its own session; nothing read the schema.
  assert.equal(db.reads.filter((sql) => /from "session"/.test(sql)).length, 2);
  assert.equal(
    db.reads.some((sql) => /sqlite_master|pragma_/i.test(sql)),
    false,
    db.reads.join('\n'),
  );
});

/** The real D1 schema in SQLite, with the D1 calls Better Auth's check makes. */
function schemaDb(t: TestContext) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  const prepare = (sql: string) => {
    const statement = db.prepare(sql);
    let values: (string | number | null)[] = [];
    const read = async () => ({ results: statement.all(...values), meta: { changes: 0 } });
    return {
      bind(...args: (string | number | null)[]) {
        values = args;
        return this;
      },
      all: read,
      run: read,
    };
  };
  return {
    prepare,
    batch: (statements: { all: () => Promise<unknown> }[]) =>
      Promise.all(statements.map((statement) => statement.all())),
    exec: async () => ({ count: 0, duration: 0 }),
  };
}

test('schema.sql has every table and column Better Auth uses (checked here, not at runtime)', async (t) => {
  const context = await getAuth(authEnv(schemaDb(t))).$context;
  assert.equal(context.checkSchema, undefined);
  assert.ok(context.explicitSchemaCheck, 'Better Auth no longer offers its schema check');
  await context.explicitSchemaCheck();
});

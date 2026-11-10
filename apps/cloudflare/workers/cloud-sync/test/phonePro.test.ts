import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { checkInPhone, MAX_PRO_PHONES } from '../src/revenuecat.ts';

const phone = (n: number) => `m2t_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Real SQL against the D1 schema. Every database call takes one tick of a
 * logical clock, and calls started together share their tick, so `trips()`
 * is how many round trips to D1 the request waited for one after another.
 */
function fixture(t: TestContext, proPhones: string[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  let clock = 0;
  let calls = 0;
  const trip = async <T>(work: () => T): Promise<T> => {
    const startedAt = clock;
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    const result = work();
    clock = Math.max(clock, startedAt + 1);
    return result;
  };
  const prepare = (sql: string) => {
    const statement = db.prepare(sql.replace(/\?(\d+)/g, ':p$1'));
    let values: Record<string, string | number | null> = {};
    const reads = /^\s*(SELECT|WITH)/i.test(sql);
    const execute = () =>
      reads
        ? { results: statement.all(values), meta: { changes: 0 } }
        : { results: [], meta: { changes: Number(statement.run(values).changes) } };
    return {
      bind(...args: (string | number | null)[]) {
        values = Object.fromEntries(args.map((value, i) => [`p${i + 1}`, value]));
        return this;
      },
      first: () => trip(() => statement.get(values) ?? null),
      all: () => trip(() => ({ results: statement.all(values) })),
      run: () => trip(execute),
      execute,
    };
  };
  const env = {
    REVENUECAT_SECRET_KEY: 'test-key',
    REVENUECAT_ENTITLEMENT_ID: 'pro',
    AUTH_DB: {
      prepare,
      batch: (statements: { execute(): unknown }[]) =>
        trip(() => statements.map((statement) => statement.execute())),
    },
  } as unknown as Env;
  db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
    'user',
    'User',
    'user@example.test',
    '2026-10-31',
    '2026-10-31',
  );
  // RevenueCat: the phones in `proPhones` hold a lifetime purchase.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const id = decodeURIComponent(String(input).split('/').pop() ?? '');
    const entitlements = proPhones.includes(id) ? { pro: { expires_date: null } } : {};
    return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  return {
    db,
    env,
    /** Round trips waited for one after another, and calls made, since the last ask. */
    trips() {
      const counted = { waited: clock, calls };
      clock = 0;
      calls = 0;
      return counted;
    },
  };
}

test('a phone with its own purchase is Pro, and stays so from the cache', async (t) => {
  const { env, trips } = fixture(t, [phone(1)]);
  assert.deepEqual(await checkInPhone(env, 'user', phone(1)), { isPro: true, limited: false });
  trips();
  // The call every later sync makes: nothing to link, RevenueCat not asked.
  assert.deepEqual(await checkInPhone(env, 'user', phone(1)), { isPro: true, limited: false });
  // Was 4 one after another: link, record, account, own purchase.
  assert.deepEqual(trips(), { waited: 3, calls: 4 });
});

test("a second phone gets the account's Pro, up to the limit", async (t) => {
  const { env, trips } = fixture(t, [phone(1)]);
  await checkInPhone(env, 'user', phone(1));
  for (let n = 2; n <= MAX_PRO_PHONES + 1; n += 1) {
    assert.deepEqual(await checkInPhone(env, 'user', phone(n)), { isPro: true, limited: false });
  }
  trips();
  assert.deepEqual(await checkInPhone(env, 'user', phone(2)), { isPro: true, limited: false });
  // Was 5 one after another: link, record, account, own purchase, places.
  assert.deepEqual(trips(), { waited: 3, calls: 4 });
  // One past the limit waits for a place.
  assert.deepEqual(await checkInPhone(env, 'user', phone(MAX_PRO_PHONES + 2)), {
    isPro: false,
    limited: true,
  });
});

test('an account with no purchase is not Pro', async (t) => {
  const { env } = fixture(t, []);
  assert.deepEqual(await checkInPhone(env, 'user', phone(1)), { isPro: false, limited: false });
  assert.deepEqual(await checkInPhone(env, 'user', null), { isPro: false, limited: false });
});

test('an app that sends no App User ID is answered by the account', async (t) => {
  const { env } = fixture(t, [phone(1)]);
  await checkInPhone(env, 'user', phone(1));
  assert.deepEqual(await checkInPhone(env, 'user', null), { isPro: true, limited: false });
});

test('a phone claimed by another account neither links nor takes a place', async (t) => {
  const { db, env } = fixture(t, [phone(1)]);
  db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
    'other',
    'Other',
    'other@example.test',
    '2026-10-31',
    '2026-10-31',
  );
  await checkInPhone(env, 'other', phone(1));
  assert.deepEqual(await checkInPhone(env, 'user', phone(1)), { isPro: false, limited: false });
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM account_phones WHERE user_id = 'user'").get()?.n,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM pro_links WHERE user_id = 'user'").get()?.n,
    0,
  );
});

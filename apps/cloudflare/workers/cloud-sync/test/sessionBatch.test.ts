import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import worker from '../src/index.ts';
import { seal } from '../src/secretBox.ts';
import { extractBearerToken, SESSION_EXPIRES_IN_MS } from '../src/session.ts';

const SECRET = 'test-secret-for-session-batching-0123456789';
const PHONE_1 = 'm2t_00000000-0000-4000-8000-000000000001';
const PHONE_2 = 'm2t_00000000-0000-4000-8000-000000000002';

async function fixture(t: TestContext) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());

  let d1RoundTrips = 0;
  let blockBackground = false;
  const pendingWrites: (() => void)[] = [];
  const waitTurn = () =>
    blockBackground
      ? new Promise<void>((resolve) => pendingWrites.push(resolve))
      : new Promise<void>((resolve) => setImmediate(resolve));
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
      async first() {
        await new Promise<void>((resolve) => setImmediate(resolve));
        d1RoundTrips += 1;
        return statement.get(values) ?? null;
      },
      async all() {
        await new Promise<void>((resolve) => setImmediate(resolve));
        d1RoundTrips += 1;
        return { results: statement.all(values) };
      },
      async run() {
        await waitTurn();
        d1RoundTrips += 1;
        return execute();
      },
      execute,
    };
  };

  const notices: { user: string; channel: string; device: string | null; reason: string }[] = [];
  const r2Calls = { get: 0, head: 0, put: 0 };
  const env = {
    BETTER_AUTH_SECRET: SECRET,
    BETTER_AUTH_URL: 'https://sync.example',
    REVENUECAT_SECRET_KEY: 'test-rc-key',
    REVENUECAT_ENTITLEMENT_ID: 'pro',
    AUTH_DB: {
      prepare,
      async batch(statements: { execute(): unknown }[]) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        d1RoundTrips += 1;
        return statements.map((statement) => statement.execute());
      },
    },
    MEDIA: {
      async get() {
        r2Calls.get += 1;
        return null;
      },
      async head() {
        r2Calls.head += 1;
        return null;
      },
      async put() {
        r2Calls.put += 1;
        return {};
      },
    },
    SYNC_HUB: {
      idFromName: (user: string) => user,
      get: (user: string) => ({
        async fetch(_url: string, init: RequestInit) {
          notices.push({ user, ...JSON.parse(String(init.body)) });
          return new Response(null, { status: 204 });
        },
      }),
    },
  } as unknown as Env;

  const now = Date.now();
  const futureIso = new Date(now + SESSION_EXPIRES_IN_MS - 1000).toISOString();
  const createdIso = new Date(now).toISOString();
  db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
    'u1',
    'Mei',
    'mei@example.test',
    createdIso,
    createdIso,
  );
  db.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)').run(
    'sess-1',
    futureIso,
    'raw-token-0123456789abcdef012345',
    createdIso,
    createdIso,
    'u1',
  );
  db.prepare('INSERT INTO pro_links VALUES (?, ?, 1, ?)').run('u1', PHONE_1, now);
  db.prepare('INSERT INTO account_phones VALUES (?, ?, ?, ?)').run('u1', PHONE_1, now, now);
  db.prepare('INSERT INTO sync_databases VALUES (?, ?, ?, ?, ?)').run(
    'u1',
    'm2t-sync-u1',
    'libsql://u1.turso.io',
    await seal(env, 'turso-token', 'turso-jwt-1'),
    now + 5 * 86_400_000,
  );
  db.prepare('INSERT INTO shared_ledgers VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)').run(
    'share-1',
    'ledger-1',
    'u1',
    'Household',
    'm2t-ledger-share-1',
    'libsql://share-1.turso.io',
    now,
  );
  db.prepare('INSERT INTO shared_ledgers VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)').run(
    'album-1',
    'alb-1',
    'u1',
    'Bali',
    'm2t-album-album-1',
    'libsql://album-1.turso.io',
    now,
  );
  db.prepare('INSERT INTO shared_albums VALUES (?)').run('album-1');

  const pendingBg: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pendingBg.push(promise);
    },
  } as unknown as ExecutionContext;

  const call = (path: string, init: RequestInit = {}, token = 'raw-token-0123456789abcdef012345') =>
    worker.fetch(
      new Request(`https://sync.example${path}`, {
        ...init,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      }),
      env,
      ctx,
    );

  const flushBg = async () => {
    blockBackground = false;
    while (pendingWrites.length || pendingBg.length) {
      while (pendingWrites.length) pendingWrites.shift()!();
      const batch = pendingBg.splice(0);
      await Promise.all(batch);
    }
  };

  return {
    db,
    env,
    call,
    notices,
    r2Calls,
    flushBg,
    holdBackgroundWrites: () => {
      blockBackground = true;
    },
    trips() {
      const count = d1RoundTrips;
      d1RoundTrips = 0;
      return count;
    },
  };
}

test('extractBearerToken accepts raw and valid signed tokens and rejects forged signatures', async () => {
  const token = 'raw-token-0123456789abcdef012345';
  const sig = createHmac('sha256', SECRET).update(token).digest('base64');
  assert.equal(
    await extractBearerToken(
      new Request('https://sync.example/v1/ledgers', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      SECRET,
    ),
    token,
  );
  assert.equal(
    await extractBearerToken(
      new Request('https://sync.example/v1/ledgers', {
        headers: { Authorization: `Bearer ${token}.${sig}` },
      }),
      SECRET,
    ),
    token,
  );
  assert.equal(
    await extractBearerToken(
      new Request('https://sync.example/v1/ledgers', {
        headers: { Authorization: `Bearer ${token}.${encodeURIComponent(sig)}` },
      }),
      SECRET,
    ),
    token,
  );
  assert.equal(
    await extractBearerToken(
      new Request('https://sync.example/v1/ledgers', {
        headers: { Authorization: `Bearer ${token}.forgedsig` },
      }),
      SECRET,
    ),
    null,
  );
});

test('hot /v1 endpoints complete in a single D1 round trip including bearer auth', async (t) => {
  const f = await fixture(t);

  // 1. GET /v1/ledgers?albums=1
  const ledgers = await f.call('/v1/ledgers?albums=1');
  assert.equal(ledgers.status, 200);
  const ledgersBody = (await ledgers.json()) as { ledgers: { id: string; active: boolean }[] };
  assert.equal(ledgersBody.ledgers.length, 2);
  assert.ok(ledgersBody.ledgers.every((item) => item.active));
  assert.equal(f.trips(), 1);

  // 2. POST /v1/account/status (single phone -> hasOtherPhones: false)
  const status = await f.call('/v1/account/status', {
    method: 'POST',
    body: JSON.stringify({ appUserId: PHONE_1, storePro: true }),
  });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { isPro: true, limited: false, hasOtherPhones: false });
  assert.equal(f.trips(), 1);

  // 3. POST /v1/sync/credentials (session + Pro + phones + Turso DB in one D1 batch)
  const creds = await f.call('/v1/sync/credentials', {
    method: 'POST',
    body: JSON.stringify({ appUserId: PHONE_1, storePro: true }),
  });
  assert.equal(creds.status, 200);
  const credsBody = (await creds.json()) as {
    url: string;
    authToken: string;
    hasOtherPhones: boolean;
  };
  assert.equal(credsBody.url, 'libsql://u1.turso.io');
  assert.equal(credsBody.authToken, 'turso-jwt-1');
  assert.equal(credsBody.hasOtherPhones, false);
  assert.equal(f.trips(), 1);

  // 4. POST /v1/sync/notify (personal + shared): 1 D1 trip, hub notify runs in waitUntil
  const notifyPersonal = await f.call('/v1/sync/notify', {
    method: 'POST',
    body: JSON.stringify({ channel: 'personal', device: 'device-12345678' }),
  });
  assert.equal(notifyPersonal.status, 200);
  assert.equal(f.trips(), 1);
  await f.flushBg();
  assert.equal(f.notices.length, 1);

  f.holdBackgroundWrites();
  const notifyAlbum = await f.call('/v1/sync/notify', {
    method: 'POST',
    body: JSON.stringify({ channel: 'album-1', device: 'device-12345678' }),
  });
  assert.equal(notifyAlbum.status, 200);
  // Response returns after 1 D1 batch without waiting for background markLedgerChanged write.
  assert.equal(f.trips(), 1);
  await f.flushBg();
  assert.equal(f.notices.length, 2);

  // 5. GET /v1/ledgers/album-1/album?since=<stamp> (unchanged poll): 1 D1 trip
  const stampRow = f.db
    .prepare('SELECT changed_at FROM ledger_changes WHERE ledger_id = ?')
    .get('album-1') as { changed_at: number };
  f.trips();
  const poll = await f.call(`/v1/ledgers/album-1/album?since=${stampRow.changed_at}`);
  assert.equal(poll.status, 200);
  assert.deepEqual(await poll.json(), { unchanged: true, stamp: String(stampRow.changed_at) });
  assert.equal(f.trips(), 1);

  // 6. Bundled logo 404 does not touch R2 and costs 1 D1 trip (auth only)
  const bogus = await f.call('/v1/media/malaysia/maybank');
  assert.equal(bogus.status, 404);
  assert.equal(f.r2Calls.get, 0);
  assert.equal(f.trips(), 1);
});

test('a second phone joining nudges the account hub and flips hasOtherPhones to true', async (t) => {
  const f = await fixture(t);
  const res = await f.call('/v1/account/status', {
    method: 'POST',
    body: JSON.stringify({ appUserId: PHONE_2, storePro: false }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { isPro: true, limited: false, hasOtherPhones: true });
  await f.flushBg();
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].channel, 'personal');
});

test('an expired session is rejected with 401 and sliding renewal runs in waitUntil', async (t) => {
  const f = await fixture(t);
  // Session past the 7-day updateAge window extends asynchronously via waitUntil.
  const almostStale = new Date(Date.now() + SESSION_EXPIRES_IN_MS - 10 * 86_400_000).toISOString();
  f.db.prepare('UPDATE session SET expiresAt = ? WHERE id = ?').run(almostStale, 'sess-1');
  f.trips();
  f.holdBackgroundWrites();
  const res = await f.call('/v1/ledgers?albums=1');
  assert.equal(res.status, 200);
  // Response completes in 1 D1 trip without waiting for the waitUntil session refresh write.
  assert.equal(f.trips(), 1);
  await f.flushBg();
  const refreshed = f.db
    .prepare('SELECT expiresAt FROM session WHERE id = ?')
    .get('sess-1') as { expiresAt: string };
  assert.ok(Date.parse(refreshed.expiresAt) > Date.parse(almostStale));

  // Expired session is refused.
  f.db
    .prepare('UPDATE session SET expiresAt = ? WHERE id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), 'sess-1');
  const expired = await f.call('/v1/ledgers?albums=1');
  assert.equal(expired.status, 401);
});

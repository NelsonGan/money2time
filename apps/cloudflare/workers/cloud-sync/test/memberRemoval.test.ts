import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { deleteLedgerAccess, routeLedgers } from '../src/ledgers.ts';
import { open, seal } from '../src/secretBox.ts';

/** Real SQL against the D1 schema, with only the Cloudflare binding adapted. */
async function fixture(t: TestContext, mintAfterWait = false) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
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
      async all() {
        return { results: statement.all(values) };
      },
      async run() {
        return { meta: { changes: Number(statement.run(values).changes) } };
      },
    };
  };
  const notices: { user: string; reason: string; actor: string | null }[] = [];
  let failBatch = false;
  const env = {
    BETTER_AUTH_SECRET: 'test-secret',
    TURSO_API_TOKEN: 'test-platform-key',
    TURSO_ORG: 'test-org',
    AUTH_DB: {
      prepare,
      async batch(statements: { run(): Promise<unknown> }[]) {
        if (failBatch) throw new Error('d1_batch_failed');
        db.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
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
  for (const id of ['owner', 'member', 'remaining', 'outsider']) {
    db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
      id,
      id,
      `${id}@example.test`,
      '2026-10-31',
      '2026-10-31',
    );
  }
  db.prepare('INSERT INTO shared_ledgers VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)').run(
    'share',
    'ledger-123',
    'owner',
    'Household',
    'ledger-database',
    'libsql://test.example',
    await seal(env, 'turso-token', 'token-0'),
    Date.now() + 86_400_000,
    Date.now(),
  );
  for (const id of ['member', 'remaining']) {
    db.prepare('INSERT INTO ledger_members VALUES (?, ?, ?)').run('share', id, Date.now());
  }
  db.prepare('INSERT INTO ledger_links VALUES (?, ?, ?, ?, ?)').run(
    'share',
    'invite-hash',
    'sealed-invite',
    Date.now(),
    Date.now() + 86_400_000,
  );
  db.prepare('INSERT INTO pro_links VALUES (?, ?, 1, ?)').run('owner', 'purchase', Date.now());
  let epoch = 0;
  let failRotation = false;
  let onMint: (() => Promise<void>) | undefined;
  let onRotate: (() => Promise<void>) | undefined;
  const rotations: string[] = [];
  const fetcher = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = String(input);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-platform-key');
    if (url.endsWith('/auth/rotate')) {
      rotations.push(url);
      await onRotate?.();
      if (failRotation) return new Response(null, { status: 503 });
      epoch += 1;
      return new Response(null, { status: 200 });
    }
    assert.match(url, /\/databases\/ledger-database\/auth\/tokens\?/);
    const beforeWait = `token-${epoch}`;
    await onMint?.();
    return Response.json({ jwt: mintAfterWait ? `token-${epoch}` : beforeWait });
  });
  t.after(() => fetcher.mock.restore());
  const call = (user: string, path: string, method = 'POST') => {
    const url = new URL(`https://worker.example/v1/ledgers/share${path}`);
    return routeLedgers(new Request(url, { method }), url, env, {
      id: user,
      email: `${user}@example.test`,
      name: user,
    });
  };
  const remove = () => call('owner', '/members/member', 'DELETE');
  const memberExists = () =>
    !!db.prepare("SELECT 1 FROM ledger_members WHERE user_id = 'member'").get();
  const cachedToken = async () => {
    const row = db.prepare("SELECT token FROM shared_ledgers WHERE id = 'share'").get();
    return open(env, 'turso-token', String(row?.token));
  };
  return {
    db,
    env,
    call,
    remove,
    memberExists,
    cachedToken,
    rotations,
    notices,
    failRotation: (value: boolean) => (failRotation = value),
    failBatch: (value: boolean) => (failBatch = value),
    onMint: (callback: () => Promise<void>) => (onMint = callback),
    onRotate: (callback: () => Promise<void>) => (onRotate = callback),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

test('removal revokes only the ledger tokens and remaining members get fresh credentials', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.remove())?.status, 200);
  assert.equal(f.memberExists(), false);
  assert.deepEqual(f.rotations, [
    'https://api.turso.tech/v1/organizations/test-org/databases/ledger-database/auth/rotate',
  ]);
  assert.equal(f.db.prepare('SELECT 1 FROM ledger_links').get(), undefined);
  assert.equal(await f.cachedToken(), null);
  assert.equal((await f.call('member', '/credentials'))?.status, 404);
  const remaining = await f.call('remaining', '/credentials');
  assert.equal(remaining?.status, 200);
  assert.equal((await remaining?.json()).authToken, 'token-1');
  assert.equal(await f.cachedToken(), 'token-1');
  for (const user of ['owner', 'member', 'remaining']) {
    assert(f.notices.some((notice) => notice.user === user && notice.reason === 'access'));
  }
});

test('a failed rotation keeps membership and the invite so removal can be retried', async (t) => {
  const f = await fixture(t);
  f.failRotation(true);
  await assert.rejects(f.remove, /turso/);
  assert(f.memberExists());
  assert(f.db.prepare('SELECT 1 FROM ledger_links').get());
  assert.equal(await f.cachedToken(), null);
  assert.equal(f.notices.length, 0);
  f.failRotation(false);
  assert.equal((await f.remove())?.status, 200);
  assert.equal(f.memberExists(), false);
});

test('a database failure after rotation leaves removal retryable with no stale cached token', async (t) => {
  const f = await fixture(t);
  f.failBatch(true);
  await assert.rejects(f.remove, /d1_batch_failed/);
  assert(f.memberExists());
  assert.equal(await f.cachedToken(), null);
  f.failBatch(false);
  assert.equal((await f.remove())?.status, 200);
  assert.equal(f.memberExists(), false);
});

for (const mintAfterWait of [false, true]) {
  test(`an in-flight mint ${mintAfterWait ? 'after' : 'before'} rotation cannot leak credentials to a removed member`, async (t) => {
    const f = await fixture(t, mintAfterWait);
    f.db.prepare('UPDATE shared_ledgers SET token_expires_at = 0').run();
    const minted = deferred();
    const resume = deferred();
    f.onMint(async () => {
      minted.resolve();
      await resume.promise;
    });
    const pending = f.call('member', '/credentials');
    const rejected = assert.rejects(pending);
    await minted.promise;
    try {
      assert.equal((await f.remove())?.status, 200);
    } finally {
      resume.resolve();
    }
    await rejected;
    assert.equal(await f.cachedToken(), null);
    assert.equal((await f.call('member', '/credentials'))?.status, 404);
    const remaining = await f.call('remaining', '/credentials');
    assert.equal((await remaining?.json()).authToken, 'token-1');
  });
}

test('credentials and a second removal wait for an ongoing revocation', async (t) => {
  const f = await fixture(t);
  const rotating = deferred();
  const resume = deferred();
  f.onRotate(async () => {
    rotating.resolve();
    await resume.promise;
  });
  const removal = f.remove();
  await rotating.promise;
  try {
    await assert.rejects(() => f.call('member', '/credentials'));
    await assert.rejects(() => f.call('owner', '/members/remaining', 'DELETE'));
    assert(f.memberExists());
  } finally {
    resume.resolve();
  }
  assert.equal((await removal)?.status, 200);
  assert(f.db.prepare("SELECT 1 FROM ledger_members WHERE user_id = 'remaining'").get());
});

test('a terminated removal does not block credentials or a removal retry after the lease expires', async (t) => {
  const f = await fixture(t);
  f.db
    .prepare('UPDATE shared_ledgers SET token = ?, token_expires_at = ?')
    .run('revoking:abandoned', Date.now() - 1);
  const credentials = await f.call('remaining', '/credentials');
  assert.equal(credentials?.status, 200);
  assert.equal((await credentials?.json()).authToken, 'token-0');
  assert.equal((await f.remove())?.status, 200);
  assert.equal(f.memberExists(), false);
});

test('a rotation that finishes after lease recovery discards the credentials it revoked', async (t) => {
  const f = await fixture(t);
  const rotating = deferred();
  const resume = deferred();
  f.onRotate(async () => {
    rotating.resolve();
    await resume.promise;
  });
  const removal = f.remove();
  const rejected = assert.rejects(removal, /ledger_access_changed/);
  await rotating.promise;
  try {
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 61_000);
    const credentials = await f.call('remaining', '/credentials');
    assert.equal(credentials?.status, 200);
    assert.equal(await f.cachedToken(), 'token-0');
  } finally {
    resume.resolve();
  }
  await rejected;
  assert(f.memberExists());
  assert(f.db.prepare('SELECT 1 FROM ledger_links').get());
  assert.equal(await f.cachedToken(), null);
  const fresh = await f.call('remaining', '/credentials');
  assert.equal((await fresh?.json()).authToken, 'token-1');
});

test('a late rotation preserves the lock held by another removal', async (t) => {
  const f = await fixture(t);
  const firstRotating = deferred();
  const firstResume = deferred();
  const secondRotating = deferred();
  const secondResume = deferred();
  let rotations = 0;
  f.onRotate(async () => {
    if (++rotations === 1) {
      firstRotating.resolve();
      await firstResume.promise;
    } else {
      secondRotating.resolve();
      await secondResume.promise;
    }
  });
  const first = f.remove();
  const firstRejected = assert.rejects(first, /ledger_access_changed/);
  await firstRotating.promise;
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 61_000);
  const second = f.call('owner', '/members/remaining', 'DELETE');
  try {
    await secondRotating.promise;
    firstResume.resolve();
    await firstRejected;
    await assert.rejects(() => f.call('remaining', '/credentials'), /ledger_access_changing/);
  } finally {
    firstResume.resolve();
    secondResume.resolve();
  }
  assert.equal((await second)?.status, 200);
  assert(f.memberExists());
  assert.equal((await f.call('remaining', '/credentials'))?.status, 404);
});

test('a cached-token request rechecks access after removal', async (t) => {
  const f = await fixture(t);
  const decrypting = deferred();
  const resume = deferred();
  const original = crypto.subtle.decrypt.bind(crypto.subtle);
  const decrypt = t.mock.method(crypto.subtle, 'decrypt', async (...args) => {
    decrypting.resolve();
    await resume.promise;
    return original(...args);
  });
  const pending = f.call('member', '/credentials');
  const rejected = assert.rejects(pending, /ledger_access_changed/);
  await decrypting.promise;
  try {
    assert.equal((await f.remove())?.status, 200);
  } finally {
    resume.resolve();
  }
  await rejected;
  decrypt.mock.restore();
});

test('leaving also revokes saved tokens while keeping the invite for others', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('member', '/leave'))?.status, 200);
  assert.equal(f.rotations.length, 1);
  assert.equal(f.memberExists(), false);
  assert(f.db.prepare('SELECT 1 FROM ledger_links').get());
  assert(f.notices.some((notice) => notice.user === 'member' && notice.actor === 'member'));
});

test('deleting a member account revokes its shared-ledger tokens', async (t) => {
  const f = await fixture(t);
  await deleteLedgerAccess(f.env, 'member');
  assert.equal(f.rotations.length, 1);
  assert.equal(f.memberExists(), false);
  assert(f.db.prepare('SELECT 1 FROM ledger_links').get());
});

test('unauthorized, missing and owner membership removals never rotate tokens', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('member', '/members/remaining', 'DELETE'))?.status, 403);
  assert.equal((await f.call('outsider', '/members/member', 'DELETE'))?.status, 404);
  assert.equal((await f.call('owner', '/members/outsider', 'DELETE'))?.status, 404);
  assert.equal((await f.call('owner', '/members/owner', 'DELETE'))?.status, 404);
  assert.equal(f.rotations.length, 0);
});

test('local development removes membership without calling the Turso Platform API', async (t) => {
  const f = await fixture(t);
  f.env.LOCAL_SYNC_URL = 'http://localhost:8080';
  assert.equal((await f.remove())?.status, 200);
  assert.equal(f.memberExists(), false);
  assert.equal(f.rotations.length, 0);
});

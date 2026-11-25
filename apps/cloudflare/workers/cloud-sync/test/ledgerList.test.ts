import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { createHash } from 'node:crypto';

import { ledgerForMedia, previewInvite, routeLedgers } from '../src/ledgers.ts';
import { notifyUsers } from '../src/live.ts';

/** When the fixture's ledger was shared, and when its members joined it. */
const SHARED_AT = 1_700_000_000_000;
const JOINED_AT = 1_700_000_100_000;

/**
 * Real SQL against the D1 schema. Every database call takes one tick of a
 * logical clock, and calls started together share their tick, so `waited()`
 * is how many round trips to D1 the request waited for one after another.
 */
function fixture(t: TestContext, proUsers: string[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../d1/cloud-sync/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  let clock = 0;
  const trip = async <T>(work: () => T): Promise<T> => {
    const startedAt = clock;
    await new Promise((resolve) => setImmediate(resolve));
    const result = work();
    clock = Math.max(clock, startedAt + 1);
    return result;
  };
  const prepare = (sql: string) => {
    const statement = db.prepare(sql.replace(/\?(\d+)/g, ':p$1'));
    let values: Record<string, string | number | null> = {};
    return {
      bind(...args: (string | number | null)[]) {
        values = Object.fromEntries(args.map((value, i) => [`p${i + 1}`, value]));
        return this;
      },
      first: () => trip(() => statement.get(values) ?? null),
      all: () => trip(() => ({ results: statement.all(values) })),
      run: () => trip(() => ({ meta: { changes: Number(statement.run(values).changes) } })),
    };
  };
  // Live nudges go nowhere here.
  const hub = { fetch: async () => new Response(null) };
  const batch = (statements: { run: () => Promise<unknown> }[]) =>
    Promise.all(statements.map((statement) => statement.run()));
  const env = {
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'https://worker.example',
    AUTH_DB: { prepare, batch },
    SYNC_HUB: { idFromName: (name: string) => name, get: () => hub },
  } as unknown as Env;
  for (const id of ['owner', 'member', 'second', 'outsider']) {
    db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, NULL, ?, ?)').run(
      id,
      id === 'owner' ? 'Mei' : id,
      `${id}@example.test`,
      '2026-10-31',
      '2026-10-31',
    );
  }
  db.prepare('INSERT INTO shared_ledgers VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)').run(
    'share',
    'ledger-123',
    'owner',
    'Household',
    'ledger-database',
    'libsql://test.example',
    SHARED_AT,
  );
  for (const id of ['member', 'second']) {
    db.prepare('INSERT INTO ledger_members VALUES (?, ?, ?)').run('share', id, JOINED_AT);
  }
  // A cached Pro answer, so RevenueCat is never asked.
  for (const id of proUsers) {
    db.prepare('INSERT INTO pro_links VALUES (?, ?, 1, ?)').run(id, `purchase-${id}`, Date.now());
  }
  const session = (user: string) => ({ id: user, email: `${user}@example.test`, name: user });
  const list = async (user: string, query = '') => {
    const url = new URL(`https://worker.example/v1/ledgers${query}`);
    const response = await routeLedgers(new Request(url), url, env, session(user));
    return ((await response?.json()) as { ledgers: Record<string, unknown>[] }).ledgers;
  };
  /** A shared album owned by `owner`, with an open invite link; returns its code. */
  const addAlbum = () => {
    db.prepare('INSERT INTO shared_ledgers VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)').run(
      'trip',
      'album-456',
      'owner',
      'Bali trip',
      'album-database',
      'libsql://album.example',
      Date.now(),
    );
    db.prepare('INSERT INTO shared_albums VALUES (?)').run('trip');
    const code = 'A'.repeat(24);
    db.prepare('INSERT INTO ledger_links VALUES (?, ?, ?, ?, ?)').run(
      'trip',
      createHash('sha256').update(code).digest('hex'),
      'sealed',
      Date.now(),
      Date.now() + 60 * 60 * 1000,
    );
    return code;
  };
  const accept = async (user: string, code: string, body: unknown) => {
    const url = new URL(`https://worker.example/v1/invites/${code}/accept`);
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await routeLedgers(request, url, env, session(user));
    return { status: response?.status, body: (await response?.json()) as Record<string, unknown> };
  };
  const share = async (user: string, body: unknown) => {
    const url = new URL('https://worker.example/v1/ledgers');
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await routeLedgers(request, url, env, session(user));
    return { status: response?.status, body: (await response?.json()) as Record<string, unknown> };
  };
  /** An album's change stamp, as `access` reads it. */
  const stamp = (id: string) =>
    String(
      (
        db.prepare('SELECT changed_at FROM ledger_changes WHERE ledger_id = ?').get(id) as
          { changed_at: number } | undefined
      )?.changed_at ?? 0,
    );
  return {
    db,
    env,
    stamp,
    list,
    addAlbum,
    accept,
    share,
    waited() {
      const waited = clock;
      clock = 0;
      return waited;
    },
  };
}

const HOUSEHOLD = {
  id: 'share',
  ledgerId: 'ledger-123',
  name: 'Household',
  emoji: null,
  ownerId: 'owner',
  ownerName: 'Mei',
  memberCount: 2,
  kind: 'ledger',
};

test('the owner and a member each see the ledger with their role', async (t) => {
  const { list, waited } = fixture(t, ['owner']);
  assert.deepEqual(await list('owner'), [
    { ...HOUSEHOLD, role: 'owner', active: true, joinedAt: SHARED_AT },
  ]);
  // Was 3 one after another (then 2): owned + joined + fresh-Pro in one round trip.
  assert.equal(waited(), 1);
  assert.deepEqual(await list('member'), [
    { ...HOUSEHOLD, role: 'member', active: true, joinedAt: JOINED_AT },
  ]);
  assert.equal(waited(), 1);
  assert.deepEqual(await list('outsider'), []);
});

test('a ledger stays active while a member is Pro, and stops when nobody is', async (t) => {
  const memberPro = fixture(t, ['second']);
  assert.deepEqual(await memberPro.list('member'), [
    { ...HOUSEHOLD, role: 'member', active: true, joinedAt: JOINED_AT },
  ]);
  // Was 5 (then 3): fresh cached member Pro is checked in the list query itself.
  assert.equal(memberPro.waited(), 1);
  const nobody = fixture(t, []);
  assert.deepEqual(await nobody.list('owner'), [
    { ...HOUSEHOLD, role: 'owner', active: false, joinedAt: SHARED_AT },
  ]);
});

test('only the owner and members reach a ledger, in one read', async (t) => {
  const { env, waited } = fixture(t, ['owner']);
  assert.equal((await ledgerForMedia(env, 'share', 'owner'))?.id, 'share');
  assert.equal(waited(), 1);
  const forMember = await ledgerForMedia(env, 'share', 'member');
  assert.equal(forMember?.id, 'share');
  // The ledger row alone: the membership check that came with it is not on it.
  assert.equal('is_member' in (forMember ?? {}), false);
  // Was 2 for a member: the ledger, then the membership.
  assert.equal(waited(), 1);
  assert.equal(await ledgerForMedia(env, 'share', 'outsider'), null);
  assert.equal(await ledgerForMedia(env, 'missing', 'owner'), null);
});

test('a shared album is listed only for an app that asks for albums', async (t) => {
  const { list, addAlbum } = fixture(t, ['owner']);
  addAlbum();
  assert.deepEqual(await list('owner'), [
    { ...HOUSEHOLD, role: 'owner', active: true, joinedAt: SHARED_AT },
  ]);
  const all = await list('owner', '?albums=1');
  assert.deepEqual(all.map((item) => [item.id, item.ledgerId, item.kind, item.role]).sort(), [
    ['share', 'ledger-123', 'ledger', 'owner'],
    ['trip', 'album-456', 'album', 'owner'],
  ]);
});

test('joining a shared album needs an app that knows albums', async (t) => {
  const { env, list, addAlbum, accept } = fixture(t, ['owner']);
  const code = addAlbum();
  const preview = (await (await previewInvite(env, code)).json()) as Record<string, unknown>;
  assert.equal(preview.kind, 'album');
  assert.equal(preview.ledgerId, 'album-456');
  assert.equal(preview.full, false);
  // An app from before shared albums would take the group for a ledger.
  const old = await accept('outsider', code, {});
  assert.equal(old.status, 409);
  assert.equal(old.body.error, 'update_required');
  assert.deepEqual(await list('outsider', '?albums=1'), []);
  const joined = await accept('outsider', code, { albums: true });
  assert.equal(joined.status, 200);
  assert.equal((joined.body.ledger as Record<string, unknown>).kind, 'album');
  assert.deepEqual(
    (await list('outsider', '?albums=1')).map((item) => [item.id, item.role, item.memberCount]),
    [['trip', 'member', 1]],
  );
  // The link stays open, and joining twice is the same seat.
  assert.equal((await accept('outsider', code, { albums: true })).status, 200);
  assert.equal((await list('outsider', '?albums=1'))[0].memberCount, 1);
});

test('listing shared albums reads nothing more than the list', async (t) => {
  const { list, addAlbum, waited } = fixture(t, []);
  addAlbum();
  waited();
  const albums = (await list('owner', '?albums=1')).filter((item) => item.kind === 'album');
  assert.deepEqual(
    albums.map((item) => [item.ownerName, item.memberCount, item.active]),
    [['Mei', 0, true]],
  );
  // The ledger beside it still costs its two (its owner's Pro, then its
  // members'); the album adds no round trip of its own.
  assert.equal(waited(), 3);
});

test('a shared album needs nobody to be Pro', async (t) => {
  const { env, list, addAlbum, accept } = fixture(t, []);
  const code = addAlbum();
  // The ledger beside it is paused; the album is not.
  assert.deepEqual(
    (await list('owner', '?albums=1')).map((item) => [item.kind, item.active]).sort(),
    [
      ['album', true],
      ['ledger', false],
    ],
  );
  const preview = (await (await previewInvite(env, code)).json()) as Record<string, unknown>;
  assert.equal(preview.active, true);
  const joined = await accept('outsider', code, { albums: true });
  assert.equal(joined.status, 200);
  assert.equal((joined.body.ledger as Record<string, unknown>).active, true);
});

test('anyone signed in shares an album; a ledger still needs Pro', async (t) => {
  const { env, share } = fixture(t, []);
  // A local sync server stands in for the database a share makes.
  env.LOCAL_SYNC_URL = 'http://127.0.0.1:8080';
  env.LOCAL_LEDGER_SYNC_URLS = 'http://127.0.0.1:8093';
  // Phones never write an album's tables, so the share creates them there.
  const schema = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const ledger = await share('outsider', { ledgerId: 'ledger-789', name: 'Mine' });
  assert.equal(ledger.status, 403);
  assert.equal(ledger.body.error, 'not_pro');
  const album = await share('outsider', { ledgerId: 'album-789', name: 'Tokyo', kind: 'album' });
  assert.equal(album.status, 200);
  const shared = album.body.ledger as Record<string, unknown>;
  assert.deepEqual(
    [shared.ledgerId, shared.kind, shared.role, shared.active],
    ['album-789', 'album', 'owner', true],
  );
  assert.deepEqual(
    schema.mock.calls.map((call) => String(call.arguments[0])),
    ['http://127.0.0.1:8093/v2/pipeline'],
  );
});

test('an account starts sharing only so many albums in a day', async (t) => {
  const { env, share } = fixture(t, []);
  env.LOCAL_SYNC_URL = 'http://127.0.0.1:8080';
  // One free server: the first share takes it, the rest are refused for it
  // (501) until the day's count is used up, and then for the count.
  env.LOCAL_LEDGER_SYNC_URLS = 'http://127.0.0.1:8093';
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const answers: (number | undefined)[] = [];
  for (let n = 0; n < 22; n += 1) {
    const answer = await share('outsider', {
      ledgerId: `album-${1000 + n}`,
      name: 'Trip',
      kind: 'album',
    });
    answers.push(answer.status);
  }
  assert.equal(answers[0], 200);
  assert.deepEqual(answers.slice(1, 20), Array(19).fill(501));
  assert.deepEqual(answers.slice(20), [429, 429]);
  // Another account is counted on its own.
  const other = await share('member', { ledgerId: 'album-2000', name: 'Trip', kind: 'album' });
  assert.equal(other.status, 501);
});

test('an album read answers "unchanged" from its change stamp, without opening its database', async (t) => {
  const { env, addAlbum, stamp: ledgerStamp } = fixture(t, []);
  addAlbum();
  const read = async (since: string) => {
    const url = new URL(`https://worker.example/v1/ledgers/trip/album?since=${since}`);
    const response = await routeLedgers(new Request(url), url, env, {
      id: 'owner',
      email: 'owner@example.test',
      name: 'Mei',
    });
    return { status: response?.status, body: await response?.json() };
  };
  // Before any change the stamp is 0; the group's database is never asked.
  assert.deepEqual(await read('0'), { status: 200, body: { unchanged: true, stamp: '0' } });

  // Every notice to its phones moves it on, even two in the same millisecond.
  await notifyUsers(env, ['owner'], 'trip', null);
  const first = ledgerStamp('trip');
  await notifyUsers(env, ['owner'], 'trip', null, 'access');
  const second = ledgerStamp('trip');
  assert.ok(Number(first) > 0 && Number(second) > Number(first));
  assert.deepEqual(await read(String(second)), {
    status: 200,
    body: { unchanged: true, stamp: second },
  });

  // The personal channel, a plain shared ledger and one that is gone are passed over.
  await notifyUsers(env, ['owner'], 'personal', null);
  await notifyUsers(env, ['owner'], 'share', null);
  await notifyUsers(env, ['owner'], 'gone', null);
  assert.equal(ledgerStamp('share'), '0');
  assert.equal(ledgerStamp('gone'), '0');
  assert.equal(ledgerStamp('trip'), second);
});

const OWNER = { id: 'owner', email: 'owner@example.test', name: 'Mei' };

test("renaming an album from its owner's phone moves its change stamp, so the website reads it", async (t) => {
  const { env, addAlbum, stamp } = fixture(t, []);
  addAlbum();
  const invite = async (body: unknown) => {
    const url = new URL('https://worker.example/v1/ledgers/trip/invites');
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await routeLedgers(request, url, env, OWNER);
    return response?.status;
  };
  assert.equal(await invite({ name: 'Bali trip' }), 200);
  // The name it had: nothing changed, nothing to read again.
  assert.equal(stamp('trip'), '0');
  assert.equal(await invite({ name: 'Bali 2026' }), 200);
  const moved = stamp('trip');
  assert.ok(Number(moved) > 0);
  assert.equal(await invite({ name: 'Bali 2026' }), 200);
  assert.equal(stamp('trip'), moved);
});

test("an album's write is the website's only, and a token being revoked is busy, not an error", async (t) => {
  const { db, env, addAlbum } = fixture(t, []);
  addAlbum();
  const post = async (environment: Env, body: unknown) => {
    const url = new URL('https://worker.example/v1/ledgers/trip/album');
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await routeLedgers(request, url, environment, OWNER);
    return { status: response?.status, body: await response?.json() };
  };
  // A write not from the website (the removed path phones once took) is refused.
  const local = { ...env, LOCAL_SYNC_URL: 'http://127.0.0.1:1' } as Env;
  assert.deepEqual(await post(local, { action: 'write', rows: [] }), {
    status: 400,
    body: { error: 'bad_request' },
  });
  // While someone's access changes, the album's token is fenced: try again.
  db.prepare('UPDATE shared_ledgers SET token = ?, token_expires_at = ? WHERE id = ?').run(
    'revoking:abc',
    Date.now() + 60_000,
    'trip',
  );
  assert.deepEqual(await post(env, { action: 'join', name: 'Mei' }), {
    status: 409,
    body: { error: 'busy' },
  });
});

test('the list says when each account came into a share, new again after leaving and joining back', async (t) => {
  const { db, list } = fixture(t, ['owner']);
  assert.equal((await list('owner'))[0].joinedAt, SHARED_AT);
  assert.equal((await list('member'))[0].joinedAt, JOINED_AT);
  // Left, then joined again: the latest join is the one told.
  db.prepare('DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ?').run(
    'share',
    'member',
  );
  db.prepare('INSERT INTO ledger_members VALUES (?, ?, ?)').run('share', 'member', JOINED_AT + 5);
  assert.equal((await list('member'))[0].joinedAt, JOINED_AT + 5);
});

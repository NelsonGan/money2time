import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { createHash } from 'node:crypto';

import { ledgerForMedia, previewInvite, routeLedgers } from '../src/ledgers.ts';

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
  const env = {
    AUTH_DB: { prepare },
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
    Date.now(),
  );
  for (const id of ['member', 'second']) {
    db.prepare('INSERT INTO ledger_members VALUES (?, ?, ?)').run('share', id, Date.now());
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
  return {
    env,
    list,
    addAlbum,
    accept,
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
  assert.deepEqual(await list('owner'), [{ ...HOUSEHOLD, role: 'owner', active: true }]);
  // Was 3 one after another: owned ledgers, joined ledgers, then each view.
  assert.equal(waited(), 2);
  assert.deepEqual(await list('member'), [{ ...HOUSEHOLD, role: 'member', active: true }]);
  assert.equal(waited(), 2);
  assert.deepEqual(await list('outsider'), []);
});

test('a ledger stays active while a member is Pro, and stops when nobody is', async (t) => {
  const memberPro = fixture(t, ['second']);
  assert.deepEqual(await memberPro.list('member'), [
    { ...HOUSEHOLD, role: 'member', active: true },
  ]);
  // Was 5: owned, joined, the owner's Pro, the members, the members' Pro.
  assert.equal(memberPro.waited(), 3);
  const nobody = fixture(t, []);
  assert.deepEqual(await nobody.list('owner'), [{ ...HOUSEHOLD, role: 'owner', active: false }]);
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
  assert.deepEqual(await list('owner'), [{ ...HOUSEHOLD, role: 'owner', active: true }]);
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

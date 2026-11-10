import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';

import type { Env } from '../src/env.ts';
import { ledgerForMedia, routeLedgers } from '../src/ledgers.ts';

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
  const env = { AUTH_DB: { prepare } } as unknown as Env;
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
  const list = async (user: string) => {
    const url = new URL('https://worker.example/v1/ledgers');
    const response = await routeLedgers(new Request(url), url, env, {
      id: user,
      email: `${user}@example.test`,
      name: user,
    });
    return ((await response?.json()) as { ledgers: Record<string, unknown>[] }).ledgers;
  };
  return {
    env,
    list,
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

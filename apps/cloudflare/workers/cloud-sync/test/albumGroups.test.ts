import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { CLOUD_SCHEMA_SQL } from '../src/turso.ts';
import {
  type GroupDb,
  GroupWriteError,
  joinGroup,
  memberRowId,
  planLeave,
  planWrite,
  readGroup,
  readOwnerName,
  type WriteRequest,
  writeGroup,
} from '../src/albumGroups.ts';

// A shared album's group written by the Worker alone: real SQL against the
// cloud copy's schema (`sync_rows`), as Turso would run it.

function database() {
  const db = new DatabaseSync(':memory:');
  for (const sql of CLOUD_SCHEMA_SQL) db.exec(sql);
  let beforeCommit: (() => void) | null = null;
  const group: GroupDb = {
    async query({ sql, args }) {
      return db.prepare(sql).all(...args) as Record<string, unknown>[];
    },
    async transaction(statements) {
      // Another write landing between the read and this one.
      beforeCommit?.();
      beforeCommit = null;
      db.exec('BEGIN');
      try {
        for (const { sql, args } of statements) db.prepare(sql).all(...args);
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        if (/overflow/i.test(String(error))) return false;
        throw error;
      }
    },
  };
  const rows = (table: string) =>
    (
      db.prepare('SELECT data FROM sync_rows WHERE table_name = ? ORDER BY row_id').all(table) as {
        data: string;
      }[]
    ).map((row) => JSON.parse(row.data));
  const raw = (table: string, id: string) =>
    db
      .prepare('SELECT data, rev FROM sync_rows WHERE table_name = ? AND row_id = ?')
      .get(table, id) as { data: string; rev: string } | undefined;
  return { db, group, rows, raw, interleave: (fn: () => void) => (beforeCommit = fn) };
}

let ids = 0;
const ctx = (userId: string) => ({
  groupId: 'bali',
  userId,
  now: '2026-11-14T10:00:00.000Z',
  newId: () => `id${(ids += 1)}`,
});
const join = (group: GroupDb, userId: string, name: string) => joinGroup(group, ctx(userId), name);
const write = (group: GroupDb, userId: string, request: WriteRequest) =>
  writeGroup(group, request, (state) => planWrite(state, ctx(userId), request, 'owner'));

const bill = (
  paidBy: string,
  shares: Record<string, number>,
  extra: Record<string, unknown> = {},
) => ({
  table: 'album_expenses',
  row: {
    id: 'dinner',
    date: '2026-11-14',
    note: 'Dinner',
    currency: 'MYR',
    paid_by: paidBy,
    shares_json: JSON.stringify(
      Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount })),
    ),
    ...extra,
  },
});

async function trip() {
  const fixture = database();
  await join(fixture.group, 'owner', 'Nelson');
  await join(fixture.group, 'tess', 'Tess');
  await join(fixture.group, 'ben', 'Ben');
  return fixture;
}

test('joining puts each person on the list once, under a name nobody else has', async () => {
  const { group, rows } = database();
  await join(group, 'owner', 'Nelson');
  await join(group, 'tess', 'nelson');
  assert.deepEqual(await join(group, 'tess', 'Tess'), []);
  assert.deepEqual(
    rows('album_members').map((m) => [m.id, m.name, m.user_id]),
    [
      ['u-bali-owner', 'Nelson', 'owner'],
      ['u-bali-tess', 'nelson 2', 'tess'],
    ],
  );
  assert.deepEqual(
    rows('album_activity').map((a) => [a.kind, a.actor_user_id, a.member_id]),
    [
      ['member_joined', 'owner', 'u-bali-owner'],
      ['member_joined', 'tess', 'u-bali-tess'],
    ],
  );
});

test("one person's rows in two albums never share an id", async () => {
  // A phone keeps every album's members in one table, keyed by id alone.
  const bali = memberRowId('814391bf-69f9-40fc-8657-b6c0277cba51', 'owner');
  const tioman = memberRowId('27005a5c-7bcb-41d1-9759-ed9982951c4e', 'owner');
  assert.notEqual(bali, tioman);
  assert.match(bali, /^[A-Za-z0-9_-]{1,64}$/);
  assert.equal(memberRowId('814391bf-69f9-40fc-8657-b6c0277cba51', 'owner'), bali);
  const { group, rows } = database();
  await join(group, 'owner', 'Nelson');
  assert.deepEqual(
    rows('album_members').map((m) => m.id),
    [memberRowId('bali', 'owner')],
  );
});

test('an album starts with Simplify group debts on, and turning it off sticks', async () => {
  const { group, rows } = database();
  await join(group, 'owner', 'Nelson');
  assert.deepEqual(
    rows('album_groups').map((g) => [g.id, g.simplify_debts]),
    [['bali', 1]],
  );
  // Starting it is no change of the setting: the log says only who started it.
  assert.deepEqual(
    rows('album_activity').map((a) => [a.kind, JSON.parse(a.data_json)]),
    [['member_joined', { started: true }]],
  );
  await write(group, 'owner', {
    rows: [{ table: 'album_groups', row: { id: 'bali', simplify_debts: 0 } }],
  });
  // Someone joining later leaves the setting as the album has it.
  await join(group, 'tess', 'Tess');
  assert.deepEqual(
    rows('album_groups').map((g) => g.simplify_debts),
    [0],
  );
  assert.deepEqual(
    rows('album_activity').map((a) => [a.kind, JSON.parse(a.data_json).started ?? false]),
    [
      ['member_joined', true],
      ['simplify_changed', false],
      ['member_joined', false],
    ],
  );
});

test('anyone in the album adds and edits any bill, stamped and logged as them', async () => {
  const { group, rows } = await trip();
  // Tess adds a bill Ben paid.
  await write(group, 'tess', {
    rows: [bill('u-bali-ben', { 'u-bali-owner': 30, 'u-bali-tess': 30, 'u-bali-ben': 30 })],
  });
  // Ben edits it; the total is worked out from the shares, whatever was sent.
  await write(group, 'ben', {
    rows: [
      bill(
        'u-bali-ben',
        { 'u-bali-owner': 40, 'u-bali-tess': 40, 'u-bali-ben': 40 },
        { amount: 1 },
      ),
    ],
  });
  const [dinner] = rows('album_expenses');
  assert.equal(dinner.amount, 120);
  assert.equal(dinner.created_by, 'ben');
  assert.equal(dinner.created_at, '2026-11-14T10:00:00.000Z');
  const log = rows('album_activity').filter((a) => a.kind.startsWith('bill_'));
  const edited = log.find((a) => a.kind === 'bill_edited');
  assert.ok(log.find((a) => a.kind === 'bill_added' && a.actor_user_id === 'tess'));
  assert.equal(edited.actor_member_id, 'u-bali-ben');
  const data = JSON.parse(edited.data_json);
  assert.equal(data.before.amount, 90);
  assert.equal(data.after.amount, 120);
  assert.deepEqual(
    data.after.shares.map((s: { amount: number }) => s.amount),
    [40, 40, 40],
  );
});

test('the author cannot be forged, and nothing is written outside the rules', async () => {
  const { group, rows } = await trip();
  // A modified app naming someone else as its author.
  await write(group, 'tess', {
    rows: [bill('u-bali-tess', { 'u-bali-tess': 10 }, { created_by: 'ben' })],
  });
  assert.equal(rows('album_expenses')[0].created_by, 'tess');
  const refused = async (userId: string, request: WriteRequest, code: string) =>
    assert.rejects(write(group, userId, request), (error: unknown) => {
      assert.ok(error instanceof GroupWriteError);
      assert.equal(error.code, code);
      return true;
    });
  // Not in the album.
  await refused('stranger', { rows: [bill('u-bali-tess', { 'u-bali-tess': 10 })] }, 'not_member');
  // Someone who is not a member on a bill.
  await refused('tess', { rows: [bill('u-bali-tess', { 'u-nobody': 10 })] }, 'not_a_member');
  // The log is the Worker's alone.
  await refused(
    'tess',
    { rows: [{ table: 'album_activity', row: { id: 'x', kind: 'bill_added' } }] },
    'bad_request',
  );
  // Another member's name.
  await refused(
    'tess',
    { rows: [{ table: 'album_members', row: { id: 'u-bali-ben', name: 'Bob' } }] },
    'forbidden',
  );
  await refused(
    'tess',
    { rows: [{ table: 'album_members', row: { id: 'u-bali-tess', name: 'BEN' } }] },
    'name_taken',
  );
});

test('a deleted bill keeps its payments, and Restore brings it back, all logged', async () => {
  const { group, rows } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30, 'u-bali-ben': 30 })],
  });
  await write(group, 'tess', {
    rows: [
      {
        table: 'album_settlements',
        row: {
          id: 'p1',
          expense_id: 'dinner',
          from_member: 'u-bali-tess',
          to_member: 'u-bali-owner',
          amount: 30,
          currency: 'MYR',
          date: '2026-11-14',
        },
      },
    ],
  });
  await write(group, 'ben', {
    rows: [{ table: 'album_expenses', row: { id: 'dinner', deleted_at: 'x' } }],
  });
  assert.ok(rows('album_expenses')[0].deleted_at);
  assert.equal(rows('album_settlements')[0].deleted_at, null);
  // Restored from the deleted row, as it was.
  const deleted = rows('album_expenses')[0];
  await write(group, 'tess', {
    rows: [{ table: 'album_expenses', row: { ...deleted, deleted_at: null } }],
  });
  assert.equal(rows('album_expenses')[0].deleted_at, null);
  assert.equal(rows('album_expenses')[0].amount, 90);
  assert.deepEqual(
    rows('album_activity')
      .filter((a) => !a.kind.startsWith('member_'))
      .map((a) => [a.kind, a.actor_user_id])
      .sort(),
    [
      ['bill_added', 'owner'],
      ['bill_deleted', 'ben'],
      ['bill_restored', 'tess'],
      ['payment_recorded', 'tess'],
    ],
  );
});

test('payments of one act are one line per pair, and are only ever undone', async () => {
  const { group, rows } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-tess': 30, 'u-bali-ben': 30 })],
  });
  const pay = (id: string, from: string, amount: number) => ({
    table: 'album_settlements',
    row: {
      id,
      expense_id: 'dinner',
      from_member: from,
      to_member: 'u-bali-owner',
      amount,
      currency: 'MYR',
      date: '2026-11-14',
    },
  });
  await write(group, 'ben', {
    rows: [pay('b.0', 'u-bali-tess', 10), pay('b.1', 'u-bali-tess', 5)],
  });
  // A payment in another currency than its bill's would count nowhere.
  await assert.rejects(
    write(group, 'ben', {
      rows: [
        {
          ...pay('usd', 'u-bali-tess', 5),
          row: { ...pay('usd', 'u-bali-tess', 5).row, currency: 'USD' },
        },
      ],
    }),
  );
  // Changing a recorded payment's amount is not a thing; undoing it is.
  await write(group, 'ben', { rows: [pay('b.0', 'u-bali-tess', 99)] });
  assert.equal(rows('album_settlements')[0].amount, 10);
  await write(group, 'ben', {
    rows: [
      { table: 'album_settlements', row: { id: 'b.0', deleted_at: 'x' } },
      { table: 'album_settlements', row: { id: 'b.1', deleted_at: 'x' } },
    ],
  });
  const payments = rows('album_activity').filter((a) => a.kind.startsWith('payment_'));
  assert.deepEqual(payments.map((a) => [a.kind, JSON.parse(a.data_json).amount]).sort(), [
    ['payment_recorded', 15],
    ['payment_undone', 15],
  ]);
});

test('someone who left changes nothing and is put on no new bill, but stays on old ones', async () => {
  const { group, rows } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-ben', { 'u-bali-ben': 30, 'u-bali-owner': 30 })],
  });
  await writeGroup(group, null, (state) => planLeave(state, ctx('ben'), 'ben'));
  assert.equal(rows('album_members').find((m) => m.id === 'u-bali-ben').user_id, null);
  assert.ok(rows('album_activity').find((a) => a.kind === 'member_left'));
  await assert.rejects(write(group, 'ben', { rows: [bill('u-bali-ben', { 'u-bali-ben': 1 })] }));
  // Ben stays the payer of his bill, which the others can still edit.
  await write(group, 'tess', {
    rows: [bill('u-bali-ben', { 'u-bali-ben': 40, 'u-bali-owner': 40 })],
  });
  assert.equal(rows('album_expenses')[0].amount, 80);
  // But nobody new names him.
  await assert.rejects(
    write(group, 'tess', {
      rows: [
        {
          ...bill('u-bali-ben', { 'u-bali-tess': 10 }),
          row: { ...bill('u-bali-ben', { 'u-bali-tess': 10 }).row, id: 'taxi' },
        },
      ],
    }),
  );
});

test('two writes at once never lose one another', async () => {
  const { db, group, rows, interleave } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30 })],
  });
  // Another write lands while Ben's is between its read and its own.
  interleave(() => {
    const dinner = { ...rows('album_expenses')[0], amount: 100 };
    db.prepare(
      "UPDATE sync_rows SET data = ?, rev = 'other' WHERE table_name = 'album_expenses' AND row_id = 'dinner'",
    ).run(JSON.stringify(dinner));
  });
  await write(group, 'ben', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 70, 'u-bali-tess': 70 })],
  });
  // Ben's was planned again on what landed first.
  const edit = rows('album_activity').find((a) => a.kind === 'bill_edited');
  assert.equal(JSON.parse(edit.data_json).before.amount, 100);
  assert.equal(rows('album_expenses')[0].amount, 140);
  assert.equal(rows('album_activity').filter((a) => a.kind === 'bill_edited').length, 1);
});

test('a bill or payment written on the website names its writer as web:<account>', async () => {
  const { group, rows } = await trip();
  const web = (request: WriteRequest) =>
    writeGroup(group, request, (state) =>
      planWrite(state, { ...ctx('tess'), via: 'web' }, request, 'owner'),
    );
  await web({ rows: [bill('u-bali-tess', { 'u-bali-tess': 50, 'u-bali-owner': 50 })] });
  await web({
    rows: [
      {
        table: 'album_settlements',
        row: {
          id: 'pay1',
          expense_id: 'dinner',
          from_member: 'u-bali-owner',
          to_member: 'u-bali-tess',
          amount: 50,
          currency: 'MYR',
          date: '2026-11-14',
        },
      },
    ],
  });
  assert.equal(rows('album_expenses')[0].created_by, 'web:tess');
  assert.equal(rows('album_settlements')[0].created_by, 'web:tess');
  // The log still names the account: it is who did it, wherever they were.
  assert.ok(rows('album_activity').every((a) => a.actor_user_id !== 'web:tess'));
  // The same writer on a phone is their plain account again.
  await write(group, 'tess', {
    rows: [bill('u-bali-tess', { 'u-bali-tess': 60, 'u-bali-owner': 60 })],
  });
  assert.equal(rows('album_expenses')[0].created_by, 'tess');
});

test('the website reads the whole group, the newest log entries first', async () => {
  const { group } = await trip();
  await write(group, 'tess', {
    rows: [bill('u-bali-tess', { 'u-bali-tess': 50, 'u-bali-owner': 50 })],
  });
  const read = await readGroup(group);
  const count = (table: string) => read.filter((row) => row.table === table).length;
  assert.equal(count('album_members'), 3);
  assert.equal(count('album_expenses'), 1);
  assert.equal(count('album_groups'), 1);
  assert.equal(count('album_activity'), 4);
  assert.equal(read.find((row) => row.table === 'album_expenses')?.data.note, 'Dinner');
});

test("an invite names its owner as the album knows them", async () => {
  const { group } = await trip();
  assert.equal(await readOwnerName(group, 'owner'), 'Nelson');
  assert.equal(await readOwnerName(group, 'nobody'), null);
});

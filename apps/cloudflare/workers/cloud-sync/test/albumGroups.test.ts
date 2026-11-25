import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { CLOUD_SCHEMA_SQL } from '../src/turso.ts';
import {
  type GroupDb,
  GroupWriteError,
  joinGroup,
  planLeave,
  planWrite,
  readGroup,
  readOwnerName,
  type WriteBase,
  type WriteRequest,
  writeGroup,
} from '../src/albumGroups.ts';
import { MAX_WRITE_ROWS, memberRowId } from '../src/groupPlan.generated.ts';
import { writeBaseOf } from '../src/ledgers.ts';

// What the Worker writes to a shared album's group (someone joining or
// leaving, the website's changes): real SQL against the cloud copy's schema
// (`sync_rows`), as Turso would run it. The rules themselves are the app's
// (groupPlan.generated.ts), tested here through the Worker's writes.

function database() {
  const db = new DatabaseSync(':memory:');
  for (const sql of CLOUD_SCHEMA_SQL) db.exec(sql);
  let beforeCommit: (() => void) | null = null;
  /** Round trips to the database for reads. */
  let trips = 0;
  const group: GroupDb = {
    async queryAll(statements) {
      trips += 1;
      return statements.map(
        ({ sql, args }) => db.prepare(sql).all(...args) as Record<string, unknown>[],
      );
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
  return {
    db,
    group,
    rows,
    raw,
    interleave: (fn: () => void) => (beforeCommit = fn),
    trips: () => trips,
  };
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

test('joining on the website names someone already in as they asked', async () => {
  const { group, rows } = database();
  await join(group, 'owner', 'Nelson');
  // The app put Tess in first, under its default name.
  await join(group, 'tess', 'Tess.lim');
  const web = (userId: string, name: string) =>
    joinGroup(group, { ...ctx(userId), via: 'web' }, name);
  await web('tess', 'Tess');
  assert.deepEqual(
    rows('album_members').map((m) => m.name),
    ['Nelson', 'Tess'],
  );
  // The app joining again changes nothing, nor does a name someone else has.
  assert.deepEqual(await join(group, 'tess', 'T'), []);
  assert.deepEqual(await web('tess', 'nelson'), []);
  assert.deepEqual(
    rows('album_activity').map((a) => a.kind),
    ['member_joined', 'member_joined', 'member_renamed'],
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
  // A payment in another currency than its bill's (one changed since) is
  // taken: it is owed back in its own currency.
  await write(group, 'ben', {
    rows: [
      {
        ...pay('usd', 'u-bali-tess', 5),
        row: { ...pay('usd', 'u-bali-tess', 5).row, currency: 'USD' },
      },
    ],
  });
  assert.equal(rows('album_settlements').find((row) => row.id === 'usd')?.currency, 'USD');
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
    ['payment_recorded', 5],
    ['payment_undone', 15],
  ]);
});

test('one act takes as many rows as MAX_WRITE_ROWS, and no more', async () => {
  const { group, rows } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-tess': 30, 'u-bali-ben': 30 })],
  });
  const pay = (n: number) => ({
    table: 'album_settlements',
    row: {
      id: `big.${n}`,
      expense_id: 'dinner',
      from_member: 'u-bali-tess',
      to_member: 'u-bali-owner',
      amount: 0.01,
      currency: 'MYR',
      date: '2026-11-14',
    },
  });
  const many = (count: number) => Array.from({ length: count }, (_, n) => pay(n));
  await assert.rejects(write(group, 'ben', { rows: many(MAX_WRITE_ROWS + 1) }), GroupWriteError);
  await write(group, 'ben', { rows: many(MAX_WRITE_ROWS) });
  assert.equal(rows('album_settlements').length, MAX_WRITE_ROWS);
  const logged = rows('album_activity').filter((a) => a.kind === 'payment_recorded');
  assert.deepEqual(
    logged.map((a) => JSON.parse(a.data_json).amount),
    [MAX_WRITE_ROWS / 100],
  );
});

test('a simplified debt paid along several bills reads as one payment', async () => {
  const { group, rows } = await trip();
  const twoBills = [
    bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-ben': 30, 'u-bali-tess': 10 }),
    {
      ...bill('u-bali-tess', { 'u-bali-tess': 10, 'u-bali-ben': 10 }),
      row: { ...bill('u-bali-tess', { 'u-bali-tess': 10, 'u-bali-ben': 10 }).row, id: 'taxi' },
    },
  ];
  await write(group, 'owner', { rows: twoBills });
  const pay = (id: string, bill: string, from: string, to: string, amount: number) => ({
    table: 'album_settlements',
    row: {
      id,
      expense_id: bill,
      from_member: from,
      to_member: to,
      amount,
      currency: 'MYR',
      date: '2026-11-14',
    },
  });
  const payments = () =>
    rows('album_activity')
      .filter((a) => a.kind === 'payment_recorded')
      .map((a) => JSON.parse(a.data_json));
  // Ben pays Nelson 40, simplified: 30 on the dinner, 10 to Tess on the taxi,
  // and Tess's 10 on the dinner passed on to Nelson. Tess comes out even.
  await write(group, 'ben', {
    rows: [
      pay('s.0', 'dinner', 'u-bali-ben', 'u-bali-owner', 30),
      pay('s.1', 'dinner', 'u-bali-tess', 'u-bali-owner', 10),
      pay('s.2', 'taxi', 'u-bali-ben', 'u-bali-tess', 10),
    ],
  });
  assert.deepEqual(
    payments().map((p) => [p.from, p.to, p.amount, p.bills]),
    [['u-bali-ben', 'u-bali-owner', 40, ['dinner', 'taxi']]],
  );
  // Payments that leave more than one person paid stay one line per pair.
  await write(group, 'tess', {
    rows: [
      pay('t.0', 'dinner', 'u-bali-ben', 'u-bali-owner', 5),
      pay('t.1', 'taxi', 'u-bali-ben', 'u-bali-tess', 5),
    ],
  });
  assert.equal(payments().length, 3);
});

test('joining again after leaving takes the row they left back', async () => {
  const { group, rows } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-ben', { 'u-bali-ben': 30, 'u-bali-owner': 30 })],
  });
  await writeGroup(group, null, (state) => planLeave(state, ctx('ben'), 'ben'));
  await join(group, 'ben', 'Benjamin');
  const members = rows('album_members');
  assert.deepEqual(
    members.map((m) => [m.id, m.name, m.user_id]),
    [
      ['u-bali-ben', 'Ben', 'ben'],
      ['u-bali-owner', 'Nelson', 'owner'],
      ['u-bali-tess', 'Tess', 'tess'],
    ],
  );
  const joined = rows('album_activity').filter((a) => a.kind === 'member_joined');
  assert.equal(joined.at(-1).member_id, 'u-bali-ben');
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

test("two writes at once never lose one another, a phone's push included", async () => {
  const { db, group, rows, interleave } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30 })],
  });
  // A phone's push lands while Ben's is between its read and its own.
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

test('two people joining at once never take one name', async () => {
  const { db, group, rows, interleave } = await trip();
  // Another "Ben" joins while this one is being planned.
  interleave(() => {
    db.prepare('INSERT INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)').run(
      'album_members',
      'u-bali-ben2',
      JSON.stringify({
        id: 'u-bali-ben2',
        ledger_id: 'bali',
        name: 'Zed',
        user_id: 'zed',
        sort_order: 9,
        created_at: 'x',
        updated_at: 'x',
        deleted_at: null,
      }),
      'other',
      'worker',
      1,
    );
  });
  await join(group, 'zed-two', 'Zed');
  const names = rows('album_members').map((m) => m.name);
  assert.equal(names.filter((n) => n === 'Zed').length, 1);
  assert.ok(names.includes('Zed 2'));
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
  const { rows: read, moneyRev } = await readGroup(group);
  assert.match(moneyRev, /^[0-9a-f]{32}$/);
  assert.ok(read.every((row) => typeof row.rev === 'string' && row.rev.length > 0));
  const count = (table: string) => read.filter((row) => row.table === table).length;
  assert.equal(count('album_members'), 3);
  assert.equal(count('album_expenses'), 1);
  assert.equal(count('album_groups'), 1);
  assert.equal(count('album_activity'), 4);
  assert.equal(read.find((row) => row.table === 'album_expenses')?.data.note, 'Dinner');
});

test('an invite names its owner as the album knows them', async () => {
  const { group } = await trip();
  assert.equal(await readOwnerName(group, 'owner'), 'Nelson');
  assert.equal(await readOwnerName(group, 'nobody'), null);
});

test("a bill's category is one of the album's, the same for everyone, and changing it is logged", async () => {
  const { group, rows } = await trip();
  // A bill an older app wrote is read by its icon, else its English name, else Other.
  assert.equal(
    (await import('../src/groupPlan.generated.ts')).albumCategoryOf({
      category_name: 'Makan',
      category_icon: 'car',
    }),
    'transport',
  );
  // The website writes the key; the bill keeps that category's English name
  // and icon too, which older apps match against their own categories.
  await write(group, 'tess', {
    rows: [bill('u-bali-tess', { 'u-bali-tess': 30, 'u-bali-ben': 30 }, { category_key: 'food' })],
  });
  assert.deepEqual(
    rows('album_expenses').map((row) => [row.category_key, row.category_name, row.category_icon]),
    [['food', 'Food', 'meal']],
  );
  // An older app sends its own category's name and icon, never a key: its
  // edit keeps the bill's album category.
  await write(group, 'ben', {
    rows: [
      bill(
        'u-bali-tess',
        { 'u-bali-tess': 30, 'u-bali-ben': 30 },
        { note: 'Dinner out', category_name: 'Makan', category_icon: 'car' },
      ),
    ],
  });
  assert.equal(rows('album_expenses')[0].category_key, 'food');
  await write(group, 'tess', {
    rows: [
      bill('u-bali-tess', { 'u-bali-tess': 30, 'u-bali-ben': 30 }, { category_key: 'transport' }),
    ],
  });
  assert.equal(rows('album_expenses')[0].category_key, 'transport');
  const edits = rows('album_activity').filter((entry) => entry.kind === 'bill_edited');
  assert.deepEqual(
    edits.map((entry) => {
      const data = JSON.parse(entry.data_json);
      return [data.before.category, data.after.category];
    }),
    [
      ['food', 'food'],
      ['food', 'transport'],
    ],
  );
});

test('the website reads the group in one round trip, and a write reads what it needs in one', async () => {
  const fixture = await trip();
  const before = fixture.trips();
  await readGroup(fixture.group);
  assert.equal(fixture.trips() - before, 1);
  await write(fixture.group, 'tess', {
    rows: [bill('u-bali-tess', { 'u-bali-tess': 50, 'u-bali-owner': 50 })],
  });
  assert.equal(fixture.trips() - before, 2);
});

test('readGroup JS moneyRev matches SQL MONEY_STAMP_SQL across bills, payments and deletions', async () => {
  const { db, group } = await trip();
  const { moneyRevOf } = await import('../src/albumGroups.ts');
  await write(group, 'owner', {
    rows: [
      bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30 }, { id: 'b-zebra' }),
      bill('u-bali-tess', { 'u-bali-owner': 10, 'u-bali-tess': 10 }, { id: 'b-alpha' }),
    ],
  });
  await write(group, 'tess', {
    rows: [
      {
        table: 'album_settlements',
        row: {
          id: 's-1',
          expense_id: 'b-zebra',
          from_member: 'u-bali-tess',
          to_member: 'u-bali-owner',
          amount: 15,
          currency: 'MYR',
          date: '2026-11-14',
        },
      },
    ],
  });
  const { moneyRev } = await readGroup(group);
  const sqlStamp = (
    db
      .prepare(
        `SELECT COALESCE((SELECT group_concat(table_name || ':' || row_id || ':' || rev, ',') FROM
           (SELECT table_name, row_id, rev FROM sync_rows
            WHERE table_name IN ('album_expenses', 'album_settlements')
            ORDER BY table_name, row_id)), '') AS money`,
      )
      .get() as { money: string }
  ).money;
  assert.equal(moneyRev, await moneyRevOf(sqlStamp));
});

/** A website write, with what the page read: the rows' revisions and the money stamp. */
async function webWrite(
  group: GroupDb,
  userId: string,
  rows: { table: string; row: Record<string, unknown>; base?: string | null }[],
  moneyBase?: string,
) {
  const request: WriteRequest = { rows };
  const base: WriteBase = writeBaseOf(rows, moneyBase);
  return writeGroup(
    group,
    request,
    (state) => planWrite(state, { ...ctx(userId), via: 'web' }, request, 'owner'),
    base,
  );
}

const stale = (error: unknown) => {
  assert.ok(error instanceof GroupWriteError);
  assert.equal(error.code, 'stale');
  assert.equal(error.status, 409);
  return true;
};

test('a website change made on a bill a phone changed since is refused as stale, never written over it', async () => {
  const { db, group, rows, raw } = await trip();
  // Added on the website: a new bill's base is null, it was not there.
  await webWrite(group, 'tess', [
    { ...bill('u-bali-tess', { 'u-bali-tess': 30, 'u-bali-ben': 30 }), base: null },
  ]);
  const read = raw('album_expenses', 'dinner')!.rev;
  // A phone edits it, then the page (still on its read) edits it too.
  db.prepare(
    "UPDATE sync_rows SET rev = 'phone.1', data = json_set(data, '$.note', 'Phone') WHERE row_id = 'dinner'",
  ).run();
  await assert.rejects(
    webWrite(group, 'tess', [
      { ...bill('u-bali-tess', { 'u-bali-tess': 40, 'u-bali-ben': 40 }), base: read },
    ]),
    stale,
  );
  assert.equal(rows('album_expenses')[0].note, 'Phone');
  // A phone deletes it: the page's edit is not a restore.
  db.prepare(
    "UPDATE sync_rows SET rev = 'phone.2', data = json_set(data, '$.deleted_at', 'x') WHERE row_id = 'dinner'",
  ).run();
  await assert.rejects(
    webWrite(group, 'tess', [
      { ...bill('u-bali-tess', { 'u-bali-tess': 40, 'u-bali-ben': 40 }), base: 'phone.1' },
    ]),
    stale,
  );
  await assert.rejects(
    webWrite(group, 'tess', [
      { table: 'album_expenses', row: { id: 'dinner', deleted_at: 'x' }, base: 'phone.1' },
    ]),
    stale,
  );
  assert.ok(!rows('album_activity').some((a) => a.kind === 'bill_restored'));
  // Read again, the same change goes.
  await webWrite(group, 'tess', [
    { ...bill('u-bali-tess', { 'u-bali-tess': 40, 'u-bali-ben': 40 }), base: 'phone.2' },
  ]);
  assert.equal(rows('album_expenses')[0].amount, 80);
  // A bill id someone else took meanwhile is no new bill.
  await assert.rejects(
    webWrite(group, 'tess', [
      { ...bill('u-bali-tess', { 'u-bali-tess': 1, 'u-bali-ben': 1 }), base: null },
    ]),
    stale,
  );
});

test('a website payment is refused as stale once any bill or payment changed since the page read', async () => {
  const fixture = await trip();
  const { group, rows } = fixture;
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30 })],
  });
  const pay = (id: string) => ({
    table: 'album_settlements',
    row: {
      id,
      expense_id: 'dinner',
      from_member: 'u-bali-tess',
      to_member: 'u-bali-owner',
      amount: 30,
      currency: 'MYR',
      date: '2026-11-14',
    },
  });
  const { moneyRev } = await readGroup(group);
  // Tess's phone records her payment; the page, on its read, records it again.
  await write(group, 'tess', { rows: [pay('phone.0')] });
  await assert.rejects(webWrite(group, 'owner', [pay('web.0')], moneyRev), stale);
  assert.equal(rows('album_settlements').length, 1);
  // Read again, a payment goes (and the page's own debts say none is owed now).
  const fresh = await readGroup(group);
  assert.notEqual(fresh.moneyRev, moneyRev);
  await webWrite(group, 'owner', [pay('web.1')], fresh.moneyRev);
  assert.equal(rows('album_settlements').length, 2);
});

test("a payment landing between the website's check and its write still makes it stale", async () => {
  const { db, group, rows, interleave } = await trip();
  await write(group, 'owner', {
    rows: [bill('u-bali-owner', { 'u-bali-owner': 30, 'u-bali-tess': 30 })],
  });
  const { moneyRev } = await readGroup(group);
  interleave(() => {
    db.prepare('INSERT INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)').run(
      'album_settlements',
      'phone',
      JSON.stringify({ id: 'phone', ledger_id: 'bali', expense_id: 'dinner' }),
      'phone.1',
      'phone',
      1,
    );
  });
  await assert.rejects(
    webWrite(
      group,
      'owner',
      [
        {
          table: 'album_settlements',
          row: {
            id: 'web',
            expense_id: 'dinner',
            from_member: 'u-bali-tess',
            to_member: 'u-bali-owner',
            amount: 30,
            currency: 'MYR',
            date: '2026-11-14',
          },
        },
      ],
      moneyRev,
    ),
    stale,
  );
  assert.deepEqual(
    rows('album_settlements').map((row) => row.id),
    ['phone'],
  );
});

test("the website's Simplify switch is refused as stale when a phone switched it since", async () => {
  const { db, group, rows, raw } = await trip();
  const read = raw('album_groups', 'bali')!.rev;
  db.prepare(
    "UPDATE sync_rows SET rev = 'phone.1', data = json_set(data, '$.simplify_debts', 0) WHERE table_name = 'album_groups'",
  ).run();
  await assert.rejects(
    webWrite(group, 'tess', [
      { table: 'album_groups', row: { id: 'bali', simplify_debts: 0 }, base: read },
    ]),
    stale,
  );
  assert.equal(rows('album_groups')[0].simplify_debts, 0);
  // A row without a base (an older page) is not checked.
  await webWrite(group, 'tess', [
    { table: 'album_groups', row: { id: 'bali', simplify_debts: 1 } },
  ]);
  assert.equal(rows('album_groups')[0].simplify_debts, 1);
});

test("an album's own categories: changed, added, removed and reordered for everyone, and logged", async () => {
  const plan = await import('../src/groupPlan.generated.ts');
  const { group, rows } = await trip();
  const category = (key: string, extra: Record<string, unknown> = {}) => ({
    table: 'album_categories',
    row: { id: plan.categoryRowId('bali', key), key, name: null, icon: null, ...extra },
  });
  // Food renamed (its icon kept), Tickets added.
  await write(group, 'tess', {
    rows: [
      category('food', { name: 'Meals', sort_order: 0 }),
      category('c-tickets01', { name: 'Tickets', icon: 'emoji:🎟️', sort_order: 8 }),
    ],
  });
  const list = () => plan.albumCategoryList(rows('album_categories'));
  assert.deepEqual(
    list().map((entry) => [entry.key, entry.name, entry.icon]),
    [
      ['food', 'Meals', null],
      ['groceries', null, null],
      ['transport', null, null],
      ['housing', null, null],
      ['bills', null, null],
      ['healthcare', null, null],
      ['shopping', null, null],
      ['other', null, null],
      ['c-tickets01', 'Tickets', 'emoji:🎟️'],
    ],
  );
  assert.ok(rows('album_categories').every((row) => row.created_by === 'tess'));
  // A bill under the added one keeps its key, name and icon for older apps.
  await write(group, 'tess', {
    rows: [
      bill(
        'u-bali-tess',
        { 'u-bali-tess': 30, 'u-bali-ben': 30 },
        { category_key: 'c-tickets01', category_name: 'Tickets', category_icon: 'emoji:🎟️' },
      ),
    ],
  });
  assert.deepEqual(
    rows('album_expenses').map((row) => [row.category_key, row.category_name, row.category_icon]),
    [['c-tickets01', 'Tickets', 'emoji:🎟️']],
  );
  // An older app's edit (no key) keeps the added category.
  await write(group, 'ben', {
    rows: [
      bill(
        'u-bali-tess',
        { 'u-bali-tess': 30, 'u-bali-ben': 30 },
        { note: 'Show', category_name: 'Other', category_icon: 'invoice' },
      ),
    ],
  });
  assert.equal(rows('album_expenses')[0].category_key, 'c-tickets01');
  assert.equal(rows('album_expenses')[0].category_name, 'Tickets');
  // A move in the list is written but not logged; Groceries removed.
  await write(group, 'ben', {
    rows: [
      category('c-tickets01', { name: 'Tickets', icon: 'emoji:🎟️', sort_order: 1 }),
      category('groceries', { sort_order: 2, deleted_at: 'removed' }),
    ],
  });
  assert.deepEqual(
    list().map((entry) => entry.key),
    ['food', 'c-tickets01', 'transport', 'housing', 'bills', 'healthcare', 'shopping', 'other'],
  );
  const logged = rows('album_activity')
    .filter((entry) => entry.kind === 'category_changed')
    .map((entry) => JSON.parse(entry.data_json));
  assert.deepEqual(logged, [
    { key: 'food', before: { name: null, icon: null }, after: { name: 'Meals', icon: null } },
    { key: 'c-tickets01', before: null, after: { name: 'Tickets', icon: 'emoji:🎟️' } },
    { key: 'groceries', before: { name: null, icon: null }, after: null },
  ]);
});

test("a move in an album's category list keeps a rename and a removal it has not seen", async () => {
  const plan = await import('../src/groupPlan.generated.ts');
  const { group, rows } = await trip();
  const row = (key: string, extra: Record<string, unknown>) => ({
    table: 'album_categories',
    row: { id: plan.categoryRowId('bali', key), key, ...extra },
  });
  await write(group, 'tess', {
    rows: [
      row('food', { name: 'Meals', icon: null, sort_order: 0 }),
      row('c-tickets01', { name: 'Tickets', icon: 'emoji:🎟️', sort_order: 8 }),
    ],
  });
  await write(group, 'tess', { rows: [row('c-tickets01', { deleted_at: 'removed' })] });
  const logged = () => rows('album_activity').filter((entry) => entry.kind === 'category_changed');
  const before = logged().length;
  // Ben's phone, which has not seen either yet, moves them: places only.
  await write(group, 'ben', {
    rows: [row('c-tickets01', { sort_order: 0 }), row('food', { sort_order: 1 })],
  });
  const list = plan.albumCategoryList(rows('album_categories'));
  assert.equal(list.find((entry) => entry.key === 'food')?.name, 'Meals');
  assert.equal(list.find((entry) => entry.key === 'food')?.sortOrder, 1);
  assert.equal(
    list.some((entry) => entry.key === 'c-tickets01'),
    false,
  );
  // Not news: nothing renamed or added back.
  assert.equal(logged().length, before);
  // An icon alone keeps the name, and a default with no row keeps its place.
  await write(group, 'ben', {
    rows: [row('food', { icon: 'cup' }), row('bills', { icon: 'cup' })],
  });
  const after = plan.albumCategoryList(rows('album_categories'));
  assert.deepEqual(
    [after.find((entry) => entry.key === 'food'), after.find((entry) => entry.key === 'bills')].map(
      (entry) => [entry?.name, entry?.icon, entry?.sortOrder],
    ),
    [
      ['Meals', 'cup', 1],
      [null, 'cup', 4],
    ],
  );
});

test("an album's categories refuse what the rules do not allow", async () => {
  const plan = await import('../src/groupPlan.generated.ts');
  const { group, rows } = await trip();
  const refused = async (row: Record<string, unknown>, code: string) =>
    assert.rejects(
      write(group, 'tess', { rows: [{ table: 'album_categories', row }] }),
      (error: unknown) => error instanceof GroupWriteError && error.code === code,
    );
  const id = (key: string) => plan.categoryRowId('bali', key);
  // Other is always there.
  await refused({ id: id('other'), key: 'other', deleted_at: 'x' }, 'forbidden');
  // One row per album and key.
  await refused({ id: 'elsewhere', key: 'food', name: 'Meals' }, 'bad_row');
  // An added one has a name; an icon is a bundled one or an emoji, never an upload.
  await refused({ id: id('c-abcdef12'), key: 'c-abcdef12', icon: 'meal' }, 'bad_row');
  await refused({ id: id('food'), key: 'food', icon: 'custom:category-icons/x.png' }, 'bad_row');
  await refused({ id: id('c-'), key: 'c-', name: 'x' }, 'bad_row');
  assert.equal(rows('album_categories').length, 0);
  // Another album's row or a bad key is never a category of this one.
  assert.deepEqual(
    plan
      .albumCategoryList([
        { key: 'nope', name: 'x' },
        { key: 'other', deleted_at: 'x', name: 'Misc' },
      ])
      .map((entry) => [entry.key, entry.name])
      .slice(-1),
    [['other', 'Misc']],
  );
});

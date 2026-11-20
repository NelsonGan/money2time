import assert from "node:assert/strict";
import { test } from "node:test";

import { billEffect, groupTotals, openShares, paidFrom, pairwiseDebts, simplifyDebts } from "./debts.ts";
import { albumsOf, billPeople, parseGroup, type Bill, type Payment } from "./group.ts";
import { balanceSelf, readValue, splitShares, valuesFor, type SplitInput } from "./split.ts";
import { billBase, billRow, deletedBillRow, evenGroupRows, recordsPayment, settleRows, simplifyRow, undonePaymentRows } from "./writes.ts";

const T = "2026-11-14T10:00:00.000Z";
const album = { id: "share1", ledgerId: "bali", name: "Bali", role: "member", ownerId: "owner", ownerName: "Nelson", memberCount: 2, kind: "album" };
const member = (id: string, name: string, userId: string | null, sort = 0) => ({
  table: "album_members",
  id,
  data: { id, ledger_id: "bali", name, user_id: userId, sort_order: sort, created_at: T, updated_at: T, deleted_at: null },
});
const billData = (id: string, paidBy: string, shares: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  table: "album_expenses",
  id,
  data: {
    id,
    ledger_id: "bali",
    date: "2026-11-14",
    note: id,
    amount: Object.values(shares).reduce((a, b) => a + b, 0),
    currency: "MYR",
    paid_by: paidBy,
    shares_json: JSON.stringify(Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount }))),
    created_by: "owner",
    created_at: T,
    updated_at: T,
    deleted_at: null,
    ...extra,
  },
});

const bill = (id: string, paidBy: string, shares: Record<string, number>, extra: Partial<Bill> = {}): Bill => ({
  id,
  date: "2026-11-14",
  note: id,
  amount: Object.values(shares).reduce((a, b) => a + b, 0),
  currency: "MYR",
  category: "other",
  paidBy,
  shares: Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount })),
  createdBy: null,
  createdAt: T,
  updatedAt: T,
  deleted: false,
  rev: null,
  ...extra,
});
const pay = (id: string, expenseId: string, from: string, to: string, amount: number): Payment => ({
  id,
  expenseId,
  fromMember: from,
  toMember: to,
  amount,
  currency: "MYR",
  date: "2026-11-14",
  createdBy: null,
  createdAt: T,
  deleted: false,
});

test("a group is read as a phone reads it: bad rows and strangers' rows are left out", () => {
  const group = parseGroup({
    album,
    userId: "tess",
    rows: [
      member("m-owner", "Nelson", "owner", 0),
      member("m-tess", "Tess", "tess", 1),
      member("m-gone", "Ben", null, 2),
      member("bad id!", "X", "x"),
      billData("dinner", "m-owner", { "m-owner": 50, "m-tess": 50 }),
      billData("stranger", "m-who", { "m-who": 10 }),
      billData("nope", "m-owner", { "m-owner": -5 }),
      billData("other-album", "m-owner", { "m-owner": 5 }, { ledger_id: "ski" }),
      { table: "album_groups", id: "bali", data: { id: "bali", ledger_id: "bali", simplify_debts: 1, cover_photo_uri: "album-covers/abc.jpg", created_at: T } },
      {
        table: "album_activity",
        id: "a1",
        data: { id: "a1", ledger_id: "bali", kind: "member_joined", actor_member_id: "m-tess", member_id: "m-tess", data_json: "{}", created_at: "2026-11-14T11:00:00.000Z" },
      },
      {
        table: "album_activity",
        id: "a0",
        data: { id: "a0", ledger_id: "bali", kind: "member_joined", member_id: "m-owner", data_json: '{"started":true}', created_at: T },
      },
      { table: "album_activity", id: "a2", data: { id: "a2", kind: "unknown_kind", created_at: T } },
    ],
  });
  assert.ok(group);
  assert.equal(group.selfId, "m-tess");
  assert.deepEqual(
    group.members.map((m) => [m.id, m.userId]),
    [
      ["m-owner", "owner"],
      ["m-tess", "tess"],
      ["m-gone", null],
    ],
  );
  assert.deepEqual(
    group.bills.map((b) => b.id),
    ["dinner"],
  );
  assert.equal(group.simplify, true);
  assert.equal(group.cover, "album-covers/abc.jpg");
  assert.deepEqual(
    group.activity.map((a) => [a.id, a.started ?? null]),
    [
      ["a1", false],
      ["a0", true],
    ],
  );
  // Someone who left is put on no new bill, but stays on the ones they are on.
  assert.deepEqual(
    billPeople(group.members, null).map((m) => m.id),
    ["m-owner", "m-tess"],
  );
  assert.deepEqual(
    billPeople(group.members, bill("x", "m-gone", { "m-gone": 1 })).map((m) => m.id),
    ["m-owner", "m-tess", "m-gone"],
  );
});

test("an answer that is not a group reads as none, and the list keeps only albums", () => {
  assert.equal(parseGroup({ album, rows: [] }), null);
  assert.equal(parseGroup(null), null);
  assert.deepEqual(
    albumsOf({ ledgers: [album, { ...album, id: "l", kind: "ledger" }] }).map((a) => a.id),
    ["share1"],
  );
});

test("debts and totals come out as in the app", () => {
  const bills = [bill("dinner", "a", { a: 30, b: 30, c: 30 }), bill("taxi", "b", { b: 10, c: 10 })];
  const open = openShares(bills, []);
  assert.deepEqual(pairwiseDebts(open), [
    { from: "b", to: "a", currency: "MYR", amount: 30 },
    { from: "c", to: "a", currency: "MYR", amount: 30 },
    { from: "c", to: "b", currency: "MYR", amount: 10 },
  ]);
  const simplified = simplifyDebts(open);
  const net = (id: string) => simplified.reduce((sum, d) => sum + (d.to === id ? d.amount : 0) - (d.from === id ? d.amount : 0), 0);
  assert.equal(net("a"), 60);
  assert.equal(net("c"), -40);
  assert.deepEqual(groupTotals(bills, "b").get("MYR"), { total: 110, selfPaid: 20, selfShare: 40 });
});

test("settling a debt writes payments on its bills, never more than is owed", () => {
  const group = { bills: [bill("dinner", "a", { a: 30, b: 30 })], payments: [] as Payment[], simplify: false };
  const rows = settleRows(group, { from: "b", to: "a", currency: "MYR", amount: 100 }, "2026-11-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.amount, 30);
  assert.equal(rows[0].row.expense_id, "dinner");
  assert.match(String(rows[0].row.id), /\.0$/);
  // Paid already: nothing more to write.
  const paid = { ...group, payments: [pay("p.0", "dinner", "b", "a", 30)] };
  assert.deepEqual(settleRows(paid, { from: "b", to: "a", currency: "MYR", amount: 30 }, "2026-11-15"), []);
});

test("an even group with Simplify on closes its circle; off, it does not", () => {
  const circle = [bill("1", "a", { a: 10, b: 10 }), bill("2", "b", { b: 10, c: 10 }), bill("3", "c", { c: 10, a: 10 })];
  const even = evenGroupRows({ album, bills: circle, payments: [], simplify: true }, "2026-11-15");
  assert.equal(even.length, 3);
  assert.equal(evenGroupRows({ album, bills: circle, payments: [], simplify: false }, "2026-11-15").length, 0);
  // Named after what they close, as the app names them: two writers closing
  // the same group write the same rows.
  const again = evenGroupRows({ album, bills: circle, payments: [], simplify: true }, "2026-11-16");
  assert.deepEqual(
    again.map((row) => row.row.id),
    even.map((row) => row.row.id),
  );
  assert.match(String(even[0].row.id), /^even-[0-9a-z]+\.0$/);
  assert.notDeepEqual(
    evenGroupRows({ album: { ledgerId: "tioman" }, bills: circle, payments: [], simplify: true }, "2026-11-15").map((row) => row.row.id),
    even.map((row) => row.row.id),
  );
});

test("a bill whose currency changed after a payment keeps it, owed back in its own currency", () => {
  // Ben paid Nelson MYR 30 on dinner; then dinner was changed to USD.
  const dinner = bill("dinner", "nelson", { nelson: 10, ben: 10 }, { currency: "USD" });
  const paid = pay("s1", "dinner", "ben", "nelson", 30);
  assert.deepEqual(openShares([dinner], [paid]), [
    { expenseId: "dinner", from: "ben", to: "nelson", currency: "USD", amount: 10 },
    { expenseId: "dinner", from: "nelson", to: "ben", currency: "MYR", amount: 30 },
  ]);
  // Paying the ringgit back on the bill closes that side.
  const back = pay("s2", "dinner", "nelson", "ben", 30);
  assert.deepEqual(openShares([dinner], [paid, back]), [{ expenseId: "dinner", from: "ben", to: "nelson", currency: "USD", amount: 10 }]);
});

test("undoing a payment undoes its whole act, by exact prefix", () => {
  const payments = [pay("b1.0", "x", "a", "b", 1), pay("b1.1", "y", "a", "b", 1), pay("b10.0", "x", "a", "b", 1), pay("solo", "x", "a", "b", 1)];
  assert.deepEqual(
    undonePaymentRows("b1.1", payments).map((r) => r.row.id),
    ["b1.0", "b1.1"],
  );
  assert.deepEqual(
    undonePaymentRows("solo", payments).map((r) => r.row.id),
    ["solo"],
  );
});

test("each split method fills in amounts that add up to the bill", () => {
  const base: SplitInput = { method: "even", totalCents: 10000, people: ["me", "tess", "ben"], values: {}, selfId: "me" };
  assert.deepEqual(
    splitShares(base).shares.map((s) => s.amount),
    [33.34, 33.33, 33.33],
  );
  const percent = { ...base, method: "percent" as const, values: { me: "50", tess: "25", ben: "25" } };
  assert.deepEqual(
    splitShares(percent).shares.map((s) => s.amount),
    [50, 25, 25],
  );
  assert.deepEqual(splitShares({ ...percent, values: { me: "50", tess: "25" } }).problem, { kind: "percent", given: 75 });
  const shares = { ...base, method: "shares" as const, values: { me: "2", tess: "1", ben: "1" } };
  assert.deepEqual(
    splitShares(shares).shares.map((s) => s.amount),
    [50, 25, 25],
  );
  const adjust = { ...base, method: "adjust" as const, values: { tess: "10" } };
  assert.deepEqual(
    splitShares(adjust).shares.map((s) => s.amount),
    [30, 40, 30],
  );
  const amount = { ...base, method: "amount" as const, values: { me: "20", tess: "30", ben: "40" } };
  assert.deepEqual(splitShares(amount).problem, { kind: "amount_left", cents: 1000 });
  // The user's own row takes what is left when someone else's is typed.
  assert.equal(balanceSelf(amount, "tess").me, "30");
  // Switching method keeps the split.
  assert.deepEqual(valuesFor("percent", base), { me: "33.34", tess: "33.33", ben: "33.33" });
  assert.deepEqual(valuesFor("adjust", base), { me: "0", tess: "0", ben: "0" });
});

test("a typed amount reads with either decimal mark", () => {
  assert.equal(readValue("12,50"), 12.5);
  assert.equal(readValue("1,234.50"), 1234.5);
  assert.equal(readValue("1.234,50"), 1234.5);
  assert.equal(readValue(""), 0);
});

test("a change names the revisions it was planned from, so the Worker can refuse it as stale", () => {
  const moneyRev = "0123456789abcdef0123456789abcdef";
  const group = parseGroup({
    album,
    userId: "tess",
    moneyRev,
    rows: [
      member("m-owner", "Nelson", "owner", 0),
      member("m-tess", "Tess", "tess", 1),
      { ...billData("dinner", "m-owner", { "m-owner": 50, "m-tess": 50 }), rev: "phone.1" },
      { table: "album_groups", id: "bali", data: { id: "bali", ledger_id: "bali", simplify_debts: 1, created_at: T }, rev: "w.2" },
    ],
  });
  assert.ok(group);
  assert.equal(group.moneyRev, moneyRev);
  assert.equal(group.settingsRev, "w.2");
  const dinner = group.bills[0];
  assert.equal(dinner.rev, "phone.1");
  // An edit and a delete carry the bill as read; a new bill says it was not there.
  assert.equal(billRow({ ...dinner, note: "Dinner" }, billBase(dinner)).base, "phone.1");
  assert.equal(deletedBillRow(dinner).base, "phone.1");
  assert.equal(billRow({ ...dinner, id: "new" }, billBase(null)).base, null);
  assert.equal(simplifyRow(group, false).base, "w.2");
  // From a Worker that sends no revisions, nothing is checked.
  const older = parseGroup({ album, userId: "tess", rows: [member("m-owner", "Nelson", "owner"), billData("dinner", "m-owner", { "m-owner": 5 }), { table: "album_groups", id: "bali", data: { id: "bali", ledger_id: "bali", created_at: T } }] });
  assert.ok(older);
  assert.equal(older.moneyRev, null);
  assert.ok(!("base" in deletedBillRow(older.bills[0])));
  assert.ok(!("base" in simplifyRow(older, true)));
  // No settings row yet: the switch writes a new one.
  assert.equal(simplifyRow({ ...older, settingsRev: null }, true).base, null);
  // Payments go with the money stamp; undoing one does not need it.
  const payments = settleRows(group, { from: "m-tess", to: "m-owner", currency: "MYR", amount: 50 }, "2026-11-15");
  assert.equal(recordsPayment(payments), true);
  assert.equal(recordsPayment(undonePaymentRows(String(payments[0].row.id), [])), false);
  assert.equal(recordsPayment([{ table: "album_settlements", row: { id: "p", deleted_at: "undone" } }]), false);
});

test("a bill's row says what it is to the viewer", () => {
  const shares = (entries: Record<string, number>) => Object.entries(entries).map(([memberId, amount]) => ({ memberId, amount }));
  // Someone else paid: the viewer borrowed their share.
  assert.deepEqual(billEffect({ amount: 132.4, paidBy: "dan", shares: shares({ dan: 33.1, me: 33.1, aisha: 66.2 }) }, "me"), { kind: "borrowed", amount: 33.1 });
  // The viewer paid: they lent the others' shares.
  assert.deepEqual(billEffect({ amount: 180, paidBy: "me", shares: shares({ me: 45, dan: 67.5, aisha: 67.5 }) }, "me"), { kind: "lent", amount: 135 });
  // Paid for others only: all of it was lent.
  assert.deepEqual(billEffect({ amount: 20, paidBy: "me", shares: shares({ dan: 20 }) }, "me"), { kind: "lent", amount: 20 });
  // Paid and theirs alone: the whole bill.
  assert.deepEqual(billEffect({ amount: 24.4, paidBy: "me", shares: shares({ me: 24.4 }) }, "me"), { kind: "paid", amount: 24.4 });
  // Not on it, or not a member.
  assert.deepEqual(billEffect({ amount: 20, paidBy: "aisha", shares: shares({ aisha: 10, dan: 10 }) }, "me"), { kind: "none" });
  assert.deepEqual(billEffect({ amount: 20, paidBy: "aisha", shares: shares({ aisha: 20 }) }, null), { kind: "none" });
  // Shares in cents add up without float drift.
  assert.deepEqual(billEffect({ amount: 0.3, paidBy: "me", shares: shares({ me: 0.1, dan: 0.1, aisha: 0.1 }) }, "me"), { kind: "lent", amount: 0.2 });
});

test("paying one simplified debt, or part of it, leaves every other debt as it was, as in the app", () => {
  // m0 and m2 owe on m4's bill, m0 and m1 on m2's.
  const bills = [bill("rent", "m4", { m0: 20, m2: 30 }), bill("food", "m2", { m0: 10, m1: 30 })];
  const group = { bills, payments: [] as Payment[], simplify: true };
  const before = simplifyDebts(openShares(bills, []));
  // Nobody in the middle: whoever owes only pays.
  assert.ok(!before.some((debt) => before.some((other) => other.from === debt.to)));
  for (const debt of before) {
    for (const amount of [debt.amount, debt.amount / 2]) {
      const rows = settleRows(group, { ...debt, amount }, "2026-11-15");
      const paid = { ...group, payments: rows.map(({ row }, n) => pay(`r.${n}`, String(row.expense_id), String(row.from_member), String(row.to_member), Number(row.amount))) };
      const after = simplifyDebts(openShares(bills, paid.payments));
      const expected = before.map((item) => (item === debt ? { ...item, amount: item.amount - amount } : item)).filter((item) => item.amount > 0);
      assert.deepEqual(after, expected);
    }
  }
});

test("a debt across more bills than one change takes is paid as far as fits", () => {
  const bills = Array.from({ length: 2500 }, (_, n) => bill(`b${n}`, "a", { a: 1, b: 1 }));
  const group = { bills, payments: [] as Payment[], simplify: true };
  const rows = settleRows(group, { from: "b", to: "a", currency: "MYR", amount: 2500 }, "2026-11-15");
  assert.equal(rows.length, 2000);
  assert.equal(paidFrom(rows.map(({ row }) => ({ from: String(row.from_member), to: String(row.to_member), amount: Number(row.amount) })), "b"), 2000);
});

test("a big even group closes in parts of whole circles, staying even in between", () => {
  const bills = Array.from({ length: 2400 }, (_, n) => bill(`b${n}`, ["a", "b", "c"][n % 3], { [["b", "c", "a"][n % 3]]: 1 }));
  let payments: Payment[] = [];
  for (let part = 0; part < 5; part += 1) {
    const rows = evenGroupRows({ bills, payments, simplify: true, album: { ledgerId: "bali" } }, "2026-11-15");
    if (!rows.length) break;
    assert.ok(rows.length <= 2000);
    payments = payments.concat(rows.map(({ row }) => pay(String(row.id), String(row.expense_id), String(row.from_member), String(row.to_member), Number(row.amount))));
    assert.deepEqual(simplifyDebts(openShares(bills, payments)), []);
  }
  assert.deepEqual(openShares(bills, payments), []);
});

test("the debt plan is the app's, line for line, and so is the row limit", async () => {
  // Phones and the website must list the same debts and close an even group with the same rows.
  const { readFile } = await import("node:fs/promises");
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const plan = (source: string) => source.slice(source.indexOf("/** A path of members from `from` to `to`"));
  const [app, web] = await Promise.all([read("../../../../mobile/features/albums/lib/groupDebts.ts"), read("./debts.ts")]);
  assert.equal(plan(web), plan(app));
  const limit = (source: string) => source.match(/MAX_WRITE_ROWS = (\d+)/)?.[1];
  const [appPlan, webWrites] = await Promise.all([read("../../../../mobile/features/albums/lib/groupPlan.ts"), read("./writes.ts")]);
  assert.equal(limit(webWrites), limit(appPlan));
});
